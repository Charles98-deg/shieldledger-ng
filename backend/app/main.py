"""FastAPI app factory. Read-only product: recommendations + evidence, no payments, no ERP write-back."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import db
from app.api import documents, ftz, meta, policies, runs
from app.extraction import gemini_client
from app.config import MAX_REQUEST_BYTES, SEED_DIR, Clock, get_settings
from app.repo import master


def create_app(db_path: str | None = None, clock: Clock | None = None, gemini=None, app_env: str | None = None) -> FastAPI:
    settings = get_settings()
    if app_env is not None:
        from dataclasses import replace
        settings = replace(settings, app_env=app_env)
    app = FastAPI(title="ShieldLedger NG", version="sprint-v1",
                  description="Pre-payment AP tax & leakage guard (Nigeria 2026). Read-only; demo data is fictional.")
    app.state.settings = settings
    app.state.db_path = db_path or settings.db_path
    app.state.clock = clock or Clock()
    app.state.gemini = gemini
    app.state.gemini_status = gemini_client.GeminiStatus()

    db.migrate(app.state.db_path)
    with db.session(app.state.db_path) as conn:
        if conn.execute("SELECT COUNT(*) AS n FROM vendors").fetchone()["n"] == 0:
            master.seed_all(conn, SEED_DIR)

    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                       allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > MAX_REQUEST_BYTES:
            return JSONResponse({"detail": "request body too large"}, status_code=413)
        return await call_next(request)

    for r in (documents.router, runs.router, policies.router, ftz.router, meta.router):
        app.include_router(r, prefix="/api")
    return app


app = create_app()
