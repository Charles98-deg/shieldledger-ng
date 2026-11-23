"""Typed access to the statutory register and buyer policies."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel

from app.config import POLICY_DEFAULTS, RULES_PATH
from app.models.enums import Confidence, RuleStatus, WhtCategory


class PolicyRequired(Exception):
    """A statutory value is unknown or conflicting and the buyer has not set a policy."""

    def __init__(self, key: str, reason: str):
        super().__init__(f"{key}: {reason}")
        self.key = key
        self.reason = reason


class Rule(BaseModel):
    id: str
    version: int
    kind: str
    value: Any = None
    cite: str
    status: RuleStatus
    source_url: str | None = None
    note: str = ""


def _no_floats(node: Any, path: str = "") -> None:
    if isinstance(node, float):
        raise ValueError(f"float literal in rule pack at {path}; quote it")
    if isinstance(node, dict):
        for k, v in node.items():
            _no_floats(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            _no_floats(v, f"{path}[{i}]")


class RulePack:
    def __init__(self, path: Path = RULES_PATH):
        data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        _no_floats(data)
        self.pack: str = data["pack"]
        self.effective_date: str = data["effective_date"]
        self.rules: dict[str, Rule] = {}
        for entry in data.get("rules", []) + data.get("controls", []):
            r = Rule(**entry)
            if r.id in self.rules:
                raise ValueError(f"duplicate rule id {r.id}")
            self.rules[r.id] = r

    def get(self, rule_id: str) -> Rule:
        return self.rules[rule_id]

    def dec(self, rule_id: str) -> Decimal:
        return Decimal(str(self.rules[rule_id].value))

    def wht_entry(self, cat: WhtCategory) -> tuple[Decimal | None, RuleStatus]:
        e = self.rules["WHT_RATES"].value[cat.value]
        rate = Decimal(e["rate"]) if e.get("rate") is not None else None
        return rate, RuleStatus(e["status"])

    def as_list(self) -> list[dict]:
        return [r.model_dump(mode="json") for r in self.rules.values()]


@lru_cache(maxsize=1)
def rules() -> RulePack:
    return RulePack()


# ---------------------------------------------------------------- policies
POLICY_META: dict[str, dict[str, str]] = {
    "PRICE_VARIANCE_TOL": {"type": "ratio", "label": "Price variance tolerance (hold when strictly greater)"},
    "QTY_TOL_DEFAULT": {"type": "ratio", "label": "Quantity tolerance (default)"},
    "QTY_TOL_FUEL": {"type": "ratio", "label": "Quantity tolerance (FUEL lines in LITRE)"},
    "DUP_FUZZY_MIN": {"type": "int", "label": "Duplicate: min vendor-name similarity (token_sort_ratio)"},
    "DUP_WINDOW_DAYS": {"type": "int", "label": "Duplicate: window (days)"},
    "PO_APPROVAL_LIMIT": {"type": "money", "label": "PO approval limit (₦)"},
    "SPLIT_WINDOW_DAYS": {"type": "int", "label": "Split-PO: rolling window (days)"},
    "SPLIT_BAND_LOW": {"type": "ratio", "label": "Split-PO: band low (× limit)"},
    "SPLIT_BAND_HIGH": {"type": "ratio", "label": "Split-PO: band high (× limit)"},
    "WHT_RENT_RATE": {"type": "ratio_optional", "label": "WHT rate for RENT (sources conflict 5% vs 10%)"},
    "LLM_MIN_CONFIDENCE": {"type": "confidence", "label": "Min extraction confidence for critical fields"},
    "SMALL_VENDOR_VAT_HOLD": {"type": "toggle", "label": "Hold VAT charged by small, non-VAT-registered vendors", "rule": "SMALL_BUSINESS_VAT_EFFECT"},
    "WHT_NO_TIN_DOUBLE": {"type": "toggle", "label": "Double WHT when payee has no TIN", "rule": "WHT_NO_TIN_DOUBLE"},
    "WHT_SMALL_PAYER_EXEMPT": {"type": "toggle", "label": "Small-company payer WHT exemption", "rule": "WHT_SMALL_PAYER_EXEMPT"},
    "BUYER_IS_SMALL_COMPANY": {"type": "toggle", "label": "Buyer is a small company"},
    "FTZ_BOUNDARY": {"type": "enum:AT_OR_ABOVE_BREACH,ABOVE_ONLY_BREACH", "label": "FTZ 25% boundary reading", "rule": "FTZ_DOMESTIC_THRESHOLD"},
    "MIN_ETR_ENABLED": {"type": "toggle", "label": "Show 15% minimum ETR info row", "rule": "MIN_ETR_15"},
    "CBN_MPR": {"type": "ratio_optional", "label": "CBN MPR for late-remittance interest (e.g. 0.275)"},
    "FTZ_ILLUSTRATIVE_PROFIT": {"type": "money", "label": "FTZ illustrative profit (assumption, ₦)"},
}


def validate_policy(key: str, value: str) -> str:
    if key not in POLICY_META:
        raise ValueError(f"unknown policy {key}")
    t = POLICY_META[key]["type"]
    v = str(value).strip()
    try:
        if t == "toggle":
            if v not in ("ON", "OFF"):
                raise ValueError("expected ON or OFF")
        elif t == "int":
            if not re.fullmatch(r"\d{1,4}", v):
                raise ValueError("expected a non-negative integer")
        elif t in ("ratio", "ratio_optional"):
            if t == "ratio_optional" and v == "":
                return v
            d = Decimal(v)
            if not (Decimal("0") <= d <= Decimal("1")) or not re.fullmatch(r"\d+(\.\d+)?", v):
                raise ValueError("expected a decimal ratio between 0 and 1")
        elif t == "money":
            if not re.fullmatch(r"\d+(\.\d{1,2})?", v):
                raise ValueError("expected a money string like 5000000.00")
        elif t == "confidence":
            Confidence(v)
        elif t.startswith("enum:"):
            if v not in t[5:].split(","):
                raise ValueError(f"expected one of {t[5:]}")
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{key}: {exc}") from exc
    return v


@dataclass(frozen=True)
class Policies:
    raw: dict[str, str] = field(default_factory=lambda: dict(POLICY_DEFAULTS))

    @classmethod
    def from_overrides(cls, **overrides: str) -> "Policies":
        d = dict(POLICY_DEFAULTS)
        d.update({k: str(v) for k, v in overrides.items()})
        return cls(d)

    def s(self, key: str) -> str:
        return self.raw.get(key, POLICY_DEFAULTS[key])

    def d(self, key: str) -> Decimal:
        return Decimal(self.s(key))

    def i(self, key: str) -> int:
        return int(self.s(key))

    def on(self, key: str) -> bool:
        return self.s(key) == "ON"

    def opt_d(self, key: str) -> Decimal | None:
        v = self.s(key)
        return Decimal(v) if v != "" else None

    def min_confidence(self) -> Confidence:
        return Confidence(self.s("LLM_MIN_CONFIDENCE"))

    def required_unset(self) -> list[str]:
        return [k for k in ("WHT_RENT_RATE",) if self.s(k) == ""]
