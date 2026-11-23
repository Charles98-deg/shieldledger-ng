"""PO / GRN / invoice 3-way match. Pure, Decimal-only."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from rapidfuzz import fuzz

from app.engine.evidence import step
from app.models.domain import GRN, EvidenceStep, Flag, POLine, PurchaseOrder
from app.models.enums import FlagCode, VatTreatment, WhtCategory
from app.models.verified import VerifiedInvoice, VerifiedLine
from app.money import ZERO, fmt_naira, pct, q
from app.rules.loader import Policies


@dataclass
class LineResult:
    line_no: int
    description: str
    invoiced_amount: Decimal
    approved_amount: Decimal
    wht_category: WhtCategory | None
    vat_treatment: VatTreatment
    pending: bool = False  # held for verification (unsigned GRN / unmatched line)


@dataclass
class MatchResult:
    lines: list[LineResult] = field(default_factory=list)
    flags: list[Flag] = field(default_factory=list)
    steps: list[EvidenceStep] = field(default_factory=list)

    @property
    def approved_base(self) -> Decimal:
        return sum((ln.approved_amount for ln in self.lines), ZERO)

    def std_base(self, approved: bool = True) -> Decimal:
        return sum(
            ((ln.approved_amount if approved else ln.invoiced_amount) for ln in self.lines
             if ln.vat_treatment == VatTreatment.STANDARD),
            ZERO,
        )

    @property
    def pending_base(self) -> Decimal:
        return sum((ln.invoiced_amount - ln.approved_amount for ln in self.lines if ln.pending), ZERO)

    @property
    def pending_std_base(self) -> Decimal:
        return sum((ln.invoiced_amount - ln.approved_amount for ln in self.lines
                    if ln.pending and ln.vat_treatment == VatTreatment.STANDARD), ZERO)

    def base_by_wht_category(self) -> dict[WhtCategory, Decimal]:
        out: dict[WhtCategory, Decimal] = {}
        for ln in self.lines:
            if ln.wht_category is None or ln.approved_amount == ZERO:
                continue
            out[ln.wht_category] = out.get(ln.wht_category, ZERO) + ln.approved_amount
        return out


def qty_tolerance(po_line: POLine, policies: Policies) -> tuple[Decimal, str]:
    if po_line.uom.upper() == "LITRE" and po_line.category.upper() == "FUEL":
        return policies.d("QTY_TOL_FUEL"), f"QTY_TOL_FUEL={policies.s('QTY_TOL_FUEL')}"
    return policies.d("QTY_TOL_DEFAULT"), f"QTY_TOL_DEFAULT={policies.s('QTY_TOL_DEFAULT')}"


def _pair_lines(inv_lines: list[VerifiedLine], po_lines: list[POLine]) -> list[tuple[VerifiedLine, POLine | None]]:
    if len(inv_lines) == len(po_lines):
        return list(zip(inv_lines, po_lines))
    pairs: list[tuple[VerifiedLine, POLine | None]] = []
    for il in inv_lines:
        best, best_score = None, 0
        for pl in po_lines:
            s = fuzz.token_set_ratio(il.description.lower(), pl.description.lower())
            if s > best_score:
                best, best_score = pl, s
        pairs.append((il, best if best_score >= 60 else None))
    return pairs


def match(
    invoice: VerifiedInvoice,
    po: PurchaseOrder,
    grns: dict[int, GRN],
    policies: Policies,
    source_doc: str | None = None,
    snippets: dict[str, str] | None = None,
) -> MatchResult:
    res = MatchResult()
    tol_price = policies.d("PRICE_VARIANCE_TOL")
    snippets = snippets or {}
    for idx, (il, pl) in enumerate(_pair_lines(invoice.lines, po.lines), start=1):
        snip = snippets.get(f"line[{idx}]")
        if pl is None:
            res.lines.append(LineResult(idx, il.description, il.amount, ZERO, None, VatTreatment.STANDARD, pending=True))
            res.flags.append(Flag(code=FlagCode.NO_PO_MATCH, detail=f"invoice line {idx} has no matching PO line"))
            res.steps.append(step("CTRL_3WAY_NO_PO", field=f"line[{idx}]", source_doc=source_doc,
                                  inputs={"description": il.description}, computation="no PO line matched",
                                  result=f"held {fmt_naira(il.amount)}"))
            continue

        grn = grns.get(pl.line_no)
        lr = LineResult(pl.line_no, il.description, il.amount, il.amount, pl.wht_category, pl.vat_treatment)
        if grn is None or not grn.signed:
            lr.approved_amount = ZERO
            lr.pending = True
            res.flags.append(Flag(code=FlagCode.UNSIGNED_GRN_HOLD,
                                  detail=f"PO {po.id} line {pl.line_no}: GRN {'missing' if grn is None else 'unsigned'}"))
            res.steps.append(step("CTRL_3WAY_UNSIGNED_GRN", field=f"grn[{pl.line_no}].signed", source_doc=source_doc,
                                  inputs={"grn": grn.id if grn else "none", "signed": "false" if grn else "n/a"},
                                  computation="GRN not signed ⇒ hold whole line", result=f"held {fmt_naira(il.amount)}"))
            res.lines.append(lr)
            continue

        approved_qty = il.quantity
        approved_price = il.unit_price
        tol_qty, tol_label = qty_tolerance(pl, policies)
        threshold = grn.delivered_qty * (1 + tol_qty)
        res.steps.append(step(
            "CTRL_3WAY_SHORT_DELIVERY", field=f"grn[{pl.line_no}].delivered_qty", source_doc=source_doc, policy=tol_label,
            raw_snippet=snip,
            inputs={"invoiced_qty": str(il.quantity), "grn_delivered_qty": str(grn.delivered_qty), "qty_tol": pct(tol_qty, 1)},
            computation=f"{grn.delivered_qty} × (1 + {pct(tol_qty, 1)}) = {threshold} vs invoiced {il.quantity}",
            result="short delivery" if threshold < il.quantity else "within tolerance",
        ))
        if threshold < il.quantity:
            approved_qty = grn.delivered_qty
            res.flags.append(Flag(code=FlagCode.SHORT_DELIVERY_HOLD,
                                  detail=f"invoiced {il.quantity}, GRN delivered {grn.delivered_qty}"))

        variance = (il.unit_price - pl.unit_price) / pl.unit_price
        res.steps.append(step(
            "CTRL_3WAY_PRICE_VARIANCE", field=f"line[{pl.line_no}].unit_price", source_doc=source_doc,
            raw_snippet=snip, policy=f"PRICE_VARIANCE_TOL={policies.s('PRICE_VARIANCE_TOL')}",
            inputs={"invoice_unit_price": fmt_naira(il.unit_price), "po_unit_price": fmt_naira(pl.unit_price)},
            computation=f"({fmt_naira(il.unit_price)} − {fmt_naira(pl.unit_price)}) / {fmt_naira(pl.unit_price)} = {pct(variance)} vs tol {pct(tol_price, 1)} (hold if strictly greater)",
            result="price variance" if variance > tol_price else "within tolerance",
        ))
        if variance > tol_price:
            approved_price = pl.unit_price
            res.flags.append(Flag(code=FlagCode.PRICE_VARIANCE_HOLD,
                                  detail=f"invoice {fmt_naira(il.unit_price)} vs PO {fmt_naira(pl.unit_price)} ({pct(variance)})"))

        if approved_qty != il.quantity or approved_price != il.unit_price:
            lr.approved_amount = q(approved_qty * approved_price)
            res.steps.append(step(
                "CTRL_3WAY_SHORT_DELIVERY" if approved_qty != il.quantity else "CTRL_3WAY_PRICE_VARIANCE",
                field=f"line[{pl.line_no}].approved_amount", source_doc=source_doc,
                inputs={"approved_qty": str(approved_qty), "approved_price": fmt_naira(approved_price),
                        "invoiced_amount": fmt_naira(il.amount)},
                computation=f"q({approved_qty} × {fmt_naira(approved_price)})",
                result=f"approved {fmt_naira(lr.approved_amount)}; excess base {fmt_naira(il.amount - lr.approved_amount)} held",
            ))
        res.lines.append(lr)
    return res
