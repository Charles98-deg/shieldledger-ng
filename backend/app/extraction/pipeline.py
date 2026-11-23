"""Intake → extraction → validation gates G1–G7. Every gate writes an audit event."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Callable

from pydantic import ValidationError
from rapidfuzz import fuzz

from app import audit
from app.config import ALLOWED_MIME, MAX_UPLOAD_BYTES, Settings
from app.engine.evidence import step
from app.extraction import gemini_client, offline_parser
from app.models.domain import EvidenceStep, Flag
from app.models.enums import CONFIDENCE_ORDER, Confidence, FlagCode
from app.models.raw import FieldValue, RawInvoice
from app.models.verified import InvoiceInvariantError, VerifiedInvoice
from app.money import MoneyParseError, ZERO, parse_money, parse_qty, to_str
from app.normalize import nuban_norm, parse_date, phone_norm, po_norm, tin_norm, vendor_norm
from app.repo import documents as docs
from app.repo import master
from app.repo import policies as policy_repo

MAGIC = {b"%PDF-": "application/pdf", b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}
CRITICAL_FIELDS = ("vendor_tin", "total_amount")


class IntakeError(Exception):
    def __init__(self, code: str, message: str, http_status: int):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


def sniff_mime(data: bytes) -> str | None:
    for magic, mime in MAGIC.items():
        if data.startswith(magic):
            return mime
    return None


Extractor = Callable[[bytes, str, Settings], tuple[RawInvoice, str, list[dict]]]


@dataclass
class Gated:
    flags: list[Flag] = field(default_factory=list)
    steps: list[EvidenceStep] = field(default_factory=list)

    def add(self, flag: Flag, s: EvidenceStep) -> None:
        self.flags.append(flag)
        self.steps.append(s)


def run_extraction(
    data: bytes, mime: str, settings: Settings, gemini: Extractor | None = None,
    breaker: gemini_client.Breaker | None = None,
) -> tuple[RawInvoice | None, str, list[dict]]:
    """G3: Gemini chain → offline parser. Returns (raw|None, engine, attempts).

    `breaker` is shared across one batch: after the first connectivity, auth or quota failure,
    the remaining documents skip Gemini (recorded as a skipped attempt, never silently).
    """
    gemini = gemini or gemini_client.extract
    breaker = breaker if breaker is not None else gemini_client.Breaker()
    attempts: list[dict] = []
    if gemini_client.available(settings) and breaker.is_open:
        attempts.append({"engine": "gemini", "ok": False, "skipped": True,
                         "error": f"circuit open for this batch after earlier failure: {breaker.reason}"})
    elif gemini_client.available(settings):
        breaker.calls += 1
        try:
            raw, model, att = gemini(data, mime, settings)
            breaker.ok_model = model
            return raw, f"gemini:{model}", att
        except gemini_client.GeminiUnavailable as gu:
            attempts.extend(gu.attempts)
            breaker.failures += 1
            if gu.fatal:  # connectivity / auth / quota: no point asking again in this batch
                breaker.trip(gu.attempts[-1]["error"][:200] if gu.attempts else str(gu))
        except Exception as exc:  # noqa: BLE001
            err = f"{type(exc).__name__}: {exc}"
            kind = gemini_client.classify(exc)
            attempts.append({"engine": "gemini", "ok": False, "kind": kind, "error": err})
            breaker.failures += 1
            if kind in gemini_client.FATAL_KINDS:
                breaker.trip(err[:200])
    else:
        attempts.append({"engine": "gemini", "ok": False, "error": "GEMINI_API_KEY not set"})
    if mime == "application/pdf":
        try:
            raw = offline_parser.parse_pdf(data)
            attempts.append({"engine": "offline_regex", "ok": True})
            return raw, "offline_regex", attempts
        except Exception as exc:  # noqa: BLE001
            attempts.append({"engine": "offline_regex", "ok": False, "error": f"{type(exc).__name__}: {exc}"})
            return None, "offline_regex", attempts
    attempts.append({"engine": "offline_regex", "ok": False, "error": "OFFLINE_NO_OCR: images need Gemini"})
    return None, "none", attempts


def _money_field(fv: FieldValue[str], name: str, errs: list[str], allow_not_charged: bool = False):
    if fv.value is None:
        errs.append(f"{name}: missing")
        return None
    if allow_not_charged and fv.value.strip().upper() in ("NOT CHARGED", "NIL", "NONE"):
        return ZERO
    try:
        return parse_money(fv.value)
    except MoneyParseError as exc:
        errs.append(f"{name}: {exc}")
        return None


def normalize(raw: RawInvoice) -> tuple[dict, list[str]]:
    """G4. Returns (normalized dict for VerifiedInvoice, errors)."""
    errs: list[str] = []
    out: dict = {
        "vendor_name": raw.vendor_name.value or "",
        "vendor_tin": raw.vendor_tin.value.strip() if raw.vendor_tin.value else None,
        "invoice_number": raw.invoice_number.value or "",
        "po_reference": raw.po_reference.value,
        "currency": (raw.currency.value or "NGN").upper().replace("₦", "NGN"),
        "bank_nuban": nuban_norm(raw.bank_nuban.value),
        "phone": phone_norm(raw.phone.value),
    }
    for req in ("vendor_name", "invoice_number"):
        if not out[req]:
            errs.append(f"{req}: missing")
    try:
        out["invoice_date"] = parse_date(raw.invoice_date.value)
    except ValueError as exc:
        errs.append(f"invoice_date: {exc}")
    out["subtotal"] = _money_field(raw.subtotal, "subtotal", errs)
    vat = _money_field(raw.vat_amount, "vat_amount", errs, allow_not_charged=True)
    out["vat_amount"] = vat
    out["vat_charged"] = vat is not None and vat > ZERO
    out["total_amount"] = _money_field(raw.total_amount, "total_amount", errs)
    lines = []
    for i, ln in enumerate(raw.line_items, start=1):
        try:
            lines.append({
                "description": ln.description.value or "",
                "quantity": parse_qty(ln.quantity.value or ""),
                "unit_price": parse_money(ln.unit_price.value or ""),
                "amount": parse_money(ln.amount.value or ""),
            })
        except MoneyParseError as exc:
            errs.append(f"line[{i}]: {exc}")
    if not raw.line_items:
        errs.append("line_items: none found")
    out["lines"] = lines
    return out, errs


def resolve_vendor(name: str, tin: str | None, vendor_list) -> tuple[str | None, str | None, str]:
    """G7. (resolved_id, candidate_id, explanation)."""
    n = vendor_norm(name)
    t = tin_norm(tin)
    if t:
        for v in vendor_list:
            if tin_norm(v.tin) == t and fuzz.token_set_ratio(n, vendor_norm(v.name)) >= 85:
                return v.id, None, f"TIN exact + name match → {v.id}"
    best, score = None, 0
    for v in vendor_list:
        s = fuzz.token_set_ratio(n, vendor_norm(v.name))
        if s > score:
            best, score = v, s
    if best and score >= 92:
        return best.id, None, f"name token_set_ratio {round(score)} ≥ 92 → {best.id}"
    if best and score >= 85:
        return None, best.id, f"name token_set_ratio {round(score)} in 85–91 → candidate {best.id} (not merged)"
    return None, None, "no vendor-master match"


def ingest(
    conn: sqlite3.Connection,
    data: bytes,
    filename: str,
    settings: Settings,
    today: date,
    gemini: Extractor | None = None,
    actor: str = "ui",
    breaker: gemini_client.Breaker | None = None,
) -> dict:
    # G1 idempotency
    sha = hashlib.sha256(data).hexdigest()
    existing = docs.by_sha(conn, sha)
    if existing:
        audit.append(conn, "DOCUMENT_REPLAYED", "document", existing["id"], {"sha256": sha, "filename": filename}, actor)
        return {"document_id": existing["id"], "filename": existing["filename"], "sha256": sha, "idempotent_replay": True}

    # G2 intake limits
    if len(data) > MAX_UPLOAD_BYTES:
        audit.append(conn, "INTAKE_REJECTED", "upload", filename, {"reason": "TOO_LARGE", "size": len(data)}, actor)
        raise IntakeError("TOO_LARGE", f"{filename}: {len(data)} bytes exceeds 10 MB", 413)
    mime = sniff_mime(data)
    if mime not in ALLOWED_MIME:
        audit.append(conn, "INTAKE_REJECTED", "upload", filename, {"reason": "UNSUPPORTED_TYPE"}, actor)
        raise IntakeError("UNSUPPORTED_TYPE", f"{filename}: not a PDF/PNG/JPEG by magic bytes", 415)
    doc_id = docs.insert_document(conn, sha, Path(filename).name, mime, len(data))
    audit.append(conn, "DOCUMENT_INGESTED", "document", doc_id, {"sha256": sha, "filename": filename, "mime": mime, "size": len(data)}, actor)
    label = Path(filename).stem
    g = Gated()

    # G3 extraction
    raw, engine, attempts = run_extraction(data, mime, settings, gemini, breaker)
    docs.insert_extraction(conn, doc_id, engine, (raw or RawInvoice()).model_dump_json(), attempts)
    audit.append(conn, "GATE_G3_EXTRACTION", "document", doc_id, {"engine": engine, "attempts": attempts}, actor)
    if raw is None:
        g.add(Flag(code=FlagCode.OFFLINE_NO_OCR, detail="image upload with no Gemini available; no OCR offline"),
              step("CTRL_INTAKE", field="document", source_doc=label, inputs={"mime": mime, "engine": engine},
                   computation="offline parser handles text PDFs only", result="NEEDS_HUMAN_REVIEW (OFFLINE_NO_OCR)"))
        raw = RawInvoice()

    # G4 normalize
    norm, errs = normalize(raw)
    audit.append(conn, "GATE_G4_NORMALIZE", "document", doc_id, {"errors": errs}, actor)
    if errs and not any(f.code == FlagCode.OFFLINE_NO_OCR for f in g.flags):
        g.add(Flag(code=FlagCode.VALIDATION_FAILURE, detail="; ".join(errs)),
              step("CTRL_FOOTING", field="normalize", source_doc=label, inputs={"errors": "; ".join(errs)},
                   computation="G4 normalization", result="NEEDS_HUMAN_REVIEW"))

    # G5 strict validation
    verified: VerifiedInvoice | None = None
    if not errs:
        try:
            verified = VerifiedInvoice.model_validate(norm, context={"today": today})
        except ValidationError as ve:
            err = ve.errors()[0]
            cause = (err.get("ctx") or {}).get("error")
            code = cause.code if isinstance(cause, InvoiceInvariantError) else "SCHEMA"
            msg = str(cause) if cause else err["msg"]
            fc = FlagCode.FOOTING_FAILURE if code in ("INV-1", "INV-2") else FlagCode.VALIDATION_FAILURE
            snip = raw.total_amount.raw_snippet if code == "INV-2" else raw.subtotal.raw_snippet
            g.add(Flag(code=fc, detail=msg),
                  step("CTRL_FOOTING", field="total_amount" if code == "INV-2" else "subtotal", source_doc=label,
                       raw_snippet=snip,
                       inputs={k: to_str(norm[k]) for k in ("subtotal", "vat_amount", "total_amount") if norm.get(k) is not None},
                       computation=msg, result="NEEDS_HUMAN_REVIEW; excluded from totals"))
    audit.append(conn, "GATE_G5_VALIDATE", "document", doc_id,
                 {"ok": verified is not None, "flags": [f.code.value for f in g.flags]}, actor)

    # G6 confidence on critical fields (GRN delivered qty comes from the ERP seed: HIGH by construction)
    min_conf = policy_repo.load(conn).min_confidence()
    low = [f for f in CRITICAL_FIELDS if CONFIDENCE_ORDER[getattr(raw, f).confidence] < CONFIDENCE_ORDER[min_conf]]
    if low and not any(f.code == FlagCode.OFFLINE_NO_OCR for f in g.flags):
        g.add(Flag(code=FlagCode.LOW_CONFIDENCE_CRITICAL_FIELD, detail=f"low confidence: {', '.join(low)}"),
              step("CTRL_CONFIDENCE", field=",".join(low), source_doc=label, policy=f"LLM_MIN_CONFIDENCE={min_conf.value}",
                   raw_snippet=getattr(raw, low[0]).raw_snippet,
                   inputs={f: getattr(raw, f).confidence.value for f in low},
                   computation="critical field below minimum confidence", result="NEEDS_HUMAN_REVIEW"))
    audit.append(conn, "GATE_G6_CONFIDENCE", "document", doc_id, {"low_fields": low, "min": min_conf.value}, actor)

    # G7 entity resolution
    resolved, candidate, why = resolve_vendor(norm["vendor_name"], norm["vendor_tin"], master.vendors(conn))
    audit.append(conn, "GATE_G7_ENTITY", "document", doc_id,
                 {"resolved": resolved, "candidate": candidate, "why": why, "po_norm": po_norm(norm.get("po_reference"))}, actor)

    status_gate = "PASSED" if not g.flags else "REVIEW"
    inv_id = docs.insert_invoice(conn, {
        "document_id": doc_id,
        "vendor_name": norm["vendor_name"],
        "vendor_norm": vendor_norm(norm["vendor_name"]),
        "vendor_resolved_id": resolved,
        "vendor_candidate_id": candidate,
        "number": norm["invoice_number"],
        "date": norm["invoice_date"].isoformat() if norm.get("invoice_date") else None,
        "currency": norm["currency"],
        "po_reference": norm.get("po_reference"),
        "subtotal": to_str(norm["subtotal"]) if norm.get("subtotal") is not None else None,
        "vat_amount": to_str(norm["vat_amount"]) if norm.get("vat_amount") is not None else None,
        "total": to_str(norm["total_amount"]) if norm.get("total_amount") is not None else None,
        "tin": norm["vendor_tin"],
        "nuban": norm["bank_nuban"],
        "phone": norm["phone"],
        "status_gate": status_gate,
        "gate_flags_json": json.dumps([{"flag": f.model_dump(mode="json"), "step": s.model_dump(mode="json")}
                                       for f, s in zip(g.flags, g.steps)]),
        "verified_json": verified.model_dump_json() if verified else None,
    })
    return {"document_id": doc_id, "invoice_id": inv_id, "filename": Path(filename).name, "sha256": sha,
            "idempotent_replay": False, "engine": engine, "status_gate": status_gate,
            "gate_flags": [f.code.value for f in g.flags], "vendor_resolution": why}
