"""Withholding tax on the APPROVED base. Pure, Decimal-only."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.engine.evidence import step
from app.models.domain import EvidenceStep
from app.models.enums import RuleStatus, WhtCategory
from app.money import ZERO, fmt_naira, pct, q
from app.rules.loader import Policies, PolicyRequired, rules


def wht_rate(
    category: WhtCategory, has_tin: bool, policies: Policies, source_doc: str | None = None
) -> tuple[Decimal, list[EvidenceStep]]:
    rp = rules()
    steps: list[EvidenceStep] = []
    if category == WhtCategory.RENT:
        rent = policies.opt_d("WHT_RENT_RATE")
        if rent is None:
            raise PolicyRequired("WHT_RENT_RATE", "rent WHT rate conflicts between sources (5% vs 10%); buyer must set WHT_RENT_RATE")
        rate, status, pol = rent, RuleStatus.CONFLICTING, f"WHT_RENT_RATE={policies.s('WHT_RENT_RATE')}"
    elif category == WhtCategory.OTHER:
        raise PolicyRequired("WHT_RATES.OTHER", "no WHT rate in the register for category OTHER")
    else:
        base, status = rp.wht_entry(category)
        assert base is not None
        rate, pol = base, None
    steps.append(step(
        "WHT_RATES", field="wht_category", source_doc=source_doc, status=status, policy=pol,
        inputs={"category": category.value},
        computation=f"register rate for {category.value}", result=pct(rate, 1),
    ))
    if policies.on("WHT_SMALL_PAYER_EXEMPT") and policies.on("BUYER_IS_SMALL_COMPANY"):
        steps.append(step(
            "WHT_SMALL_PAYER_EXEMPT", source_doc=source_doc, policy="WHT_SMALL_PAYER_EXEMPT=ON",
            computation="small-company payer exemption applied", result="0%",
        ))
        return ZERO, steps
    if not has_tin and policies.on("WHT_NO_TIN_DOUBLE"):
        mult = rp.dec("WHT_NO_TIN_DOUBLE")
        doubled = rate * mult
        steps.append(step(
            "WHT_NO_TIN_DOUBLE", field="vendor_tin", source_doc=source_doc, policy="WHT_NO_TIN_DOUBLE=ON",
            inputs={"vendor_tin": "MISSING", "base_rate": pct(rate, 1)},
            computation=f"{pct(rate, 1)} × {mult}", result=pct(doubled, 1),
        ))
        rate = doubled
    return rate, steps


def compute_wht(
    base_by_category: dict[WhtCategory, Decimal],
    has_tin: bool,
    policies: Policies,
    source_doc: str | None = None,
) -> tuple[Decimal, list[EvidenceStep]]:
    total = ZERO
    steps: list[EvidenceStep] = []
    for cat, base in base_by_category.items():
        rate, s = wht_rate(cat, has_tin, policies, source_doc)
        steps.extend(s)
        amt = q(base * rate)
        steps.append(step(
            "WHT_RATES", field="wht_to_remit", source_doc=source_doc,
            status=s[0].status,
            inputs={"approved_base": fmt_naira(base), "rate": pct(rate, 1)},
            computation=f"q({fmt_naira(base)} × {pct(rate, 1)})", result=fmt_naira(amt),
        ))
        total += amt
    return total, steps


def remittance_due(payment_date: date) -> date:
    """21st of the month following the (proposed) payment date. NTAA 2025 s.107(1)."""
    day = int(str(rules().get("WHT_REMITTANCE").value["due_day"]))
    y, m = (payment_date.year + 1, 1) if payment_date.month == 12 else (payment_date.year, payment_date.month + 1)
    return date(y, m, day)
