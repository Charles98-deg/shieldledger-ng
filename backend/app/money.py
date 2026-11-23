"""Decimal-only money helpers.

Rules of the house:
* Money is always ``decimal.Decimal``; floats are banned in ``app/`` (see tests/test_no_float.py).
* Quantize to kobo (0.01) with ROUND_HALF_UP only at defined points (``q``).
* Money crosses the API and the database as strings.
"""
from __future__ import annotations

import re
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal, InvalidOperation, getcontext

getcontext().prec = 28

KOBO = Decimal("0.01")
ZERO = Decimal("0.00")
LINE_TOL = Decimal("1.00")
DOC_TOL = Decimal("1.00")


class MoneyParseError(ValueError):
    """Raised when a money string is missing or ambiguous."""


def _require_decimal(x: object) -> Decimal:
    if not isinstance(x, Decimal):
        raise TypeError(f"money must be Decimal, got {type(x).__name__}")
    return x


def q(x: Decimal) -> Decimal:
    """Quantize to kobo, ROUND_HALF_UP."""
    return _require_decimal(x).quantize(KOBO, rounding=ROUND_HALF_UP)


def q_floor(x: Decimal) -> Decimal:
    """Quantize to kobo, rounding toward negative infinity."""
    return _require_decimal(x).quantize(KOBO, rounding=ROUND_FLOOR)


_GROUPED = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$")
_PLAIN = re.compile(r"^-?\d+(\.\d{1,2})?$")
_GROUPED_QTY = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$")
_PLAIN_QTY = re.compile(r"^-?\d+(\.\d+)?$")


def _clean(raw: object) -> str:
    if isinstance(raw, bool) or not isinstance(raw, (str, int, Decimal)):
        raise MoneyParseError(f"unsupported money type {type(raw).__name__}")
    s = str(raw).strip()
    s = s.replace("₦", "").replace("NGN", "")
    s = re.sub(r"\s+", "", s)
    if not s:
        raise MoneyParseError("empty amount")
    return s


def parse_money(raw: object) -> Decimal:
    """Parse '₦1,240,000.00', 'NGN 1 240 000', '1240000' → Decimal.

    Rejects ambiguous input: European separators ('1.240,00'), bad comma
    grouping ('12,40,000'), more than 2 decimals, letters.
    """
    if isinstance(raw, Decimal):
        return raw
    s = _clean(raw)
    if "," in s:
        if not _GROUPED.match(s):
            raise MoneyParseError(f"ambiguous amount {raw!r}")
        s = s.replace(",", "")
    if not _PLAIN.match(s):
        raise MoneyParseError(f"ambiguous amount {raw!r}")
    try:
        return Decimal(s)
    except InvalidOperation as exc:  # pragma: no cover - regex guards this
        raise MoneyParseError(str(exc)) from exc


def parse_qty(raw: object) -> Decimal:
    """Quantities may carry more decimals than money (e.g. litres)."""
    if isinstance(raw, Decimal):
        return raw
    s = _clean(raw)
    if "," in s:
        if not _GROUPED_QTY.match(s):
            raise MoneyParseError(f"ambiguous quantity {raw!r}")
        s = s.replace(",", "")
    if not _PLAIN_QTY.match(s):
        raise MoneyParseError(f"ambiguous quantity {raw!r}")
    return Decimal(s)


def to_str(x: Decimal) -> str:
    """Serialize money for API/DB: plain string, 2 dp."""
    return format(q(x), "f")


def from_db(s: str | None) -> Decimal:
    if s is None or s == "":
        return ZERO
    return Decimal(s)


def fmt_naira(x: Decimal) -> str:
    """Human string for evidence text: ₦1,234.56."""
    v = q(x)
    sign = "-" if v < 0 else ""
    return f"{sign}₦{abs(v):,.2f}"


def pct(x: Decimal, dp: int = 3) -> str:
    """Render a ratio (0.00947) as '0.947%'."""
    _require_decimal(x)
    quant = Decimal(1).scaleb(-dp)
    return f"{(x * 100).quantize(quant, rounding=ROUND_HALF_UP)}%"
