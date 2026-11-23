"""Vendor TIN vs the (fictional, seeded) NRS taxpayer registry."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.engine.evidence import step
from app.models.domain import EvidenceStep, Flag, RegistryEntry
from app.models.enums import FlagCode
from app.normalize import tin_norm
from app.rules.loader import rules


@dataclass
class RegistryResult:
    tin: str | None
    has_tin: bool
    blocked: bool = False
    entry: RegistryEntry | None = None
    flags: list[Flag] = field(default_factory=list)
    steps: list[EvidenceStep] = field(default_factory=list)


def tin_format_ok(tin: str) -> bool:
    return re.fullmatch(str(rules().get("TAX_ID_FORMAT").value), tin) is not None


def check(
    raw_tin: str | None,
    registry: dict[str, RegistryEntry],
    source_doc: str | None = None,
    snippet: str | None = None,
) -> RegistryResult:
    tin = tin_norm(raw_tin)
    res = RegistryResult(tin=tin, has_tin=tin is not None)
    if tin is None:
        res.flags.append(Flag(code=FlagCode.MISSING_TIN_DOUBLE_WHT,
                              detail="invoice carries no supplier TIN: WHT at double rate; input VAT not claimable"))
        res.steps.append(step("VAT_INVOICE_CONTENT", field="vendor_tin", source_doc=source_doc, raw_snippet=snippet,
                              inputs={"vendor_tin": "MISSING"}, computation="supplier Tax ID absent from invoice",
                              result="release at double WHT; input VAT not claimable"))
        return res

    if raw_tin is not None and not tin_format_ok(raw_tin.replace(" ", "")):
        res.flags.append(Flag(code=FlagCode.TIN_FORMAT_WARNING, detail=f"TIN {raw_tin!r} does not match permissive format"))
        res.steps.append(step("TAX_ID_FORMAT", field="vendor_tin", source_doc=source_doc, raw_snippet=snippet,
                              inputs={"vendor_tin": raw_tin}, computation="regex check (format UNVERIFIED)",
                              result="warning chip only"))

    entry = registry.get(tin)
    if entry is None:
        res.blocked = True
        res.flags.append(Flag(code=FlagCode.UNREGISTERED_VENDOR_BLOCKED,
                              detail=f"TIN {raw_tin} not found in taxpayer registry (fictional seed)"))
        res.steps.append(step("UNREGISTERED_CONTRACTOR_FINE", field="vendor_tin", source_doc=source_doc, raw_snippet=snippet,
                              inputs={"vendor_tin": raw_tin, "registry_hit": "false"},
                              computation="awarding a contract to an unregistered person ⇒ fine",
                              result="BLOCKED; contingent exposure ₦5,000,000.00 if paid"))
        res.steps.append(step("WHT_NO_TIN_DOUBLE", field="vendor_tin", source_doc=source_doc,
                              computation="informational: WHT would be double if paid", result="not counted"))
        return res

    res.entry = entry
    res.steps.append(step("VAT_INVOICE_CONTENT", field="vendor_tin", source_doc=source_doc, raw_snippet=snippet,
                          inputs={"vendor_tin": raw_tin, "registry_name": entry.name,
                                  "vat_registered": str(entry.vat_registered).lower(),
                                  "small_business": str(entry.small_business).lower()},
                          computation="TIN present and found in registry", result="registered"))
    return res
