"""Environment + buyer-policy defaults. Read at call time so tests can override env."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
SEED_DIR = BACKEND / "seed"
DEMO_PACK_DIR = ROOT / "demo" / "pack"
RULES_PATH = BACKEND / "app" / "rules" / "ng_2026_v1.yaml"

load_dotenv(ROOT / ".env")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = 64 * 1024 * 1024
# Per-call Gemini timeout in whole seconds (GEMINI_TIMEOUT_S). Gemini rejects deadlines under 10 s
# ("Minimum allowed deadline is 10s"), so smaller values are raised to the floor.
GEMINI_TIMEOUT_DEFAULT_S = 20
GEMINI_TIMEOUT_MIN_S = 10
ALLOWED_MIME = ("application/pdf", "image/png", "image/jpeg")

# Buyer policy defaults (status BUYER_POLICY). Values are strings; typed in rules/loader.py.
POLICY_DEFAULTS: dict[str, str] = {
    "PRICE_VARIANCE_TOL": "0.010",
    "QTY_TOL_DEFAULT": "0",
    "QTY_TOL_FUEL": "0.005",
    "DUP_FUZZY_MIN": "88",
    "DUP_WINDOW_DAYS": "30",
    "PO_APPROVAL_LIMIT": "5000000.00",
    "SPLIT_WINDOW_DAYS": "7",
    "SPLIT_BAND_LOW": "0.85",
    "SPLIT_BAND_HIGH": "0.999",
    "WHT_RENT_RATE": "",  # unset → POLICY_REQUIRED
    "LLM_MIN_CONFIDENCE": "MEDIUM",
    # statutory-interpretation toggles
    "SMALL_VENDOR_VAT_HOLD": "ON",
    "WHT_NO_TIN_DOUBLE": "ON",
    "WHT_SMALL_PAYER_EXEMPT": "OFF",
    "BUYER_IS_SMALL_COMPANY": "OFF",
    "FTZ_BOUNDARY": "AT_OR_ABOVE_BREACH",
    "MIN_ETR_ENABLED": "OFF",
    "CBN_MPR": "",  # user-entered; interest shown only when set
    "FTZ_ILLUSTRATIVE_PROFIT": "200000000.00",
}


@dataclass(frozen=True)
class Settings:
    app_env: str
    db_path: str
    gemini_api_key: str | None
    gemini_model: str
    gemini_fallback_models: tuple[str, ...]
    app_today: date | None
    gemini_timeout_s: int = GEMINI_TIMEOUT_DEFAULT_S


def gemini_timeout_s(raw: str | None) -> int:
    """Parse GEMINI_TIMEOUT_S: whole seconds, floored at GEMINI_TIMEOUT_MIN_S. A non-integer value is an error."""
    if raw is None or raw.strip() == "":
        return GEMINI_TIMEOUT_DEFAULT_S
    text = raw.strip()
    if not text.isdigit():
        raise ValueError(f"GEMINI_TIMEOUT_S must be a whole number of seconds, got {raw!r}")
    value = int(text)
    if value < GEMINI_TIMEOUT_MIN_S:
        logging.getLogger(__name__).warning(
            "GEMINI_TIMEOUT_S=%s is below Gemini's %ss minimum; using %ss", value, GEMINI_TIMEOUT_MIN_S, GEMINI_TIMEOUT_MIN_S)
        return GEMINI_TIMEOUT_MIN_S
    return value


def get_settings() -> Settings:
    fallbacks = os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.6-flash,gemini-2.5-flash-lite")
    today = os.getenv("APP_TODAY")
    return Settings(
        app_env=os.getenv("APP_ENV", "dev"),
        db_path=os.getenv("SHIELDLEDGER_DB", str(BACKEND / "shieldledger.db")),
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        gemini_fallback_models=tuple(m.strip() for m in fallbacks.split(",") if m.strip()),
        app_today=date.fromisoformat(today) if today else None,
        gemini_timeout_s=gemini_timeout_s(os.getenv("GEMINI_TIMEOUT_S")),
    )


class Clock:
    """Injectable clock. Tests pin it to 2026-11-23."""

    def __init__(self, fixed: date | None = None):
        self._fixed = fixed

    def today(self) -> date:
        if self._fixed is not None:
            return self._fixed
        env = get_settings().app_today
        return env or date.today()
