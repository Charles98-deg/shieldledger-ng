"""VAT checks. Supply type comes from the PO line (deterministic), never the LLM."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.engine.evidence import step
from app.models.domain import EvidenceStep, Flag, RegistryEntry
from app.models.enums import FlagCode
from app.money import DOC_TOL, ZERO, fmt_naira, q
from app.rules.loader import Policies, rules


def vat_rate() -> Decimal:
    return rules().dec("VAT_RATE")


@dataclass
class VatResult:
    approved_vat: Decimal = ZERO
    recoverable: Decimal = ZERO
    advisory_self_account: Decimal = ZERO
    vat_hold_pending: Decimal = ZERO  # VAT held pending proof of VAT registration
    small_vendor_hold: bool = False
    flags: list[Flag] = field(default_factory=list)
    steps: list[EvidenceStep] = field(default_factory=list)


def evaluate_vat(
    *,
    printed_vat: Decimal,
    std_invoiced_base: Decimal,
    std_approved_base: Decimal,
    has_tin: bool,
    registry_entry: RegistryEntry | None,
    policies: Policies,
    source_doc: str | None,
    vat_snippet: str | None = None,
) -> VatResult:
    rate = vat_rate()
    res = VatResult()
    vat_charged = printed_vat > ZERO

    if not vat_charged:
        if std_invoiced_base > ZERO:
            adv = q(std_approved_base * rate)
            res.advisory_self_account = adv
            res.flags.append(Flag(code=FlagCode.VAT_OMITTED_SELF_ACCOUNT_ADVISORY,
                                  detail=f"VAT not charged on a STANDARD supply; advisory {fmt_naira(adv)} (not counted)"))
            res.steps.append(step(
                "VAT_SELF_ACCOUNT", field="vat_amount", source_doc=source_doc, raw_snippet=vat_snippet,
                inputs={"vat_treatment": "STANDARD", "printed_vat": "NOT CHARGED", "approved_base": fmt_naira(std_approved_base)},
                computation=f"q({fmt_naira(std_approved_base)} × 7.5%) — the Service MAY direct self-accounting",
                result=f"advisory {fmt_naira(adv)}; excluded from headline totals",
            ))
        else:
            res.steps.append(step(
                "VAT_EXEMPT_SUPPLIES", field="vat_amount", source_doc=source_doc, raw_snippet=vat_snippet,
                inputs={"vat_treatment": "EXEMPT/ZERO (from PO line)", "printed_vat": fmt_naira(printed_vat)},
                computation="no VAT expected on exempt/zero-rated supply", result="no VAT; no input VAT to recover",
            ))
        return res

    # INV-4: printed VAT vs 7.5% × subtotal is a note, not a review trigger
    expected = q(std_invoiced_base * rate)
    if abs(expected - printed_vat) > DOC_TOL:
        res.steps.append(step(
            "VAT_RATE", field="vat_amount", source_doc=source_doc, raw_snippet=vat_snippet,
            inputs={"printed_vat": fmt_naira(printed_vat), "expected": fmt_naira(expected)},
            computation="INV-4 note: printed VAT ≠ 7.5% × standard-rated subtotal",
            result="note only (vendor may be exempt/zero-rated on some lines)",
        ))

    if (
        registry_entry is not None
        and registry_entry.small_business
        and not registry_entry.vat_registered
        and policies.on("SMALL_VENDOR_VAT_HOLD")
    ):
        res.small_vendor_hold = True
        res.vat_hold_pending = printed_vat
        res.flags.append(Flag(code=FlagCode.INVALID_VAT_CHARGE_HOLD,
                              detail=f"small, non-VAT-registered vendor charged {fmt_naira(printed_vat)} VAT; VAT portion held pending proof of registration"))
        res.steps.append(step(
            "SMALL_BUSINESS_DEF", field="vendor_tin", source_doc=source_doc,
            inputs={"registry.small_business": "true", "registry.vat_registered": "false"},
            computation="vendor classified small business in (fictional) registry", result="small business",
        ))
        res.steps.append(step(
            "SMALL_BUSINESS_VAT_EFFECT", field="vat_amount", source_doc=source_doc, raw_snippet=vat_snippet,
            policy="SMALL_VENDOR_VAT_HOLD=ON",
            inputs={"printed_vat": fmt_naira(printed_vat)},
            computation="hold VAT portion only; base released less WHT (consequence UNVERIFIED)",
            result=f"held {fmt_naira(printed_vat)}",
        ))
        return res

    computed = q(std_approved_base * rate)
    res.approved_vat = min(computed, printed_vat)
    res.steps.append(step(
        "VAT_RATE", field="approved_vat", source_doc=source_doc, raw_snippet=vat_snippet,
        inputs={"approved_base(standard)": fmt_naira(std_approved_base), "printed_vat": fmt_naira(printed_vat)},
        computation=f"min(q({fmt_naira(std_approved_base)} × 7.5%), printed VAT)",
        result=fmt_naira(res.approved_vat),
    ))

    if not has_tin:
        res.steps.append(step(
            "VAT_INVOICE_CONTENT", field="vendor_tin", source_doc=source_doc,
            inputs={"vendor_tin": "MISSING"},
            computation="valid VAT invoice must carry supplier Tax ID",
            result="VAT at risk: invoice invalid under s.153; recoverable input VAT = ₦0.00",
        ))
        return res
    if registry_entry is None:
        return res
    res.recoverable = res.approved_vat
    res.steps.append(step(
        "INPUT_VAT_RECOVERY", field="recoverable_input_vat", source_doc=source_doc,
        inputs={"approved_vat": fmt_naira(res.approved_vat), "vendor_on_registry": "true", "tin_on_invoice": "true"},
        computation="STANDARD supply, registered vendor, TIN on invoice, VAT charged ⇒ offset entitlement",
        result=f"{fmt_naira(res.recoverable)} identified for offset (not cash received)",
    ))
    return res
