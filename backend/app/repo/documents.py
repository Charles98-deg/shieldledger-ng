"""Documents, extractions and invoice rows."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def by_sha(conn: sqlite3.Connection, sha: str) -> dict | None:
    r = conn.execute("SELECT * FROM documents WHERE sha256=?", (sha,)).fetchone()
    return dict(r) if r else None


def insert_document(conn: sqlite3.Connection, sha: str, filename: str, mime: str, size: int) -> int:
    cur = conn.execute("INSERT INTO documents(sha256,filename,mime,size,uploaded_at) VALUES (?,?,?,?,?)",
                       (sha, filename, mime, size, now_iso()))
    return int(cur.lastrowid)


def insert_extraction(conn: sqlite3.Connection, document_id: int, engine: str, raw_json: str, attempts: list[dict]) -> int:
    cur = conn.execute("INSERT INTO extractions(document_id,engine,raw_json,attempts_json,created_at) VALUES (?,?,?,?,?)",
                       (document_id, engine, raw_json, json.dumps(attempts), now_iso()))
    return int(cur.lastrowid)


def insert_invoice(conn: sqlite3.Connection, row: dict) -> int:
    cols = ", ".join(row.keys())
    ph = ", ".join("?" for _ in row)
    cur = conn.execute(f"INSERT INTO invoices({cols}) VALUES ({ph})", tuple(row.values()))
    return int(cur.lastrowid)


_DOC_SQL = """
SELECT d.*, e.engine, e.attempts_json, i.id AS invoice_id, i.status_gate, i.vendor_name, i.vendor_resolved_id,
       i.vendor_candidate_id, i.number, i.total
FROM documents d
LEFT JOIN extractions e ON e.document_id = d.id
LEFT JOIN invoices i ON i.document_id = d.id
"""


def list_documents(conn: sqlite3.Connection) -> list[dict]:
    return [_doc(r) for r in conn.execute(_DOC_SQL + " ORDER BY d.filename, d.id")]


def get_document(conn: sqlite3.Connection, doc_id: int) -> dict | None:
    r = conn.execute(_DOC_SQL + " WHERE d.id=?", (doc_id,)).fetchone()
    if not r:
        return None
    out = _doc(r)
    ex = conn.execute("SELECT raw_json FROM extractions WHERE document_id=?", (doc_id,)).fetchone()
    out["raw_extraction"] = json.loads(ex["raw_json"]) if ex else None
    inv = conn.execute("SELECT gate_flags_json, verified_json FROM invoices WHERE document_id=?", (doc_id,)).fetchone()
    if inv:
        out["gate_flags"] = json.loads(inv["gate_flags_json"])
        out["verified"] = json.loads(inv["verified_json"]) if inv["verified_json"] else None
    return out


def _doc(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["attempts"] = json.loads(d.pop("attempts_json") or "[]")
    return d


def invoices(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT i.*, d.filename, e.raw_json, e.engine FROM invoices i JOIN documents d ON d.id=i.document_id"
        " LEFT JOIN extractions e ON e.document_id=d.id ORDER BY d.filename, i.id").fetchall()
    return [dict(r) for r in rows]
