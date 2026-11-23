"""Gemini transcription client. The model transcribes fields; Python decides everything.

Chain: GEMINI_MODEL → each GEMINI_FALLBACK_MODELS → (caller falls back to offline parser).
No model name is hard-coded beyond the env defaults in config.py.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.config import GEMINI_TIMEOUT_MS, Settings
from app.models.raw import RawInvoice, RawInvoiceLLM

PROMPT = (
    "You are transcribing a Nigerian supplier invoice. Return ONLY the JSON schema fields. "
    "For each field give the value exactly as printed (money as printed, e.g. '1,240,000.00'), "
    "a confidence (HIGH/MEDIUM/LOW) and raw_snippet = the exact text you read it from. "
    "If a field is not printed, value=null. If the supplier TIN is printed as MISSING or absent, value=null with HIGH "
    "confidence when you are sure it is absent. If VAT is printed as NOT CHARGED, value='NOT CHARGED'. "
    "Do not compute, correct or infer any amount. One line_items entry per printed invoice line."
)


class GeminiUnavailable(Exception):
    """fatal=True: a failure no other model can fix (timeout, auth, network), so the chain stopped early."""

    def __init__(self, attempts: list[dict], fatal: bool = False):
        super().__init__("all Gemini models failed" if not fatal else "Gemini failed (timeout/auth/network)")
        self.attempts = attempts
        self.fatal = fatal


_FATAL_MARKERS = ("timeout", "timed out", "deadline", "api_key_invalid", "api key not valid",
                  "permission_denied", "unauthenticated", "connecterror", "connection")


def is_fatal(exc: BaseException) -> bool:
    """Timeouts, auth and network errors hit every model in the chain alike: stop instead of retrying."""
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    try:
        import httpx
        if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
            return True
    except ImportError:  # pragma: no cover - httpx ships with google-genai
        pass
    if getattr(exc, "code", None) in (401, 403):
        return True
    text = f"{type(exc).__name__}: {exc}".lower()
    return any(m in text for m in _FATAL_MARKERS)


@dataclass
class Breaker:
    """Per-batch circuit breaker. Opens on the first failed Gemini document; later documents skip Gemini."""

    is_open: bool = False
    reason: str | None = None
    calls: int = 0          # documents sent to Gemini in this batch
    ok_model: str | None = None

    def trip(self, reason: str) -> None:
        self.is_open = True
        self.reason = reason


@dataclass
class GeminiStatus:
    """Process-wide extraction status shown in /api/health. 'active' only after a real successful call."""

    state: str = "configured_unused"  # configured_unused | active | failing
    active_model: str | None = None

    def record(self, breaker: Breaker) -> None:
        if breaker.ok_model and not breaker.is_open:
            self.state, self.active_model = "active", breaker.ok_model
        elif breaker.is_open:
            self.state, self.active_model = "failing", None


def available(settings: Settings) -> bool:
    return bool(settings.gemini_api_key)


def model_chain(settings: Settings) -> list[str]:
    return [settings.gemini_model, *settings.gemini_fallback_models]


def extract(data: bytes, mime: str, settings: Settings) -> tuple[RawInvoice, str, list[dict]]:
    """Return (raw invoice, model that succeeded, attempt log). Raises GeminiUnavailable."""
    attempts: list[dict] = []
    if not settings.gemini_api_key:
        attempts.append({"engine": "gemini", "ok": False, "error": "GEMINI_API_KEY not set"})
        raise GeminiUnavailable(attempts)
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS))
    for model in model_chain(settings):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=[types.Part.from_bytes(data=data, mime_type=mime), PROMPT],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", response_schema=RawInvoiceLLM, temperature=0),
            )
            parsed = RawInvoiceLLM.model_validate_json(resp.text or "")
            attempts.append({"engine": f"gemini:{model}", "ok": True})
            return parsed.to_raw(), model, attempts
        except Exception as exc:  # noqa: BLE001 - every failure is recorded, never swallowed
            attempts.append({"engine": f"gemini:{model}", "ok": False, "error": f"{type(exc).__name__}: {str(exc)[:300]}"})
            if is_fatal(exc):
                raise GeminiUnavailable(attempts, fatal=True) from exc
    raise GeminiUnavailable(attempts)
