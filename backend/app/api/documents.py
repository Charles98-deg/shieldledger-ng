from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.api.deps import read, today, write
from app.config import MAX_UPLOAD_BYTES
from app.extraction import gemini_client
from app.extraction.pipeline import IntakeError, ingest
from app.repo import documents as docs

router = APIRouter(tags=["documents"])


@router.post("/documents")
async def upload(request: Request, files: list[UploadFile] = File(...)) -> dict:
    results = []
    breaker = gemini_client.Breaker()  # one upload request = one batch
    for f in files:
        data = await f.read(MAX_UPLOAD_BYTES + 1)
        try:
            with write(request) as conn:
                results.append(ingest(conn, data, f.filename or "upload", request.app.state.settings, today(request),
                                      gemini=request.app.state.gemini, breaker=breaker))
        except IntakeError as ie:
            # rejection is audited inside ingest; persist that audit row in its own transaction
            with write(request) as conn:
                from app import audit
                audit.append(conn, "INTAKE_REJECTED", "upload", f.filename or "upload", {"reason": ie.code})
            results.append({"filename": f.filename, "error": {"code": ie.code, "message": str(ie), "http_status": ie.http_status}})
    request.app.state.gemini_status.record(breaker)
    return {"results": results}


@router.get("/documents")
def list_documents(request: Request) -> list[dict]:
    with read(request) as conn:
        return docs.list_documents(conn)


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, request: Request) -> dict:
    with read(request) as conn:
        d = docs.get_document(conn, doc_id)
    if not d:
        raise HTTPException(404, "document not found")
    return d
