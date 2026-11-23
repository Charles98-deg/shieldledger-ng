"""T18 offline parser on all 12 PDFs; no-key operation; Gemini failure → fallback."""
import json
from dataclasses import replace

import pytest

from app.config import get_settings
from app.extraction import gemini_client, offline_parser
from app.extraction.pipeline import run_extraction
from app.models.enums import Confidence
from tests.conftest import ROOT

SEED = ROOT / "backend" / "seed" / "invoices"
PACK = ROOT / "demo" / "pack"
DOCS = [f"D{i:02d}" for i in range(1, 13)]


@pytest.mark.parametrize("doc", DOCS)
def test_t18_offline_parser_exact(doc):
    src = json.loads((SEED / f"{doc}.json").read_text())
    raw = offline_parser.parse_pdf((PACK / f"{doc}.pdf").read_bytes())
    assert raw.vendor_name.value == src["vendor"]
    if src["vendor_tin"] == "MISSING":
        assert raw.vendor_tin.value is None and raw.vendor_tin.confidence == Confidence.HIGH
    else:
        assert raw.vendor_tin.value == src["vendor_tin"]
    assert raw.invoice_number.value == src["invoice_no"]
    assert raw.invoice_date.value == src["invoice_date"]
    assert raw.po_reference.value == src["po_ref"]
    assert raw.bank_nuban.value == src["bank_nuban"] and raw.phone.value == src["phone"]
    assert raw.subtotal.value == src["subtotal"] and raw.total_amount.value == src["total"]
    assert raw.vat_amount.value == src["vat"]
    assert len(raw.line_items) == len(src["lines"])
    for got, exp in zip(raw.line_items, src["lines"]):
        assert (got.description.value, got.quantity.value, got.unit_price.value, got.amount.value) == (
            exp["description"], exp["qty"], exp["unit_price"], exp["amount"])
    for f in ("vendor_name", "invoice_number", "total_amount", "subtotal", "vat_amount"):
        assert getattr(raw, f).confidence == Confidence.HIGH
        assert getattr(raw, f).raw_snippet


def test_t18_missing_label_is_low_confidence():
    raw = offline_parser.parse_text("Vendor: X\nTotal: 1.00\nTotal: 2.00\n")
    assert raw.total_amount.confidence == Confidence.LOW  # ambiguous: two values
    assert raw.vendor_tin.confidence == Confidence.LOW    # absent label
    assert raw.vendor_name.confidence == Confidence.HIGH


def test_t18_no_key_uses_offline(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    s = get_settings()
    assert not gemini_client.available(s)
    raw, engine, attempts = run_extraction((PACK / "D01.pdf").read_bytes(), "application/pdf", s)
    assert engine == "offline_regex" and raw.vendor_name.value == "Efik Agro-Inputs Ltd"
    assert attempts[0]["error"] == "GEMINI_API_KEY not set"


def test_t18_mocked_gemini_schema_failure_falls_back():
    s = replace(get_settings(), gemini_api_key="test-key")

    def broken(data, mime, settings):
        raise gemini_client.GeminiUnavailable([
            {"engine": f"gemini:{m}", "ok": False, "error": "ValidationError: schema mismatch"}
            for m in gemini_client.model_chain(settings)])
    raw, engine, attempts = run_extraction((PACK / "D05.pdf").read_bytes(), "application/pdf", s, gemini=broken)
    assert engine == "offline_regex" and raw.invoice_number.value == "AFS-2026-77"
    assert [a["engine"] for a in attempts] == ["gemini:gemini-3.5-flash-lite", "gemini:gemini-3.6-flash",
                                               "gemini:gemini-3.8-flash", "offline_regex"]


def test_t18_real_client_records_every_model_failure(monkeypatch):
    """The real client walks the whole chain and records each failure (SDK call mocked)."""
    import google.genai as genai

    class FakeModels:
        def generate_content(self, model, contents, config):
            class R:
                text = '{"not": "the schema"}'
            return R()

    class FakeClient:
        def __init__(self, **kw):
            self.models = FakeModels()
    monkeypatch.setattr(genai, "Client", FakeClient)
    s = replace(get_settings(), gemini_api_key="test-key")
    with pytest.raises(gemini_client.GeminiUnavailable) as ei:
        gemini_client.extract(b"%PDF-1.4", "application/pdf", s)
    assert len(ei.value.attempts) == 3 and all("ValidationError" in a["error"] for a in ei.value.attempts)


def test_t18_app_runs_without_key(client):
    h = client.get("/api/health").json()
    assert h["extraction"]["gemini_available"] is False and h["extraction"]["offline_parser"] is True
    assert "key" not in json.dumps(h).lower().replace("gemini_available", "")
