"""SQLite persistence. Money columns are TEXT holding Decimal strings.

Only this module and app/repo/ know SQL; swapping to Postgres means re-implementing
these two layers (see docs/ARCHITECTURE.md).
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sha256 TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS extractions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  engine TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  attempts_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id),
  vendor_name TEXT,
  vendor_norm TEXT,
  vendor_resolved_id TEXT,
  vendor_candidate_id TEXT,
  number TEXT,
  date TEXT,
  currency TEXT,
  po_reference TEXT,
  subtotal TEXT,
  vat_amount TEXT,
  total TEXT,
  tin TEXT,
  nuban TEXT,
  phone TEXT,
  status_gate TEXT NOT NULL,
  gate_flags_json TEXT NOT NULL DEFAULT '[]',
  verified_json TEXT
);
CREATE TABLE IF NOT EXISTS vendors(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tin TEXT,
  nuban TEXT,
  phone TEXT
);
CREATE TABLE IF NOT EXISTS purchase_orders(
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  po_date TEXT NOT NULL,
  total_amount TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS po_lines(
  po_id TEXT NOT NULL REFERENCES purchase_orders(id),
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  qty TEXT NOT NULL,
  unit_price TEXT NOT NULL,
  uom TEXT NOT NULL,
  category TEXT NOT NULL,
  wht_category TEXT NOT NULL,
  vat_treatment TEXT NOT NULL CHECK (vat_treatment IN ('STANDARD','EXEMPT','ZERO')),
  PRIMARY KEY (po_id, line_no)
);
CREATE TABLE IF NOT EXISTS grns(
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id),
  line_no INTEGER NOT NULL,
  delivered_qty TEXT NOT NULL,
  signed INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS nrs_taxpayer_registry(
  tin TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vat_registered INTEGER NOT NULL,
  small_business INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS employee_payroll(
  emp_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nuban TEXT,
  phone TEXT
);
CREATE TABLE IF NOT EXISTS decisions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  invoice_id INTEGER REFERENCES invoices(id),
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL,
  gross TEXT NOT NULL,
  approved_gross TEXT NOT NULL,
  wht_to_remit TEXT NOT NULL,
  net_safe_payable TEXT NOT NULL,
  blocked_or_hold TEXT NOT NULL,
  recoverable_input_vat TEXT NOT NULL,
  overpayment_blocked TEXT NOT NULL,
  pending_verification TEXT NOT NULL,
  advisory_self_account TEXT NOT NULL,
  excluded INTEGER NOT NULL,
  decision_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flags(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_steps(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  cite TEXT NOT NULL,
  status TEXT NOT NULL,
  step_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policy_settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ftz_ledger(
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('EXPORT','INTRA_ZONE','DOMESTIC_CUSTOMS_TERRITORY')),
  customer TEXT NOT NULL,
  invoice_ref TEXT NOT NULL,
  amount TEXT NOT NULL,
  related_party_outsourced INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
"""


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def migrate(db_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()


@contextmanager
def session(db_path: str) -> Iterator[sqlite3.Connection]:
    """One connection, one transaction (BEGIN IMMEDIATE serializes writers)."""
    conn = connect(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def destroy(db_path: str) -> None:
    """Dev-only: remove the database files entirely (used by reset-demo)."""
    for suffix in ("", "-wal", "-shm"):
        p = Path(db_path + suffix)
        if p.exists():
            p.unlink()
