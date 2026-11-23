from __future__ import annotations

import sqlite3

from app import audit
from app.config import POLICY_DEFAULTS
from app.repo.documents import now_iso
from app.rules.loader import Policies, validate_policy


def load(conn: sqlite3.Connection) -> Policies:
    d = dict(POLICY_DEFAULTS)
    for r in conn.execute("SELECT key, value FROM policy_settings"):
        if r["key"] in d:
            d[r["key"]] = r["value"]
    return Policies(d)


def update(conn: sqlite3.Connection, changes: dict[str, str], actor: str = "ui") -> dict[str, str]:
    current = load(conn).raw
    applied: dict[str, str] = {}
    for k, v in changes.items():
        val = validate_policy(k, v)
        if current.get(k) == val:
            continue
        conn.execute("INSERT INTO policy_settings(key,value,updated_at) VALUES (?,?,?)"
                     " ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                     (k, val, now_iso()))
        audit.append(conn, "POLICY_CHANGED", "policy", k, {"key": k, "old": current.get(k), "new": val}, actor=actor)
        applied[k] = val
    return applied
