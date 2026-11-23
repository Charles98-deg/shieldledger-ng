"""Use-cases that span repositories + engines: evaluate a run, build the summary."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import date
from decimal import Decimal

from app import audit
from app.engine import ghost_vendor, split_po
from app.engine.decide import InvoiceContext, decide
from app.engine.duplicates import DupCandidate
from app.models.domain import Decision, EvidenceStep, Flag
from app.models.enums import DecisionStatus, FlagCode
from app.models.raw import RawInvoice
from app.models.verified import VerifiedInvoice
from app.money import ZERO, from_db, to_str
from app.normalize import po_norm
from app.repo import decisions as dec_repo
from app.repo import documents as docs
from app.repo import master
from app.repo import policies as policy_repo


def _snippets(raw_json: str | None) -> dict[str, str]:
    if not raw_json:
        return {}
    raw = RawInvoice.model_validate_json(raw_json)
    out = {}
    for name in ("vendor_name", "vendor_tin", "invoice_number", "po_reference", "subtotal", "vat_amount", "total_amount"):
        s = getattr(raw, name).raw_snippet
        if s:
            out[name] = s
    for i, ln in enumerate(raw.line_items, start=1):
        if ln.amount.raw_snippet:
            out[f"line[{i}]"] = ln.amount.raw_snippet
    return out


def evaluate_all(conn: sqlite3.Connection, today: date, actor: str = "ui") -> list[Decision]:
    policies = policy_repo.load(conn)
    pos = master.po_index(conn)
    grns = master.grns_by_po(conn)
    reg = master.registry(conn)
    rows = docs.invoices(conn)

    verified: dict[int, VerifiedInvoice] = {}
    for r in rows:
        if r["verified_json"] and r["status_gate"] == "PASSED":
            verified[r["id"]] = VerifiedInvoice.model_validate_json(r["verified_json"])
    labels = {r["id"]: r["filename"].rsplit(".", 1)[0] for r in rows}
    cands = [DupCandidate(i, labels[i], v.vendor_name, v.invoice_number, v.invoice_date, v.total_amount)
             for i, v in verified.items()]

    out: list[Decision] = []
    for r in rows:
        gate = json.loads(r["gate_flags_json"] or "[]")
        snippets = _snippets(r["raw_json"])
        po = pos.get(po_norm(r["po_reference"]) or "")
        ctx = InvoiceContext(
            invoice_id=r["id"], doc_label=labels[r["id"]], vendor_name=r["vendor_name"] or "(unreadable)",
            invoice=verified.get(r["id"]), printed_total=from_db(r["total"]),
            gate_flags=[Flag.model_validate(g["flag"]) for g in gate],
            gate_steps=[EvidenceStep.model_validate(g["step"]) for g in gate],
            po=po, grns=grns.get(po.id, {}) if po else {}, registry=reg, others=cands,
            policies=policies, payment_date=today, snippets=snippets,
        )
        out.append(decide(ctx))

    names = master.vendor_names(conn)
    for hit in split_po.detect(master.purchase_orders(conn), names, policies):
        out.append(Decision(
            kind="PO_PATTERN", subject_id=hit.po_id, doc_label=hit.po_id, vendor_name=names.get(hit.vendor_id, hit.vendor_id),
            status=DecisionStatus.HOLD, gross=hit.amount, blocked_or_hold=hit.amount, pending_verification=hit.amount,
            excluded_from_totals=True,
            flags=[Flag(code=FlagCode.SPLIT_PO_SUSPECTED, detail=f"cluster {', '.join(hit.cluster)} sums {to_str(hit.cluster_sum)}")],
            evidence=hit.steps))
    for g in ghost_vendor.detect(master.vendors(conn), master.employees(conn)):
        out.append(Decision(
            kind="VENDOR_PATTERN", subject_id=g.vendor_id, doc_label=g.vendor_id, vendor_name=g.vendor_name,
            status=DecisionStatus.HOLD, excluded_from_totals=True,
            flags=[Flag(code=FlagCode.GHOST_VENDOR_SUSPECTED, detail=f"{'+'.join(g.matched_on)} matches payroll {g.emp_id}")],
            evidence=g.steps))

    dec_repo.replace_all(conn, out)
    for d in out:
        audit.append(conn, "DECISION_MADE", d.kind.lower(), d.subject_id,
                     {"label": d.doc_label, "status": d.status.value, "flags": sorted(d.flag_codes()),
                      "gross": to_str(d.gross), "net_safe_payable": to_str(d.net_safe_payable),
                      "wht_to_remit": to_str(d.wht_to_remit), "blocked_or_hold": to_str(d.blocked_or_hold)}, actor)
    digest = hashlib.sha256("".join(d.model_dump_json(exclude={"evidence"}) for d in out).encode()).hexdigest()
    audit.append(conn, "RUN_EVALUATED", "run", today.isoformat(), {"decisions": len(out), "digest": digest}, actor)
    return out


def summary(decs: list[Decision]) -> dict:
    inv = [d for d in decs if d.kind == "INVOICE" and not d.excluded_from_totals]

    def s(attr: str) -> Decimal:
        return sum((getattr(d, attr) for d in inv), ZERO)

    def exp(rule_id: str) -> Decimal:
        return sum((e.amount for d in inv for e in d.contingent_exposures if e.rule_id == rule_id), ZERO)

    vat_id, overpay = s("recoverable_input_vat"), s("overpayment_blocked")
    s100, s105 = exp("UNREGISTERED_CONTRACTOR_FINE"), exp("WHT_FAILURE_TO_DEDUCT")
    gross, net, wht, held = s("gross"), s("net_safe_payable"), s("wht_to_remit"), s("blocked_or_hold")
    return {
        "direct_cash": {"input_vat_identified": to_str(vat_id), "overpayments_blocked": to_str(overpay),
                        "total": to_str(vat_id + overpay)},
        "contingent_fines_blocked": {"unregistered_contractor_s100_2": to_str(s100), "failure_to_deduct_s105": to_str(s105),
                                     "total": to_str(s100 + s105)},
        "pending_verification_holds": to_str(s("pending_verification")),
        "advisories": {"vat_self_account": to_str(s("advisory_self_account"))},
        "conservation": {"gross": to_str(gross), "net_safe_payable": to_str(net), "wht_to_remit": to_str(wht),
                         "blocked_or_hold": to_str(held), "ok": net + wht + held == gross},
        "needs_review_count": sum(1 for d in decs if d.kind == "INVOICE" and d.status == DecisionStatus.NEEDS_HUMAN_REVIEW),
        "invoice_count": sum(1 for d in decs if d.kind == "INVOICE"),
        "pattern_flags": sum(1 for d in decs if d.kind != "INVOICE"),
    }
