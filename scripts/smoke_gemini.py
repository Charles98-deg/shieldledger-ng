"""Send one tiny PDF through the Gemini chain; print which model succeeded and whether
structured JSON validated against RawInvoiceLLM. Exit 0 on success, 2 when no key,
1 when every model failed. Never prints the key."""
from __future__ import annotations

import io
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from reportlab.pdfgen import canvas  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.extraction import gemini_client  # noqa: E402


def tiny_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, invariant=1)
    y = 800
    for line in ["Vendor: Smoke Test Supplies Ltd (fictional)", "Vendor TIN: 12345678-0001", "Invoice No: SMOKE-1",
                 "Invoice Date: 2026-11-20", "PO Ref: PO-SMOKE", "LINE | Widget | 2 | 1,000.00 | 2,000.00",
                 "Subtotal: 2,000.00", "VAT (7.5%): 150.00", "Total: 2,150.00"]:
        c.drawString(48, y, line)
        y -= 16
    c.save()
    return buf.getvalue()


def main() -> int:
    s = get_settings()
    report = {"date": date.today().isoformat(), "chain": gemini_client.model_chain(s), "key_present": bool(s.gemini_api_key)}
    if not s.gemini_api_key:
        report["result"] = "SKIPPED: GEMINI_API_KEY not set; offline parser will be used"
        print(json.dumps(report, indent=1))
        return 2
    try:
        raw, model, attempts = gemini_client.extract(tiny_pdf(), "application/pdf", s)
        report.update(result="OK", model=model, structured_json_validated=True, attempts=attempts,
                      sample={"vendor_name": raw.vendor_name.value, "total_amount": raw.total_amount.value})
        print(json.dumps(report, indent=1))
        return 0
    except gemini_client.GeminiUnavailable as gu:
        report.update(result="FAILED: all models failed; offline parser will be used", attempts=gu.attempts)
        print(json.dumps(report, indent=1))
        return 1


if __name__ == "__main__":
    sys.exit(main())
