"""T17 idempotent re-upload; audit triggers; chain verify; tamper detection."""
import sqlite3

import pytest

from app import audit, db


def _db(tmp_path):
    p = str(tmp_path / "a.db")
    db.migrate(p)
    return p


def test_chain_verifies(tmp_path):
    p = _db(tmp_path)
    with db.session(p) as c:
        for i in range(5):
            audit.append(c, "TEST", "x", i, {"i": i})
    c = db.connect(p)
    assert audit.verify(c) == {"ok": True, "checked": 5, "first_bad_id": None}


def test_triggers_block_update_and_delete(tmp_path):
    p = _db(tmp_path)
    with db.session(p) as c:
        audit.append(c, "TEST", "x", 1, {"a": 1})
    c = db.connect(p)
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        c.execute("UPDATE audit_events SET actor='evil'")
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        c.execute("DELETE FROM audit_events")


def test_tamper_detected(tmp_path):
    p = _db(tmp_path)
    with db.session(p) as c:
        for i in range(4):
            audit.append(c, "TEST", "x", i, {"amount": "100.00"})
    c = db.connect(p)
    c.execute("DROP TRIGGER audit_no_update")
    c.execute("UPDATE audit_events SET payload_json='{\"amount\":\"999.00\"}' WHERE id=3")
    res = audit.verify(c)
    assert res["ok"] is False and res["first_bad_id"] == 3 and res["checked"] == 2


def test_tamper_on_envelope_column_detected(tmp_path):
    p = _db(tmp_path)
    with db.session(p) as c:
        audit.append(c, "TEST", "x", 1, {"a": 1})
    c = db.connect(p)
    c.execute("DROP TRIGGER audit_no_update")
    c.execute("UPDATE audit_events SET event_type='OTHER' WHERE id=1")
    assert audit.verify(c)["first_bad_id"] == 1

