"""T04 conservation per decision · T05 per-document goldens · T06/T20 golden totals end-to-end."""
from decimal import Decimal

import pytest

from tests.conftest import GOLDEN, ROOT

FIELDS = ("gross", "wht_to_remit", "net_safe_payable", "blocked_or_hold", "overpayment_blocked", "recoverable_input_vat")


@pytest.fixture(scope="module")
def rows(pack_client):
    return {d["doc_label"]: d for d in pack_client.get("/api/decisions").json()}


def test_all_pack_docs_used_offline_engine(rows):
    for k in GOLDEN["per_document"]:
        assert rows[k]["engine"] == "offline_regex"


@pytest.mark.parametrize("doc", sorted(GOLDEN["per_document"]))
def test_t05_per_document_golden(rows, doc):
    exp = GOLDEN["per_document"][doc]
    got = rows[doc]
    assert got["status"] == exp["status"]
    assert sorted(f["code"] for f in got["flags"]) == sorted(exp["flags"])
    if exp.get("excluded"):
        assert got["excluded_from_totals"] is True
        return
    for f in FIELDS:
        assert got[f] == exp[f], (doc, f)
    s105 = GOLDEN["s105_per_document"].get(doc)
    got105 = [e["amount"] for e in got["contingent_exposures"] if e["rule_id"] == "WHT_FAILURE_TO_DEDUCT"]
    assert got105 == ([s105] if s105 else [])


def test_t04_conservation_every_decision(rows):
    for label, d in rows.items():
        net, wht, held, gross = (Decimal(d[k]) for k in ("net_safe_payable", "wht_to_remit", "blocked_or_hold", "gross"))
        assert net + wht + held == gross, label
        assert Decimal(d["overpayment_blocked"]) + Decimal(d["pending_verification"]) == held, label


def test_t06_t20_summary_equals_golden(pack_client):
    s = pack_client.get("/api/summary").json()
    for k, v in GOLDEN["summary"].items():
        assert s[k] == v, k


def test_headline_metrics_never_summed(pack_client):
    s = pack_client.get("/api/summary").json()
    assert "grand_total" not in s and set(s["direct_cash"]) == {"input_vat_identified", "overpayments_blocked", "total"}


def test_every_flag_has_cited_evidence(pack_client, rows):
    allowed = {"SECONDARY_VERIFIED", "CONFLICTING", "BRIEF_ONLY", "UNVERIFIED", "BUYER_POLICY"}
    for label, d in rows.items():
        ev = d.get("evidence") or pack_client.get(f"/api/decisions/{d['invoice_id']}/evidence").json()["evidence"]
        assert ev, label
        for s in ev:
            assert s["cite"] and s["status"] in allowed and s["rule_version"] == 1
        if d["flags"]:
            assert len(ev) >= 1


def test_pattern_rows_present(rows):
    assert rows["PO-9001"]["kind"] == "PO_PATTERN" and rows["PO-9002"]["kind"] == "PO_PATTERN"
    assert rows["V-ANWANA"]["kind"] == "VENDOR_PATTERN"
    assert "PO-9101" not in rows and "PO-9201" not in rows and "V-AKPABUYO" not in rows


def test_evaluate_is_idempotent(pack_client):
    before = pack_client.get("/api/decisions").json()
    pack_client.post("/api/runs/evaluate")
    after = pack_client.get("/api/decisions").json()
    assert before == after
    assert pack_client.get("/api/audit/verify").json()["ok"] is True


def test_rules_endpoint_and_csv(pack_client):
    rules = pack_client.get("/api/rules").json()
    ids = {r["id"] for r in rules["rules"]}
    assert {"VAT_RATE", "WHT_RATES", "FTZ_DOMESTIC_THRESHOLD", "UNREGISTERED_CONTRACTOR_FINE"} <= ids
    assert all(r["status"] != "VERIFIED_PRIMARY" for r in rules["rules"])
    csv = pack_client.get("/api/export/decisions.csv").text
    assert csv.splitlines()[0].startswith("kind,doc_label") and "D01" in csv


def test_independent_calc_agrees_with_golden():
    import json
    import subprocess
    import sys
    out = subprocess.run([sys.executable, str(ROOT / "scripts" / "independent_calc.py")], capture_output=True,
                         text=True, check=True).stdout
    t = json.loads(out)
    s = GOLDEN["summary"]
    assert t["gross"] == s["conservation"]["gross"] and t["net"] == s["conservation"]["net_safe_payable"]
    assert t["wht"] == s["conservation"]["wht_to_remit"] and t["held"] == s["conservation"]["blocked_or_hold"]
    assert t["direct_cash"] == s["direct_cash"]["total"] and t["contingent"] == s["contingent_fines_blocked"]["total"]
