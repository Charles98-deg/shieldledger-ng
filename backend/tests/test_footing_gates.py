"""T03 footing failure + gates G2–G6."""
import io
from datetime import date

import pytest
from pydantic import ValidationError

from app.models.enums import Confidence
from app.models.raw import FieldValue
from app.models.verified import VerifiedInvoice
from app.extraction import offline_parser
from app.extraction.pipeline import normalize
from tests.conftest import ROOT, TODAY, mk_invoice


def test_t03_d04_review_and_excluded(pack_client):
    rows = {d["doc_label"]: d for d in pack_client.get("/api/decisions").json()}
    d04 = rows["D04"]
    assert d04["status"] == "NEEDS_HUMAN_REVIEW"
    assert [f["code"] for f in d04["flags"]] == ["FOOTING_FAILURE"]
    assert d04["excluded_from_totals"] is True
    assert "1333000.00" in d04["flags"][0]["detail"] and "1523000.00" in d04["flags"][0]["detail"]
    ev = pack_client.get(f"/api/decisions/{d04['invoice_id']}/evidence").json()["evidence"]
    assert ev[0]["rule_id"] == "CTRL_FOOTING" and ev[0]["raw_snippet"] == "Total: 1,523,000.00"
    s = pack_client.get("/api/summary").json()
    assert s["needs_review_count"] == 1
    assert s["conservation"]["gross"] == "51617300.00"  # D04's 1,523,000 not included


def test_inv1_lines_vs_subtotal():
    inv = mk_invoice([(1, "100.00")])
    data = inv.model_dump()
    data["subtotal"] = data["subtotal"] + 5
    data["total_amount"] = data["subtotal"] + data["vat_amount"]
    with pytest.raises(ValidationError, match="INV-1"):
        VerifiedInvoice.model_validate(data)


def test_inv2_within_one_naira_ok():
    inv = mk_invoice([(1, "100.00")])
    data = inv.model_dump()
    data["total_amount"] = data["total_amount"] + 1
    VerifiedInvoice.model_validate(data)
    data["total_amount"] = data["total_amount"] + 1
    with pytest.raises(ValidationError, match="INV-2"):
        VerifiedInvoice.model_validate(data)


def test_inv3_future_date_uses_injected_clock():
    data = mk_invoice([(1, "100.00")], d=date(2026, 11, 24)).model_dump()
    with pytest.raises(ValidationError, match="INV-3"):
        VerifiedInvoice.model_validate(data, context={"today": TODAY})
    VerifiedInvoice.model_validate(data, context={"today": date(2026, 11, 24)})


def test_low_confidence_critical_field_routes_to_review(client):
    text = (ROOT / "demo" / "pack" / "D02.pdf").read_bytes()
    raw = offline_parser.parse_pdf(text)
    raw.total_amount = FieldValue[str](value="1,030,925.00", confidence=Confidence.LOW, raw_snippet="Total: 1,O30,925.00")

    def fake_gemini(data, mime, settings):
        return raw, "fake-model", [{"engine": "gemini:fake-model", "ok": True}]
    client.app.state.gemini = fake_gemini
    from dataclasses import replace
    client.app.state.settings = replace(client.app.state.settings, gemini_api_key="test-key")
    r = client.post("/api/documents", files=[("files", ("D02.pdf", text, "application/pdf"))]).json()["results"][0]
    assert r["engine"] == "gemini:fake-model"
    assert r["gate_flags"] == ["LOW_CONFIDENCE_CRITICAL_FIELD"]
    client.post("/api/runs/evaluate")
    d = client.get("/api/decisions").json()[0]
    assert d["status"] == "NEEDS_HUMAN_REVIEW" and d["excluded_from_totals"]


def test_image_without_gemini_is_offline_no_ocr(client):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    r = client.post("/api/documents", files=[("files", ("scan.png", png, "image/png"))]).json()["results"][0]
    assert r["engine"] == "none" and r["gate_flags"] == ["OFFLINE_NO_OCR"]
    client.post("/api/runs/evaluate")
    d = client.get("/api/decisions").json()[0]
    assert d["status"] == "NEEDS_HUMAN_REVIEW"


def test_g2_magic_bytes_and_size(client):
    r = client.post("/api/documents", files=[("files", ("fake.pdf", b"MZ\x90\x00not a pdf", "application/pdf"))]).json()
    assert r["results"][0]["error"]["code"] == "UNSUPPORTED_TYPE"
    big = b"%PDF-" + b"0" * (10 * 1024 * 1024)
    r = client.post("/api/documents", files=[("files", ("big.pdf", big, "application/pdf"))]).json()
    assert r["results"][0]["error"]["code"] == "TOO_LARGE"
    assert client.get("/api/documents").json() == []


def test_g4_normalizes_dates_and_identifiers():
    raw = offline_parser.parse_text(
        "Vendor: A Ltd\nVendor TIN: 20456781-0001\nInvoice No: X1\nInvoice Date: 02 Nov 2026\nPO Ref: po 2026/0101\n"
        "Bank NUBAN: 2034 5678 11\nPhone: +234 803 111 0001\nLINE | x | 1 | 100.00 | 100.00\n"
        "Subtotal: NGN 100.00\nVAT (7.5%): ₦7.50\nTotal: 107.50\n")
    norm, errs = normalize(raw)
    assert errs == []
    assert norm["invoice_date"] == date(2026, 11, 2)
    assert norm["bank_nuban"] == "2034567811" and norm["phone"] == "8031110001"
    raw2 = offline_parser.parse_text(raw_text := "Vendor: A\nInvoice No: 1\nInvoice Date: 02/11/2026\nTotal: 1.234,00\n")
    norm2, errs2 = normalize(raw2)
    assert norm2["invoice_date"] == date(2026, 11, 2)
    assert any("total_amount" in e for e in errs2) and raw_text
