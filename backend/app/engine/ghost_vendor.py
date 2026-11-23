"""Vendor master vs payroll: shared bank account or phone ⇒ possible ghost vendor."""
from __future__ import annotations

from dataclasses import dataclass, field

from app.engine.evidence import step
from app.models.domain import Employee, EvidenceStep, VendorRecord
from app.normalize import nuban_norm, phone_norm, vendor_norm


@dataclass
class GhostHit:
    vendor_id: str
    vendor_name: str
    emp_id: str
    matched_on: list[str]
    steps: list[EvidenceStep] = field(default_factory=list)


def detect(vendors: list[VendorRecord], employees: list[Employee]) -> list[GhostHit]:
    hits: list[GhostHit] = []
    for v in vendors:
        vn, vp = nuban_norm(v.nuban), phone_norm(v.phone)
        for e in employees:
            matched: list[str] = []
            if vn and vn == nuban_norm(e.nuban):
                matched.append("NUBAN")
            if vp and vp == phone_norm(e.phone) and vendor_norm(v.name) != vendor_norm(e.name):
                matched.append("PHONE")
            if matched:
                hits.append(GhostHit(v.id, v.name, e.emp_id, matched, [step(
                    "CTRL_GHOST_VENDOR", field="+".join(m.lower() for m in matched), source_doc=v.id,
                    inputs={"vendor": v.name, "vendor_nuban": vn or "-", "vendor_phone(last10)": vp or "-",
                            "payroll_record": e.emp_id},
                    computation=f"normalized {' and '.join(matched)} equal to payroll record {e.emp_id}",
                    result="GHOST_VENDOR_SUSPECTED",
                )]))
                break
    return hits
