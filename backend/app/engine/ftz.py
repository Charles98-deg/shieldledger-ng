"""Free-trade-zone domestic-sales monitor. All Decimal.

Money derived from the share (interpretation A) uses the EXACT ratio D/T; the
6-dp share is for display/band evidence only. (Using the 6-dp share would move
interpretation A at the +₦25M scenario from ₦15,160,975.61 to ₦15,160,980.00.)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.engine.evidence import step
from app.models.enums import FtzBand, FtzClass
from app.money import KOBO, ZERO, fmt_naira, q, q_floor, to_str
from app.rules.loader import Policies, rules

SIX_DP = Decimal("0.000001")
B_SAFE = Decimal("0.18")
B_WATCH = Decimal("0.22")


@dataclass(frozen=True)
class LedgerRow:
    id: str
    period: str
    classification: FtzClass
    customer: str
    invoice_ref: str
    amount: Decimal
    related_party_outsourced: bool = False


def limit() -> Decimal:
    return rules().dec("FTZ_DOMESTIC_THRESHOLD")


def totals(rows: list[LedgerRow]) -> dict[FtzClass, Decimal]:
    out = {c: ZERO for c in FtzClass}
    for r in rows:
        out[r.classification] += r.amount
    return out


def share(domestic: Decimal, total: Decimal) -> Decimal:
    return domestic / total if total > ZERO else ZERO


def band(s: Decimal, boundary: str) -> FtzBand:
    lim = limit()
    if s < B_SAFE:
        return FtzBand.SAFE
    if s < B_WATCH:
        return FtzBand.WATCH
    breached = s >= lim if boundary == "AT_OR_ABOVE_BREACH" else s > lim
    if breached:
        return FtzBand.BREACHED
    return FtzBand.CRITICAL


def is_breach(d: Decimal, t: Decimal, boundary: str) -> bool:
    s = share(d, t)
    return s >= limit() if boundary == "AT_OR_ABOVE_BREACH" else s > limit()


def headroom(d: Decimal, t: Decimal, boundary: str) -> Decimal:
    """Largest kobo X of extra domestic sales (added to D and T) that is not a breach."""
    lim = limit()
    if is_breach(d, t, boundary):
        return ZERO
    x = q_floor((lim * t - d) / (1 - lim))
    while x > ZERO and is_breach(d + x, t + x, boundary):
        x -= KOBO
    return max(x, ZERO)


def interpretations(profit: Decimal, d: Decimal, t: Decimal) -> dict[str, str]:
    cit = rules().dec("FTZ_CIT_RATE")
    a = q(profit * d * cit / t) if t > ZERO else ZERO
    b = q(profit * cit)
    return {"A_domestic_attributable": to_str(a), "B_all_profit": to_str(b)}


def _pct2(s: Decimal) -> str:
    return f"{(s * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}%"


def _pct4(s: Decimal) -> str:
    return f"{(s * 100).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)}%"


def position(d: Decimal, t: Decimal, policies: Policies, profit: Decimal | None = None) -> dict:
    boundary = policies.s("FTZ_BOUNDARY")
    s = share(d, t)
    prof = profit if profit is not None else policies.d("FTZ_ILLUSTRATIVE_PROFIT")
    out = {
        "domestic": to_str(d),
        "total": to_str(t),
        "share": str(s.quantize(SIX_DP, rounding=ROUND_HALF_UP)),
        "share_pct": _pct2(s),
        "share_pct_4dp": _pct4(s),
        "band": band(s, boundary).value,
        "boundary": boundary,
        "headroom": to_str(headroom(d, t, boundary)),
        "illustrative_profit": to_str(prof),
        "interpretations": interpretations(prof, d, t),
    }
    if policies.on("MIN_ETR_ENABLED"):
        out["min_etr_info"] = to_str(q(prof * rules().dec("MIN_ETR_15")))
    return out


def summary(rows: list[LedgerRow], policies: Policies, today: date) -> dict:
    tot = totals(rows)
    exp, intra, dom = tot[FtzClass.EXPORT], tot[FtzClass.INTRA_ZONE], tot[FtzClass.DOMESTIC_CUSTOMS_TERRITORY]
    total_sales = sum((r.amount for r in rows), ZERO)
    assert exp + intra + dom == total_sales, "FTZ classification does not conserve"
    sunset = date.fromisoformat(str(rules().get("FTZ_SUNSET").value))
    pos = position(dom, total_sales, policies)
    rp = rules()
    cited = ["FTZ_DOMESTIC_THRESHOLD", "FTZ_SUNSET", "FTZ_ARMS_LENGTH_OUTSOURCING", "FTZ_CIT_RATE", "MIN_ETR_15"]
    return {
        "classification": {"EXPORT": to_str(exp), "INTRA_ZONE": to_str(intra),
                           "DOMESTIC_CUSTOMS_TERRITORY": to_str(dom), "TOTAL": to_str(total_sales),
                           "conserved": exp + intra + dom == total_sales},
        **pos,
        "bands": {"SAFE_below": "0.18", "WATCH_below": "0.22", "CRITICAL_below": "0.25"},
        "sunset": {"date": sunset.isoformat(), "days_remaining": (sunset - today).days,
                   "status": rp.get("FTZ_SUNSET").status.value},
        "arms_length_flags": sum(1 for r in rows if r.related_party_outsourced),
        "rules": [{"id": i, "cite": rp.get(i).cite, "status": rp.get(i).status.value, "note": rp.get(i).note} for i in cited],
        "evidence": [step(
            "FTZ_DOMESTIC_THRESHOLD", field="share", policy=f"FTZ_BOUNDARY={policies.s('FTZ_BOUNDARY')}",
            inputs={"domestic": fmt_naira(dom), "total": fmt_naira(total_sales)},
            computation=f"{fmt_naira(dom)} / {fmt_naira(total_sales)}", result=f"{pos['share_pct']} ⇒ {pos['band']}",
        ).model_dump(mode="json")],
        "ledger": [{"id": r.id, "period": r.period, "classification": r.classification.value, "customer": r.customer,
                    "invoice_ref": r.invoice_ref, "amount": to_str(r.amount),
                    "related_party_outsourced": r.related_party_outsourced} for r in rows],
    }
