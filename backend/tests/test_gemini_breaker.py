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


def test_timeout_is_8s():
    assert config.GEMINI_TIMEOUT_MS == 8_000


def test_mocked_timeout_one_gemini_attempt_per_upload_batch(client, monkeypatch):
    def timeout(model):
        raise httpx.ReadTimeout("timed out")
    seen = fake_genai(monkeypatch, timeout)
    with_key(client)
    results = upload_pack(client)
    assert len(results) == 12 and all(r["engine"] == "offline_regex" for r in results)
    assert seen.calls == ["gemini-3.8-flash"]          # one attempt, no fallbacks, no retries per document
    assert seen.timeouts == [8_000]
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
    assert seen.calls == ["gemini-3.8-flash"] and b.is_open and b.calls == 1


def test_model_specific_failure_walks_chain_once_then_opens(monkeypatch):
    """Schema failure is model-specific: first document tries every fallback; the rest of the batch skips."""
    seen = fake_genai(monkeypatch, lambda model: '{"not": "the schema"}')
    s = replace(config.get_settings(), gemini_api_key="test-key")
    b = gemini_client.Breaker()
    for p in PDFS[:3]:
        run_extraction(p.read_bytes(), "application/pdf", s, breaker=b)
    assert seen.calls == ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash-lite"]


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
