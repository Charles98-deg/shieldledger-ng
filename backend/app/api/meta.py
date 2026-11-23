from __future__ import annotations

import json
import time

from fastapi import APIRouter, HTTPException, Request

from app import audit, db, service
from app.api.deps import read, today, write
from app.config import DEMO_PACK_DIR, SEED_DIR
from app.extraction import gemini_client
from app.extraction.pipeline import ingest
from app.repo import master
from app.rules.loader import rules

router = APIRouter(tags=["meta"])


@router.get("/rules")
def get_rules() -> dict:
    rp = rules()
    return {"pack": rp.pack, "effective_date": rp.effective_date, "rules": rp.as_list(),
            "disclaimer": ("Most rule citations come from law-firm and tax-practitioner summaries of the gazetted Acts; "
                           "verify against the Official Gazette (No. 117, Vol. 112, 26 June 2025) before relying on them.")}


@router.get("/audit")
def get_audit(request: Request, limit: int = 200) -> list[dict]:
    with read(request) as conn:
        return audit.list_events(conn, min(max(limit, 1), 1000))


@router.get("/audit/verify")
def verify(request: Request) -> dict:
    with read(request) as conn:
        return audit.verify(conn)


@router.get("/health")
def health(request: Request) -> dict:
    s = request.app.state.settings
    with read(request) as conn:
        conn.execute("SELECT 1").fetchone()
    return {
        "status": "ok", "app_env": s.app_env, "today": today(request).isoformat(), "rules_pack": rules().pack,
        "extraction": {"gemini_available": gemini_client.available(s), "gemini_model": s.gemini_model,
                       "gemini_fallback_models": list(s.gemini_fallback_models), "offline_parser": True},
    }


@router.get("/field-validation")
def field_validation() -> dict:
    data = json.loads((SEED_DIR / "field_validation.json").read_text(encoding="utf-8"))
    quotes = [q for q in data.get("quotes", []) if q.get("ok_to_quote")]
    return {"quotes": quotes[:3], "company_examples": data.get("company_examples", [])[:3],
            "label": "Field validation (self-reported by builder)"}


def reset_demo(app_state, ingest_pack: bool = True) -> dict:
    t0 = time.perf_counter()
    db.destroy(app_state.db_path)
    db.migrate(app_state.db_path)
    with db.session(app_state.db_path) as conn:
        counts = master.seed_all(conn, SEED_DIR)
        audit.append(conn, "DEMO_RESET", "system", "seed", counts, actor="dev")
    ingested = []
    if ingest_pack:
        for pdf in sorted(DEMO_PACK_DIR.glob("*.pdf")):
            with db.session(app_state.db_path) as conn:
                ingested.append(ingest(conn, pdf.read_bytes(), pdf.name, app_state.settings, app_state.clock.today(),
                                       gemini=app_state.gemini, actor="dev"))
        with db.session(app_state.db_path) as conn:
            service.evaluate_all(conn, app_state.clock.today(), actor="dev")
    return {"seeded": counts, "ingested": len(ingested), "seconds": f"{time.perf_counter() - t0:.2f}",
            "engines": sorted({i.get("engine", "") for i in ingested})}


@router.post("/dev/reset-demo")
def dev_reset(request: Request, ingest_pack: bool = True) -> dict:
    if request.app.state.settings.app_env != "dev":
        raise HTTPException(404, "not found")
    return reset_demo(request.app.state, ingest_pack)
