"""Decisions, flags and evidence steps (derived data; rebuilt by each evaluation run)."""
from __future__ import annotations

import json
import sqlite3

from app.models.domain import Decision
from app.money import to_str
from app.repo.documents import now_iso

_MONEY = ("gross", "approved_gross", "wht_to_remit", "net_safe_payable", "blocked_or_hold",
          "recoverable_input_vat", "overpayment_blocked", "pending_verification", "advisory_self_account")


def replace_all(conn: sqlite3.Connection, decisions: list[Decision]) -> None:
    conn.execute("DELETE FROM evidence_steps")
    conn.execute("DELETE FROM flags")
    conn.execute("DELETE FROM decisions")
    ts = now_iso()
    for d in decisions:
        cur = conn.execute(
            f"INSERT INTO decisions(kind,invoice_id,subject_id,status,{','.join(_MONEY)},excluded,decision_json,created_at)"
            f" VALUES (?,?,?,?,{','.join('?' for _ in _MONEY)},?,?,?)",
            (d.kind, d.invoice_id, d.subject_id, d.status.value, *(to_str(getattr(d, m)) for m in _MONEY),
             int(d.excluded_from_totals), d.model_dump_json(), ts))
        did = cur.lastrowid
        for f in d.flags:
            conn.execute("INSERT INTO flags(decision_id,code,detail) VALUES (?,?,?)", (did, f.code.value, f.detail))
        for i, s in enumerate(d.evidence):
            conn.execute(
                "INSERT INTO evidence_steps(decision_id,seq,rule_id,rule_version,cite,status,step_json) VALUES (?,?,?,?,?,?,?)",
                (did, i, s.rule_id, s.rule_version, s.cite, s.status.value, s.model_dump_json()))


def all_decisions(conn: sqlite3.Connection) -> list[Decision]:
    return [Decision.model_validate_json(r["decision_json"])
            for r in conn.execute("SELECT decision_json FROM decisions ORDER BY id")]


def evidence_for_invoice(conn: sqlite3.Connection, invoice_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT e.step_json FROM evidence_steps e JOIN decisions d ON d.id=e.decision_id"
        " WHERE d.invoice_id=? ORDER BY e.seq", (invoice_id,)).fetchall()
    return [json.loads(r["step_json"]) for r in rows]
