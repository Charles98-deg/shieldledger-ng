"""T17 idempotent re-upload; audit triggers; chain verify; tamper detection."""
import sqlite3

import pytest

from app import audit, db
from tests.conftest import ROOT


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


def test_idempotent_reupload(client):
    pdf = (ROOT / "demo" / "pack" / "D01.pdf").read_bytes()
    r1 = client.post("/api/documents", files=[("files", ("D01.pdf", pdf, "application/pdf"))]).json()["results"][0]
    r2 = client.post("/api/documents", files=[("files", ("D01-copy.pdf", pdf, "application/pdf"))]).json()["results"][0]
    assert r1["idempotent_replay"] is False
    assert r2["idempotent_replay"] is True and r2["document_id"] == r1["document_id"]
    assert len(client.get("/api/documents").json()) == 1
    events = [e["event_type"] for e in client.get("/api/audit").json()]
    assert "DOCUMENT_REPLAYED" in events
    assert client.get("/api/audit/verify").json()["ok"] is True


def test_policy_change_is_audited(client):
    r = client.put("/api/policies", json={"PRICE_VARIANCE_TOL": "0.020"})
    assert r.status_code == 200, r.text
    ev = [e for e in client.get("/api/audit").json() if e["event_type"] == "POLICY_CHANGED"]
    assert ev and ev[0]["payload"] == {"key": "PRICE_VARIANCE_TOL", "old": "0.010", "new": "0.020"}
    assert client.put("/api/policies", json={"PRICE_VARIANCE_TOL": "abc"}).status_code == 422
