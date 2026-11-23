"""Offline extractor: regex over pypdf text for the 'Label: value' demo layout.

Confidence HIGH when a label is found exactly once with a non-empty value, LOW when
absent or ambiguous. 'Vendor TIN: MISSING' ⇒ value None, confidence HIGH (the absence
is the finding, not an extraction failure). Only handles the demo-pack layout.
"""
from __future__ import annotations

import io
import re

from pypdf import PdfReader

from app.models.enums import Confidence
from app.models.raw import FieldValue, RawInvoice, RawLine

_LABELS: dict[str, str] = {
    "vendor_name": r"Vendor",
    "vendor_tin": r"Vendor TIN",
    "invoice_number": r"Invoice No",
    "invoice_date": r"Invoice Date",
    "po_reference": r"PO Ref",
    "currency": r"Currency",
    "bank_nuban": r"Bank NUBAN",
    "phone": r"Phone",
    "subtotal": r"Subtotal",
    "total_amount": r"Total",
}
_VAT = re.compile(r"^VAT(?:\s*\((?P<rate>[\d.]+)\s*%\))?\s*:\s*(?P<val>.*)$")
_LINE = re.compile(r"^LINE\s*\|(?P<d>[^|]*)\|(?P<q>[^|]*)\|(?P<p>[^|]*)\|(?P<a>[^|]*)$")


def pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _fv(value: str | None, conf: Confidence, snippet: str | None) -> FieldValue[str]:
    return FieldValue[str](value=value, confidence=conf, raw_snippet=snippet)


def parse_text(text: str) -> RawInvoice:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out = RawInvoice()
    for field, label in _LABELS.items():
        rx = re.compile(rf"^{label}\s*:\s*(.*)$")
        hits = [(m.group(1).strip(), ln) for ln in lines if (m := rx.match(ln))]
        if len(hits) == 1 and hits[0][0]:
            val, snip = hits[0]
            if field == "vendor_tin" and val.upper() == "MISSING":
                setattr(out, field, _fv(None, Confidence.HIGH, snip))
            else:
                setattr(out, field, _fv(val, Confidence.HIGH, snip))
        else:
            setattr(out, field, _fv(None, Confidence.LOW, " / ".join(s for _, s in hits) or None))

    vat_hits = [(m, ln) for ln in lines if (m := _VAT.match(ln))]
    if len(vat_hits) == 1 and vat_hits[0][0].group("val").strip():
        m, snip = vat_hits[0]
        out.vat_amount = _fv(m.group("val").strip(), Confidence.HIGH, snip)
        if m.group("rate"):
            out.vat_rate_printed = _fv(m.group("rate"), Confidence.HIGH, snip)
    else:
        out.vat_amount = _fv(None, Confidence.LOW, None)

    for ln in lines:
        m = _LINE.match(ln)
        if not m:
            continue
        parts = [m.group(k).strip() for k in ("d", "q", "p", "a")]
        conf = Confidence.HIGH if all(parts) else Confidence.LOW
        out.line_items.append(RawLine(
            description=_fv(parts[0] or None, conf, ln), quantity=_fv(parts[1] or None, conf, ln),
            unit_price=_fv(parts[2] or None, conf, ln), amount=_fv(parts[3] or None, conf, ln)))
    return out


def parse_pdf(data: bytes) -> RawInvoice:
    return parse_text(pdf_text(data))
