from __future__ import annotations

import csv
import io

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse

from app import service
from app.api.deps import read, today, write
from app.models.domain import Decision
from app.money import to_str
from app.repo import decisions as dec_repo
from app.repo import documents as docs

router = APIRouter(tags=["runs"])


def _rows(conn) -> list[dict]:
    meta = {d["invoice_id"]: d for d in docs.list_documents(conn) if d.get("invoice_id")}
    out = []
    for d in dec_repo.all_decisions(conn):
        row = d.model_dump(mode="json", exclude={"evidence"} if d.kind == "INVOICE" else None)
        row["evidence_count"] = len(d.evidence)
        m = meta.get(d.invoice_id) if d.invoice_id else None
        if m:
            row.update(document_id=m["id"], filename=m["filename"], engine=m["engine"],
                       vendor_resolved_id=m["vendor_resolved_id"], vendor_candidate_id=m["vendor_candidate_id"],
                       invoice_number=m["number"])
        out.append(row)
    return out


@router.post("/runs/evaluate")
def evaluate(request: Request) -> dict:
    with write(request) as conn:
        decs = service.evaluate_all(conn, today(request))
        return {"decisions": len(decs), "summary": service.summary(decs)}


@router.get("/decisions")
def decisions(request: Request) -> list[dict]:
    with read(request) as conn:
        return _rows(conn)


@router.get("/decisions/{invoice_id}/evidence")
def evidence(invoice_id: int, request: Request) -> dict:
    with read(request) as conn:
        steps = dec_repo.evidence_for_invoice(conn, invoice_id)
        doc = next((d for d in docs.list_documents(conn) if d.get("invoice_id") == invoice_id), None)
    if not steps:
        raise HTTPException(404, "no decision for invoice")
    return {"invoice_id": invoice_id, "document": doc, "evidence": steps}


@router.get("/summary")
def summary(request: Request) -> dict:
    with read(request) as conn:
        return service.summary(dec_repo.all_decisions(conn))


_CSV_COLS = ["kind", "doc_label", "vendor_name", "status", "gross", "approved_gross", "wht_to_remit", "net_safe_payable",
             "blocked_or_hold", "overpayment_blocked", "pending_verification", "recoverable_input_vat",
             "advisory_self_account", "excluded_from_totals", "remittance_due", "flags"]


@router.get("/export/decisions.csv", response_class=PlainTextResponse)
def export_csv(request: Request) -> PlainTextResponse:
    with read(request) as conn:
        decs: list[Decision] = dec_repo.all_decisions(conn)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(_CSV_COLS)
    for d in decs:
        w.writerow([d.kind, d.doc_label, d.vendor_name, d.status.value, *(to_str(getattr(d, c)) for c in _CSV_COLS[4:13]),
                    "true" if d.excluded_from_totals else "false", d.remittance_due.isoformat() if d.remittance_due else "",
                    ";".join(sorted(d.flag_codes()))])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=decisions.csv"})
