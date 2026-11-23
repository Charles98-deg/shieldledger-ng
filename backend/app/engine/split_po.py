"""Approval-limit splitting: ≥2 near-limit POs, same vendor, rolling window, sum > limit."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.engine.evidence import step
from app.models.domain import EvidenceStep, PurchaseOrder
from app.money import fmt_naira, q
from app.rules.loader import Policies


@dataclass
class SplitHit:
    po_id: str
    vendor_id: str
    amount: Decimal
    cluster: list[str]
    cluster_sum: Decimal
    steps: list[EvidenceStep] = field(default_factory=list)


def band(policies: Policies) -> tuple[Decimal, Decimal]:
    limit = policies.d("PO_APPROVAL_LIMIT")
    return q(limit * policies.d("SPLIT_BAND_LOW")), q(limit * policies.d("SPLIT_BAND_HIGH"))


def in_band(amount: Decimal, policies: Policies) -> bool:
    lo, hi = band(policies)
    return lo <= amount <= hi


def cluster_exceeds(total: Decimal, policies: Policies) -> bool:
    return total > policies.d("PO_APPROVAL_LIMIT")


def detect(pos: list[PurchaseOrder], vendor_names: dict[str, str], policies: Policies) -> list[SplitHit]:
    window = policies.i("SPLIT_WINDOW_DAYS")
    limit = policies.d("PO_APPROVAL_LIMIT")
    lo, hi = band(policies)
    by_vendor: dict[str, list[PurchaseOrder]] = {}
    for po in pos:
        if in_band(po.total_amount, policies):
            by_vendor.setdefault(po.vendor_id, []).append(po)

    hits: dict[str, SplitHit] = {}
    for vendor_id, cands in by_vendor.items():
        cands.sort(key=lambda p: (p.po_date, p.id))
        for i, start in enumerate(cands):
            cluster = [p for p in cands[i:] if (p.po_date - start.po_date).days <= window]
            total = sum((p.total_amount for p in cluster), Decimal("0"))
            if len(cluster) >= 2 and cluster_exceeds(total, policies):
                ids = [p.id for p in cluster]
                for p in cluster:
                    if p.id in hits:
                        continue
                    hits[p.id] = SplitHit(p.id, vendor_id, p.total_amount, ids, total, [step(
                        "CTRL_SPLIT_PO", field="purchase_orders", source_doc=p.id,
                        policy=(f"PO_APPROVAL_LIMIT={policies.s('PO_APPROVAL_LIMIT')}; band [{policies.s('SPLIT_BAND_LOW')}, "
                                f"{policies.s('SPLIT_BAND_HIGH')}]; SPLIT_WINDOW_DAYS={window}"),
                        inputs={"vendor": vendor_names.get(vendor_id, vendor_id),
                                **{c.id: f"{fmt_naira(c.total_amount)} on {c.po_date}" for c in cluster}},
                        computation=(f"{len(cluster)} POs in band {fmt_naira(lo)}–{fmt_naira(hi)} within {window} days; "
                                     f"sum {fmt_naira(total)} > limit {fmt_naira(limit)}"),
                        result="SPLIT_PO_SUSPECTED",
                    )])
    return sorted(hits.values(), key=lambda h: h.po_id)
