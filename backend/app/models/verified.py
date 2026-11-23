"""Strict invoice model. Built only after normalization (gate G4)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ValidationInfo, model_validator

from app.money import DOC_TOL, LINE_TOL


class InvoiceInvariantError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code


class VerifiedLine(BaseModel):
    description: str
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal


class VerifiedInvoice(BaseModel):
    vendor_name: str
    vendor_tin: Optional[str]
    invoice_number: str
    invoice_date: date
    po_reference: Optional[str]
    currency: str
    subtotal: Decimal
    vat_amount: Decimal
    vat_charged: bool
    total_amount: Decimal
    bank_nuban: Optional[str] = None
    phone: Optional[str] = None
    lines: list[VerifiedLine]

    @model_validator(mode="after")
    def _invariants(self, info: ValidationInfo) -> "VerifiedInvoice":
        # INV-1: Σ lines == subtotal within ₦1.00
        line_sum = sum((ln.amount for ln in self.lines), Decimal("0"))
        if abs(line_sum - self.subtotal) > LINE_TOL:
            raise InvoiceInvariantError(
                "INV-1", f"sum of lines {line_sum} != subtotal {self.subtotal}"
            )
        # INV-2: subtotal + VAT == total within ₦1.00 (footing)
        footed = self.subtotal + self.vat_amount
        if abs(footed - self.total_amount) > DOC_TOL:
            raise InvoiceInvariantError(
                "INV-2",
                f"subtotal {self.subtotal} + VAT {self.vat_amount} = {footed} != printed total {self.total_amount}",
            )
        # INV-3: not dated in the future (injectable clock via validation context)
        today = (info.context or {}).get("today") if info else None
        if today is not None and self.invoice_date > today:
            raise InvoiceInvariantError("INV-3", f"invoice date {self.invoice_date} is after {today}")
        return self
