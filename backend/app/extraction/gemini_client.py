"""Gemini transcription client. The model transcribes fields; Python decides everything.

Chain: GEMINI_MODEL → each GEMINI_FALLBACK_MODELS → (caller falls back to offline parser).
No model name is hard-coded beyond the env defaults in config.py.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
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
    """fatal=True: the chain stopped early on a failure no other model can fix (connectivity, auth, quota)."""

    def __init__(self, attempts: list[dict], fatal: bool = False):
        super().__init__("all Gemini models failed" if not fatal else "Gemini unavailable (connectivity/auth/quota)")
        self.attempts = attempts
        self.fatal = fatal


# Failure kinds. Only the first three are "fatal": they hit every model alike, so the chain stops
# and the per-batch breaker opens. A 504 DEADLINE_EXCEEDED counts as connectivity (it is a timeout). "model" covers configuration and per-model errors (400
# INVALID_ARGUMENT such as a too-short deadline, 404 unknown model, 5xx, schema mismatch): the next
# model in the chain is tried and the breaker stays closed.
FATAL_KINDS = ("connectivity", "auth", "quota")
_NET_CLASSES = {"TimeoutException", "ReadTimeout", "ConnectTimeout", "WriteTimeout", "PoolTimeout", "Timeout",
                "NetworkError", "ConnectError", "ReadError", "WriteError", "RemoteProtocolError", "ConnectionError"}


def classify(exc: BaseException) -> str:
    code = getattr(exc, "code", None)
    status = str(getattr(exc, "status", "") or "").upper()
    text = f"{type(exc).__name__}: {exc}".lower()
    if isinstance(code, int):
        if code in (401, 403) or "api_key_invalid" in text or "api key not valid" in text:
            return "auth"
        if code == 429 or status == "RESOURCE_EXHAUSTED":
            return "quota"
        if code == 504 or status == "DEADLINE_EXCEEDED":
            return "connectivity"  # the server-side twin of our own call timeout
        return "model"
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return "connectivity"
    # The SDK raises transport errors from httpx, its vendored httpx2, or requests, so match the
    # class hierarchy by name rather than by one library's types.
    if any(c.__name__ in _NET_CLASSES for c in type(exc).__mro__):
        return "connectivity"
    if "api_key_invalid" in text or "api key not valid" in text or "unauthenticated" in text or "permission_denied" in text:
        return "auth"
    if "resource_exhausted" in text or "quota" in text:
        return "quota"
    return "model"


def is_fatal(exc: BaseException) -> bool:
    return classify(exc) in FATAL_KINDS


@dataclass
class Breaker:
    """Per-batch circuit breaker. Opens on the first connectivity, auth or quota failure; later documents skip Gemini."""

    is_open: bool = False
    reason: str | None = None
    calls: int = 0          # documents sent to Gemini in this batch
    failures: int = 0       # documents where every model failed (fatal or not)
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
        elif breaker.is_open or breaker.failures:
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

    client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=settings.gemini_timeout_s * 1000))
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
            kind = classify(exc)
            attempts.append({"engine": f"gemini:{model}", "ok": False, "kind": kind,
                             "error": f"{type(exc).__name__}: {str(exc)[:300]}"})
            if kind in FATAL_KINDS:
                raise GeminiUnavailable(attempts, fatal=True) from exc
    raise GeminiUnavailable(attempts)
