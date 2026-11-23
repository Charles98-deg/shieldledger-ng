"""Per-batch Gemini circuit breaker: one failed/timed-out call per batch, then offline for the rest."""
from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from app import config
from app.extraction import gemini_client
from app.extraction.pipeline import run_extraction

PACK = Path(__file__).resolve().parents[2] / "demo" / "pack"
PDFS = sorted(PACK.glob("*.pdf"))


class Counter:
    def __init__(self):
        self.calls: list[str] = []
        self.timeouts: list[int | None] = []


def fake_genai(monkeypatch, behaviour):
    """Patch the SDK client; `behaviour(model)` returns a response text or raises."""
    import google.genai as genai

    seen = Counter()

    class FakeModels:
        def generate_content(self, model, contents, config):
            seen.calls.append(model)
            text = behaviour(model)

            class R:
                pass
            r = R()
            r.text = text
            return r

    class FakeClient:
        def __init__(self, api_key=None, http_options=None):
            seen.timeouts.append(getattr(http_options, "timeout", None))
            self.models = FakeModels()

    monkeypatch.setattr(genai, "Client", FakeClient)
    return seen


def with_key(client):
    client.app.state.settings = replace(client.app.state.settings, gemini_api_key="test-key")


def upload_pack(client):
    files = [("files", (p.name, p.read_bytes(), "application/pdf")) for p in PDFS]
    return client.post("/api/documents", files=files).json()["results"]


def test_timeout_default_is_20s():
    assert config.gemini_timeout_s(None) == 20 and config.gemini_timeout_s("") == 20


def test_timeout_floor_is_10s(monkeypatch):
    """Gemini rejects deadlines under 10 s, so smaller values are raised to 10."""
    assert config.gemini_timeout_s("8") == 10
    assert config.gemini_timeout_s("0") == 10
    assert config.gemini_timeout_s("10") == 10
    assert config.gemini_timeout_s("45") == 45
    monkeypatch.setenv("GEMINI_TIMEOUT_S", "8")
    assert config.get_settings().gemini_timeout_s == 10
    with pytest.raises(ValueError):
        config.gemini_timeout_s("8.5")


def test_timeout_floor_reaches_the_sdk(monkeypatch):
    def timeout(model):
        raise httpx.ReadTimeout("timed out")
    seen = fake_genai(monkeypatch, timeout)
    s = replace(config.get_settings(), gemini_api_key="test-key", gemini_timeout_s=config.gemini_timeout_s("5"))
    run_extraction(PDFS[0].read_bytes(), "application/pdf", s)
    assert seen.timeouts == [10_000]


def test_mocked_timeout_one_gemini_attempt_per_upload_batch(client, monkeypatch):
    def timeout(model):
        raise httpx.ReadTimeout("timed out")
    seen = fake_genai(monkeypatch, timeout)
    with_key(client)
    results = upload_pack(client)
    assert len(results) == 12 and all(r["engine"] == "offline_regex" for r in results)
    assert seen.calls == ["gemini-3.5-flash-lite"]          # one attempt, no fallbacks, no retries per document
    assert seen.timeouts == [20_000]
    docs = client.get("/api/documents").json()
    assert len(docs) == 12
    # the skipped documents say so explicitly (never silently)
    first = client.get(f"/api/documents/{results[0]['document_id']}").json()
    later = client.get(f"/api/documents/{results[5]['document_id']}").json()
    assert "ReadTimeout" in str(first)
    assert "circuit open for this batch" in str(later)
    assert client.get("/api/health").json()["extraction"]["gemini_state"] == "failing"


def test_breaker_resets_between_batches(client, monkeypatch):
    def timeout(model):
        raise httpx.ReadTimeout("timed out")
    seen = fake_genai(monkeypatch, timeout)
    with_key(client)
    one = [("files", (PDFS[0].name, PDFS[0].read_bytes(), "application/pdf"))]
    two = [("files", (p.name, p.read_bytes(), "application/pdf")) for p in PDFS[1:3]]
    client.post("/api/documents", files=one)
    client.post("/api/documents", files=two)
    assert len(seen.calls) == 2  # one per batch


def test_mocked_timeout_one_attempt_in_reset_demo(client, monkeypatch):
    def timeout(model):
        raise httpx.ConnectTimeout("connect timed out")
    seen = fake_genai(monkeypatch, timeout)
    with_key(client)
    r = client.post("/api/dev/reset-demo").json()
    assert r["ingested"] == 12 and r["engines"] == ["offline_regex"] and r["gemini_calls"] == 1
    assert len(seen.calls) == 1


def test_invalid_key_is_fatal_no_fallbacks(monkeypatch):
    def bad_key(model):
        raise RuntimeError("400 INVALID_ARGUMENT. API key not valid. reason API_KEY_INVALID")
    seen = fake_genai(monkeypatch, bad_key)
    s = replace(config.get_settings(), gemini_api_key="test-key")
    b = gemini_client.Breaker()
    for p in PDFS[:4]:
        raw, engine, _ = run_extraction(p.read_bytes(), "application/pdf", s, breaker=b)
        assert engine == "offline_regex" and raw is not None
    assert seen.calls == ["gemini-3.5-flash-lite"] and b.is_open and b.calls == 1


def test_model_specific_failure_does_not_trip_breaker(monkeypatch):
    """Schema mismatch is per-model: each document walks the chain, and the breaker stays closed."""
    seen = fake_genai(monkeypatch, lambda model: '{"not": "the schema"}')
    s = replace(config.get_settings(), gemini_api_key="test-key")
    b = gemini_client.Breaker()
    for p in PDFS[:2]:
        _, engine, _ = run_extraction(p.read_bytes(), "application/pdf", s, breaker=b)
        assert engine == "offline_regex"
    assert seen.calls == ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"] * 2
    assert not b.is_open and b.failures == 2


