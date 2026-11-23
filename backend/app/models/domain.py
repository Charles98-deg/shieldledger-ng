from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import DecisionStatus, FlagCode, RuleStatus, VatTreatment, WhtCategory


class POLine(BaseModel):
    line_no: int
    description: str
    qty: Decimal
    unit_price: Decimal
    uom: str = "EA"
    category: str = "GENERAL"
    wht_category: WhtCategory
    vat_treatment: VatTreatment


class PurchaseOrder(BaseModel):
    id: str
    vendor_id: str
    po_date: date
    total_amount: Decimal
    lines: list[POLine] = Field(default_factory=list)


class GRN(BaseModel):
    id: str
    po_id: str
    line_no: int
    delivered_qty: Decimal
    signed: bool


class VendorRecord(BaseModel):
    id: str
    name: str
    tin: Optional[str] = None
    nuban: Optional[str] = None
    phone: Optional[str] = None


class RegistryEntry(BaseModel):
    tin: str
    name: str
    vat_registered: bool
    small_business: bool


class Employee(BaseModel):
    emp_id: str
    name: str
    nuban: Optional[str] = None
    phone: Optional[str] = None


class EvidenceStep(BaseModel):
    rule_id: str
    rule_version: int
    cite: str
    status: RuleStatus
    source_doc: Optional[str] = None
    field: Optional[str] = None
    inputs: dict[str, str] = Field(default_factory=dict)
    computation: str = ""
    result: str = ""
    policy_applied: Optional[str] = None
    raw_snippet: Optional[str] = None


class Flag(BaseModel):
    code: FlagCode
    detail: str = ""


class ContingentExposure(BaseModel):
    rule_id: str
    label: str
    amount: Decimal
    counted_in_headline: bool = True


class Decision(BaseModel):
    kind: str = "INVOICE"
    invoice_id: Optional[int] = None
    subject_id: str = ""
    doc_label: str = ""
    vendor_name: str = ""
    status: DecisionStatus
    gross: Decimal = Decimal("0.00")
    approved_base: Decimal = Decimal("0.00")
    approved_gross: Decimal = Decimal("0.00")
    wht_to_remit: Decimal = Decimal("0.00")
    net_safe_payable: Decimal = Decimal("0.00")
    blocked_or_hold: Decimal = Decimal("0.00")
    recoverable_input_vat: Decimal = Decimal("0.00")
    overpayment_blocked: Decimal = Decimal("0.00")
    pending_verification: Decimal = Decimal("0.00")
    advisory_self_account: Decimal = Decimal("0.00")
    excluded_from_totals: bool = False
    remittance_due: Optional[date] = None
    contingent_exposures: list[ContingentExposure] = Field(default_factory=list)
    flags: list[Flag] = Field(default_factory=list)
    evidence: list[EvidenceStep] = Field(default_factory=list)

    def flag_codes(self) -> set[str]:
        return {f.code.value for f in self.flags}
