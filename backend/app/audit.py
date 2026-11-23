"""Hash-chained, append-only audit log.

hash_n = sha256(prev_hash || canonical_json(envelope_n)), where the envelope is
{ts, actor, event_type, entity_type, entity_id, payload}. Hashing the whole envelope
(not only the payload) means editing any column breaks the chain.
UPDATE/DELETE are blocked by SQLite triggers (see db.py).
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

GENESIS = "0" * 64


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _hash(prev_hash: str, envelope: dict) -> str:
    return hashlib.sha256((prev_hash + canonical_json(envelope)).encode("utf-8")).hexdigest()


def append(
    conn: sqlite3.Connection,
    event_type: str,
    entity_type: str,
    entity_id: str | int,
    payload: dict,
    actor: str = "system",
) -> str:
    row = conn.execute("SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1").fetchone()
    prev = row["hash"] if row else GENESIS
    ts = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    payload_json = canonical_json(payload)
    env = {
        "ts": ts,
        "actor": actor,
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "payload": json.loads(payload_json),
    }
    h = _hash(prev, env)
    conn.execute(
        "INSERT INTO audit_events(ts, actor, event_type, entity_type, entity_id, payload_json, prev_hash, hash)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (ts, actor, event_type, entity_type, str(entity_id), payload_json, prev, h),
    )
    return h


def verify(conn: sqlite3.Connection) -> dict:
    prev = GENESIS
    checked = 0
    for r in conn.execute("SELECT * FROM audit_events ORDER BY id ASC"):
        env = {
            "ts": r["ts"],
            "actor": r["actor"],
            "event_type": r["event_type"],
            "entity_type": r["entity_type"],
            "entity_id": r["entity_id"],
            "payload": json.loads(r["payload_json"]),
        }
        if r["prev_hash"] != prev or _hash(prev, env) != r["hash"]:
            return {"ok": False, "checked": checked, "first_bad_id": r["id"]}
        prev = r["hash"]
        checked += 1
    return {"ok": True, "checked": checked, "first_bad_id": None}


def list_events(conn: sqlite3.Connection, limit: int = 200) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [
        {**dict(r), "payload": json.loads(r["payload_json"])} for r in rows
    ]
