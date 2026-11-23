"""Orchestrates all engines into one Decision + evidence trail per invoice.

Order (spec §7.1):
 1 gate failures ⇒ NEEDS_HUMAN_REVIEW (excluded from totals)
 2 duplicate ⇒ HOLD full gross, stop
 3 registry guard (unregistered ⇒ BLOCKED, stop)
 4 PO/GRN 3-way match
 5 VAT checks
 6 WHT on approved base
 7 assemble amounts + conservation assertion
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.engine import match3way, registry_guard, vat, wht
from app.engine.duplicates import DupCandidate, find_duplicate
from app.engine.evidence import step
from app.models.domain import (
    GRN,
    ContingentExposure,
    Decision,
    EvidenceStep,
    Flag,
    PurchaseOrder,
    RegistryEntry,
)
from app.models.enums import DecisionStatus, FlagCode
from app.models.verified import VerifiedInvoice
from app.money import ZERO, fmt_naira, q
from app.rules.loader import Policies, PolicyRequired, rules


class ConservationError(AssertionError):
    pass


@dataclass
class InvoiceContext:
    invoice_id: int
    doc_label: str
    vendor_name: str
    invoice: VerifiedInvoice | None
    printed_total: Decimal
    gate_flags: list[Flag] = field(default_factory=list)
    gate_steps: list[EvidenceStep] = field(default_factory=list)
    po: PurchaseOrder | None = None
    grns: dict[int, GRN] = field(default_factory=dict)
    registry: dict[str, RegistryEntry] = field(default_factory=dict)
    others: list[DupCandidate] = field(default_factory=list)
    policies: Policies = field(default_factory=Policies)
    payment_date: date = date(2026, 11, 23)
    snippets: dict[str, str] = field(default_factory=dict)


def _conserve(d: Decision) -> Decision:
    if d.net_safe_payable + d.wht_to_remit + d.blocked_or_hold != d.gross:
        raise ConservationError(
            f"{d.doc_label}: net {d.net_safe_payable} + wht {d.wht_to_remit} + held {d.blocked_or_hold} != gross {d.gross}"
        )
    if d.overpayment_blocked + d.pending_verification != d.blocked_or_hold:
        raise ConservationError(f"{d.doc_label}: overpay + pending != held")
    d.evidence.append(step(
        "CTRL_CONSERVATION", field="decision", source_doc=d.doc_label,
        inputs={"gross": fmt_naira(d.gross), "net_safe_payable": fmt_naira(d.net_safe_payable),
                "wht_to_remit": fmt_naira(d.wht_to_remit), "blocked_or_hold": fmt_naira(d.blocked_or_hold),
                "overpayment_blocked": fmt_naira(d.overpayment_blocked),
                "pending_verification": fmt_naira(d.pending_verification),
                "recoverable_input_vat": fmt_naira(d.recoverable_input_vat),
                "advisory_self_account": fmt_naira(d.advisory_self_account)},
        computation=f"{fmt_naira(d.net_safe_payable)} + {fmt_naira(d.wht_to_remit)} + {fmt_naira(d.blocked_or_hold)}",
        result=f"= {fmt_naira(d.gross)} ✓",
    ))
    return d


def _base(ctx: InvoiceContext, status: DecisionStatus) -> Decision:
    return Decision(
        invoice_id=ctx.invoice_id, subject_id=str(ctx.invoice_id), doc_label=ctx.doc_label,
        vendor_name=ctx.vendor_name, status=status, gross=ctx.printed_total,
    )


def _review(ctx: InvoiceContext, flags: list[Flag], steps: list[EvidenceStep]) -> Decision:
    d = _base(ctx, DecisionStatus.NEEDS_HUMAN_REVIEW)
    d.excluded_from_totals = True
    d.blocked_or_hold = d.gross
    d.pending_verification = d.gross
    d.flags = flags
    d.evidence = steps
    return _conserve(d)


def decide(ctx: InvoiceContext) -> Decision:
    p = ctx.policies
    src = ctx.doc_label

    # 1. gate failures
    if ctx.gate_flags or ctx.invoice is None:
        return _review(ctx, list(ctx.gate_flags), list(ctx.gate_steps))
    inv = ctx.invoice
    evidence: list[EvidenceStep] = list(ctx.gate_steps)
    flags: list[Flag] = []

    # 2. duplicate
    me = DupCandidate(ctx.invoice_id, src, inv.vendor_name, inv.invoice_number, inv.invoice_date, inv.total_amount)
    dup, dsteps = find_duplicate(me, ctx.others, p)
    if dup is not None:
        d = _base(ctx, DecisionStatus.HOLD)
        d.blocked_or_hold = d.gross
        d.overpayment_blocked = d.gross
        d.flags = [Flag(code=FlagCode.DUPLICATE_SUSPECTED, detail=f"duplicate of {dup.doc_label} ({dup.number})")]
        d.evidence = evidence + dsteps
        return _conserve(d)

    # 3. registry guard
    reg = registry_guard.check(inv.vendor_tin, ctx.registry, src, ctx.snippets.get("vendor_tin"))
    flags += reg.flags
    evidence += reg.steps
    if reg.blocked:
        d = _base(ctx, DecisionStatus.BLOCKED)
        d.blocked_or_hold = d.gross
        d.pending_verification = d.gross
        fine = rules().dec("UNREGISTERED_CONTRACTOR_FINE")
        d.contingent_exposures = [ContingentExposure(
            rule_id="UNREGISTERED_CONTRACTOR_FINE", label="s.100(2) fine for contracting an unregistered person",
            amount=fine)]
        d.flags, d.evidence = flags, evidence
        return _conserve(d)

    # 4. 3-way match
    if ctx.po is None:
        d = _base(ctx, DecisionStatus.HOLD)
        d.blocked_or_hold = d.gross
        d.pending_verification = d.gross
        d.flags = flags + [Flag(code=FlagCode.NO_PO_MATCH, detail=f"PO ref {inv.po_reference!r} not found")]
        d.evidence = evidence + [step("CTRL_3WAY_NO_PO", field="po_reference", source_doc=src,
                                      raw_snippet=ctx.snippets.get("po_reference"),
                                      inputs={"po_reference": inv.po_reference or "MISSING"},
                                      computation="no purchase order matched", result=f"HOLD {fmt_naira(d.gross)}")]
        return _conserve(d)
    m = match3way.match(inv, ctx.po, ctx.grns, p, src)
    flags += m.flags
    evidence += m.steps

    # 5. VAT
    v = vat.evaluate_vat(
        printed_vat=inv.vat_amount, std_invoiced_base=m.std_base(approved=False), std_approved_base=m.std_base(),
        has_tin=reg.has_tin, registry_entry=reg.entry, policies=p, source_doc=src,
        vat_snippet=ctx.snippets.get("vat_amount"),
    )
    flags += v.flags
    evidence += v.steps

    # 6. WHT on approved base
    try:
        wht_amt, wsteps = wht.compute_wht(m.base_by_wht_category(), reg.has_tin, p, src)
    except PolicyRequired as pr:
        return _review(ctx, flags + [Flag(code=FlagCode.POLICY_REQUIRED, detail=pr.reason)],
                       evidence + [step("WHT_RATES", field="wht_category", source_doc=src, policy=pr.key,
                                        computation="no defensible default", result=f"POLICY_REQUIRED: {pr.reason}")])
    evidence += wsteps

    # 7. assemble
    d = _base(ctx, DecisionStatus.RELEASE)
    rate = vat.vat_rate()
    d.approved_base = m.approved_base
    d.approved_gross = m.approved_base + v.approved_vat
    d.wht_to_remit = wht_amt
    d.net_safe_payable = d.approved_gross - wht_amt
    d.blocked_or_hold = d.gross - d.approved_gross
    pending_vat = ZERO
    if v.small_vendor_hold:
        pending_vat = v.vat_hold_pending
    elif inv.vat_amount > ZERO and m.pending_std_base > ZERO:
        pending_vat = min(q(m.pending_std_base * rate), inv.vat_amount)
    d.pending_verification = m.pending_base + pending_vat
    d.overpayment_blocked = d.blocked_or_hold - d.pending_verification
    if d.overpayment_blocked < ZERO:  # e.g. footing slack within ₦1 tolerance
        d.pending_verification += d.overpayment_blocked
        d.overpayment_blocked = ZERO
    d.recoverable_input_vat = v.recoverable
    d.advisory_self_account = v.advisory_self_account

    if d.blocked_or_hold == ZERO:
        d.status = DecisionStatus.RELEASE
    elif d.approved_gross == ZERO:
        d.status = DecisionStatus.HOLD
    else:
        d.status = DecisionStatus.RELEASE_PARTIAL

    if wht_amt > ZERO:
        penalty_rate = rules().dec("WHT_FAILURE_TO_DEDUCT")
        s105 = q(wht_amt * penalty_rate)
        d.contingent_exposures.append(ContingentExposure(
            rule_id="WHT_FAILURE_TO_DEDUCT", label="s.105 penalty if paid as invoiced without deduction", amount=s105))
        evidence.append(step("WHT_FAILURE_TO_DEDUCT", field="wht_to_remit", source_doc=src,
                             inputs={"wht_to_remit": fmt_naira(wht_amt)},
                             computation=f"q({fmt_naira(wht_amt)} × 40%)",
                             result=f"{fmt_naira(s105)} exposure avoided by deducting"))
        d.remittance_due = wht.remittance_due(ctx.payment_date)
        mpr = p.opt_d("CBN_MPR")
        evidence.append(step("WHT_REMITTANCE", field="remittance_due", source_doc=src,
                             inputs={"proposed_payment_date": ctx.payment_date.isoformat(),
                                     "CBN_MPR": p.s("CBN_MPR") or "MPR not set"},
                             computation="21st of the month following payment",
                             result=(f"remit {fmt_naira(wht_amt)} by {d.remittance_due.isoformat()}"
                                     + ("" if mpr is not None else "; late interest: MPR not set")
                                     + "; excluded from headline totals")))
    d.flags, d.evidence = flags, evidence
    return _conserve(d)