def _api_error(code: int, status: str, message: str):
    from google.genai import errors
    return errors.ClientError(code, {"error": {"code": code, "status": status, "message": message}})


def _valid_llm_json() -> str:
    f = lambda v: {"value": v, "confidence": "HIGH", "raw_snippet": v}  # noqa: E731
    doc = {k: f(v) for k, v in {
        "vendor_name": "Efik Agro-Inputs Ltd", "vendor_tin": "20456781-0001", "invoice_number": "EAI-2026-0417",
        "invoice_date": "2026-11-10", "po_reference": "PO-7001", "currency": "NGN", "subtotal": "4,750,000.00",
        "vat_amount": "356,250.00", "vat_rate_printed": "7.5%", "total_amount": "5,106,250.00",
        "bank_nuban": None, "phone": None}.items()}
    doc["line_items"] = [{"description": f("Fertiliser"), "quantity": f("100"), "unit_price": f("47,500.00"), "amount": f("4,750,000.00")}]
    import json
    return json.dumps(doc)


def test_400_on_one_model_falls_through_to_next(monkeypatch):
    """A 400 INVALID_ARGUMENT (e.g. "Minimum allowed deadline is 10s") is a configuration error for that
    model: the next model is tried, and its success is used. The breaker stays closed."""
    def behaviour(model):
        if model == "gemini-3.5-flash-lite":
            raise _api_error(400, "INVALID_ARGUMENT", "Minimum allowed deadline is 10s")
        return _valid_llm_json()
    seen = fake_genai(monkeypatch, behaviour)
    s = replace(config.get_settings(), gemini_api_key="test-key")
    b = gemini_client.Breaker()
    raw, engine, attempts = run_extraction(PDFS[0].read_bytes(), "application/pdf", s, breaker=b)
    assert seen.calls == ["gemini-3.5-flash-lite", "gemini-3.6-flash"]
    assert engine == "gemini:gemini-3.6-flash" and raw.vendor_name.value == "Efik Agro-Inputs Ltd"
    assert attempts[0]["ok"] is False and attempts[0]["kind"] == "model" and "deadline" in attempts[0]["error"]
    assert attempts[1] == {"engine": "gemini:gemini-3.6-flash", "ok": True}
    assert not b.is_open


@pytest.mark.parametrize("code,status,msg,kind", [
    (400, "INVALID_ARGUMENT", "API key not valid. reason API_KEY_INVALID", "auth"),
    (403, "PERMISSION_DENIED", "denied", "auth"),
    (429, "RESOURCE_EXHAUSTED", "quota exceeded", "quota"),
])
def test_auth_and_quota_errors_trip_breaker(monkeypatch, code, status, msg, kind):
    def behaviour(model):
        raise _api_error(code, status, msg)
    seen = fake_genai(monkeypatch, behaviour)
    s = replace(config.get_settings(), gemini_api_key="test-key")
    b = gemini_client.Breaker()
    for p in PDFS[:3]:
        _, engine, attempts = run_extraction(p.read_bytes(), "application/pdf", s, breaker=b)
        assert engine == "offline_regex"
    assert seen.calls == ["gemini-3.5-flash-lite"] and b.is_open
    assert gemini_client.classify(_api_error(code, status, msg)) == kind


def test_deadline_400_is_not_fatal():
    assert gemini_client.classify(_api_error(400, "INVALID_ARGUMENT", "Minimum allowed deadline is 10s")) == "model"


def test_sdk_vendored_timeout_classes_are_connectivity():
    """The SDK's transport may be a vendored httpx (httpx2) or requests; their timeouts must still trip."""
    class TimeoutException(Exception):
        pass

    class ReadTimeout(TimeoutException):  # mimics httpx2.ReadTimeout: not a subclass of httpx's
        pass
    assert gemini_client.classify(ReadTimeout("The read operation timed out")) == "connectivity"
    import requests
    assert gemini_client.classify(requests.exceptions.ReadTimeout("timed out")) == "connectivity"
    assert gemini_client.classify(ValueError("schema mismatch")) == "model"


def test_server_deadline_504_counts_as_timeout():
    from google.genai import errors
    e = errors.ServerError(504, {"error": {"code": 504, "status": "DEADLINE_EXCEEDED", "message": "Deadline expired"}})
    assert gemini_client.classify(e) == "connectivity"
    assert gemini_client.classify(_api_error(404, "NOT_FOUND", "model no longer available")) == "model"


def test_no_key_never_constructs_client(client, monkeypatch):
    seen = fake_genai(monkeypatch, lambda model: pytest.fail("Gemini must not be called without a key"))
    client.app.state.settings = replace(client.app.state.settings, gemini_api_key=None)
    results = upload_pack(client)
    assert all(r["engine"] == "offline_regex" for r in results)
    assert seen.calls == [] and seen.timeouts == []
    h = client.get("/api/health").json()["extraction"]
    assert h["gemini_state"] == "not_configured" and h["gemini_active_model"] is None


def test_health_active_model_only_after_success(client, monkeypatch):
    with_key(client)
    h = client.get("/api/health").json()["extraction"]
    assert h["gemini_state"] == "configured_unused" and h["gemini_active_model"] is None

    from app.models.raw import RawInvoice

    def ok(data, mime, settings):
        return RawInvoice(), "fake-model", [{"engine": "gemini:fake-model", "ok": True}]
    client.app.state.gemini = ok
    client.post("/api/documents", files=[("files", (PDFS[0].name, PDFS[0].read_bytes(), "application/pdf"))])
    h = client.get("/api/health").json()["extraction"]
    assert h["gemini_state"] == "active" and h["gemini_active_model"] == "fake-model"
