"""Deterministic normalizers shared by extraction (G4/G7) and the engines."""
from __future__ import annotations

import re
from datetime import date, datetime

_VENDOR_STOP = {"ltd", "limited", "plc", "nig", "nigeria", "enterprises", "and"}


def vendor_norm(name: str | None) -> str:
    """lowercase; strip ltd|limited|plc|nig|nigeria|enterprises|&|and; drop punctuation; collapse spaces."""
    if not name:
        return ""
    s = name.lower().replace("&", " ")
    s = re.sub(r"[^\w\s]", " ", s)
    s = s.replace("_", " ")
    tokens = [t for t in s.split() if t not in _VENDOR_STOP]
    return " ".join(tokens)


def tin_norm(tin: str | None) -> str | None:
    if tin is None:
        return None
    s = re.sub(r"[\s-]", "", tin)
    return s or None


def nuban_norm(nuban: str | None) -> str | None:
    if not nuban:
        return None
    d = re.sub(r"\D", "", nuban)
    return d if len(d) == 10 else None


def phone_norm(phone: str | None) -> str | None:
    if not phone:
        return None
    d = re.sub(r"\D", "", phone)
    return d[-10:] if len(d) >= 10 else None


def po_norm(po: str | None) -> str | None:
    if not po:
        return None
    s = re.sub(r"[^A-Za-z0-9]", "", po).upper()
    return s or None


_CONFUSABLES = str.maketrans({"O": "0", "I": "1", "L": "1"})


def invoice_no_fold(no: str | None) -> str:
    """Upper-case, strip non-alphanumerics, fold O→0 and l/I→1."""
    if not no:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", no).upper().translate(_CONFUSABLES)


_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def parse_date(raw: str | None) -> date:
    """ISO (YYYY-MM-DD), dd/mm/yyyy, or 'dd Mon yyyy'. Raises ValueError otherwise."""
    if raw is None:
        raise ValueError("missing date")
    s = raw.strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return date(int(m[1]), int(m[2]), int(m[3]))
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return date(int(m[3]), int(m[2]), int(m[1]))
    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})", s)
    if m and m[2].lower() in _MONTHS:
        return date(int(m[3]), _MONTHS[m[2].lower()], int(m[1]))
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S").date()
    except ValueError:
        raise ValueError(f"unrecognised date {raw!r}") from None
