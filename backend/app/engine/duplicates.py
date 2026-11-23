"""Duplicate-invoice detection. The LATER document is flagged."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

from app.engine.evidence import step
from app.models.domain import EvidenceStep
from app.money import fmt_naira
from app.normalize import invoice_no_fold, vendor_norm
from app.rules.loader import Policies


@dataclass(frozen=True)
class DupCandidate:
    invoice_id: int
    doc_label: str
    vendor_name: str
    number: str
    date: date
    total: Decimal


def name_score(a: str, b: str) -> Decimal:
    """token_sort_ratio on normalized vendor names, as Decimal (2 dp)."""
    return Decimal(str(round(fuzz.token_sort_ratio(vendor_norm(a), vendor_norm(b)), 2)))


def number_distance(a: str, b: str) -> int:
    return Levenshtein.distance(invoice_no_fold(a), invoice_no_fold(b))


def pair_details(a: DupCandidate, b: DupCandidate, policies: Policies) -> dict:
    score = name_score(a.vendor_name, b.vendor_name)
    dist = number_distance(a.number, b.number)
    days = abs((a.date - b.date).days)
    checks = {
        "name": score >= Decimal(policies.i("DUP_FUZZY_MIN")),
        "amount": a.total == b.total,
        "number": dist <= 1,
        "window": days <= policies.i("DUP_WINDOW_DAYS"),
    }
    return {"score": score, "distance": dist, "days": days, "checks": checks, "duplicate": all(checks.values())}


def is_duplicate_pair(a: DupCandidate, b: DupCandidate, policies: Policies) -> bool:
    """Symmetric predicate."""
    return pair_details(a, b, policies)["duplicate"]


def _earlier(a: DupCandidate, b: DupCandidate) -> bool:
    return (a.date, a.invoice_id) < (b.date, b.invoice_id)


def find_duplicate(
    inv: DupCandidate, others: list[DupCandidate], policies: Policies
) -> tuple[DupCandidate | None, list[EvidenceStep]]:
    for o in sorted(others, key=lambda c: (c.date, c.invoice_id)):
        if o.invoice_id == inv.invoice_id or not _earlier(o, inv):
            continue
        d = pair_details(o, inv, policies)
        if d["duplicate"]:
            return o, [step(
                "CTRL_DUPLICATE", field="invoice_number", source_doc=inv.doc_label,
                policy=f"DUP_FUZZY_MIN={policies.s('DUP_FUZZY_MIN')}; DUP_WINDOW_DAYS={policies.s('DUP_WINDOW_DAYS')}",
                inputs={
                    "earlier_doc": o.doc_label, "earlier_vendor": o.vendor_name, "this_vendor": inv.vendor_name,
                    "earlier_no": o.number, "this_no": inv.number,
                    "earlier_total": fmt_naira(o.total), "this_total": fmt_naira(inv.total),
                },
                computation=(f"name token_sort_ratio {d['score']} ≥ {policies.s('DUP_FUZZY_MIN')}; amounts equal; "
                             f"folded invoice-no distance {d['distance']} ≤ 1; {d['days']} days ≤ {policies.s('DUP_WINDOW_DAYS')}"),
                result=f"duplicate of {o.doc_label}: hold full gross {fmt_naira(inv.total)}",
            )]
    return None, []
