"""Lenient extraction models. Never raise on missing data; absence is LOW confidence."""
from __future__ import annotations

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field

from app.models.enums import Confidence

T = TypeVar("T")


class FieldValue(BaseModel, Generic[T]):
    value: Optional[T] = None
    confidence: Confidence = Confidence.LOW
    raw_snippet: Optional[str] = None


def _fv() -> FieldValue[str]:
    return FieldValue[str]()


class RawLine(BaseModel):
    description: FieldValue[str] = Field(default_factory=_fv)
    quantity: FieldValue[str] = Field(default_factory=_fv)
    unit_price: FieldValue[str] = Field(default_factory=_fv)
    amount: FieldValue[str] = Field(default_factory=_fv)


class RawInvoice(BaseModel):
    vendor_name: FieldValue[str] = Field(default_factory=_fv)
    vendor_tin: FieldValue[str] = Field(default_factory=_fv)
    invoice_number: FieldValue[str] = Field(default_factory=_fv)
    invoice_date: FieldValue[str] = Field(default_factory=_fv)
    po_reference: FieldValue[str] = Field(default_factory=_fv)
    currency: FieldValue[str] = Field(default_factory=_fv)
    subtotal: FieldValue[str] = Field(default_factory=_fv)
    vat_amount: FieldValue[str] = Field(default_factory=_fv)
    vat_rate_printed: FieldValue[str] = Field(default_factory=_fv)
    total_amount: FieldValue[str] = Field(default_factory=_fv)
    bank_nuban: FieldValue[str] = Field(default_factory=_fv)
    phone: FieldValue[str] = Field(default_factory=_fv)
    line_items: list[RawLine] = Field(default_factory=list)


# ---- Gemini response schema: flat, non-generic (structured-output friendly) ----
class LLMField(BaseModel):
    value: Optional[str] = None
    confidence: Confidence
    raw_snippet: Optional[str] = None


class LLMLine(BaseModel):
    description: LLMField
    quantity: LLMField
    unit_price: LLMField
    amount: LLMField


class RawInvoiceLLM(BaseModel):
    """Schema handed to Gemini. The model only transcribes; Python decides."""

    vendor_name: LLMField
    vendor_tin: LLMField
    invoice_number: LLMField
    invoice_date: LLMField
    po_reference: LLMField
    currency: LLMField
    subtotal: LLMField
    vat_amount: LLMField
    vat_rate_printed: LLMField
    total_amount: LLMField
    bank_nuban: LLMField
    phone: LLMField
    line_items: list[LLMLine]

    def to_raw(self) -> RawInvoice:
        return RawInvoice.model_validate(self.model_dump(mode="json"))
