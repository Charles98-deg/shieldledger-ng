"""T13 registry guard · T14 small-vendor VAT hold · T15 VAT-omitted advisory."""
from decimal import Decimal

from app.engine.decide import decide
from app.engine.registry_guard import check
from app.models.enums import WhtCategory
from tests.conftest import mk_ctx, mk_invoice, mk_po, registry

SVC = WhtCategory.GENERAL_SERVICES


def test_t13_d06_blocked_with_5m_exposure(pack_client):
    d06 = next(d for d in pack_client.get("/api/decisions").json() if d["doc_label"] == "D06")
    assert d06["status"] == "BLOCKED"
    assert [f["code"] for f in d06["flags"]] == ["UNREGISTERED_VENDOR_BLOCKED"]
    assert d06["blocked_or_hold"] == d06["gross"] == "1773750.00"
    assert d06["contingent_exposures"] == [{"rule_id": "UNREGISTERED_CONTRACTOR_FINE",
                                            "label": "s.100(2) fine for contracting an unregistered person",
                                            "amount": "5000000.00", "counted_in_headline": True}]


def test_t13_unit_unregistered_and_missing():
    po = mk_po([(1, "1650000.00", SVC)])
    d = decide(mk_ctx(mk_invoice([(1, "1650000.00")], tin="31877420-0001"), po))
    assert d.status.value == "BLOCKED" and d.net_safe_payable == 0
    d5 = decide(mk_ctx(mk_invoice([(1, "650000.00")], tin=None), mk_po([(1, "650000.00", SVC)])))
    assert d5.status.value == "RELEASE"
    assert {f.code.value for f in d5.flags} == {"MISSING_TIN_DOUBLE_WHT"}
    assert d5.wht_to_remit == Decimal("26000.00") and d5.recoverable_input_vat == 0
    assert any("s.153" in s.result for s in d5.evidence)


def test_t13_tin_format_warning_chip_only():
    r = check("ABC-12", {})
    assert {f.code.value for f in r.flags} >= {"TIN_FORMAT_WARNING"}
    assert check("20456781-0001", registry()).flags == []


def test_t14_d08_holds_vat_only():
    po = mk_po([(1, "420000.00", SVC)])
    d = decide(mk_ctx(mk_invoice([(1, "420000.00")]), po, reg=registry(small=True, vat_reg=False)))
    assert d.status.value == "RELEASE_PARTIAL" and {f.code.value for f in d.flags} == {"INVALID_VAT_CHARGE_HOLD"}
    assert d.blocked_or_hold == d.pending_verification == Decimal("31500.00")
    assert d.net_safe_payable == Decimal("411600.00") and d.wht_to_remit == Decimal("8400.00")
    assert any(s.rule_id == "SMALL_BUSINESS_VAT_EFFECT" and s.status.value == "UNVERIFIED" for s in d.evidence)


def test_t14_toggle_off_releases_vat():
    from app.rules.loader import Policies
    po = mk_po([(1, "420000.00", SVC)])
    d = decide(mk_ctx(mk_invoice([(1, "420000.00")]), po, reg=registry(small=True, vat_reg=False),
                      policies=Policies.from_overrides(SMALL_VENDOR_VAT_HOLD="OFF")))
    assert d.status.value == "RELEASE" and d.blocked_or_hold == 0


def test_t15_d07_advisory_not_in_headline(pack_client):
    d07 = next(d for d in pack_client.get("/api/decisions").json() if d["doc_label"] == "D07")
    assert d07["advisory_self_account"] == "135000.00" and d07["status"] == "RELEASE"
    s = pack_client.get("/api/summary").json()
    assert s["advisories"]["vat_self_account"] == "135000.00"
    assert s["direct_cash"]["total"] == "7519300.00"
    assert s["contingent_fines_blocked"]["total"] == "5379152.00"
    assert d07["net_safe_payable"] == "1764000.00"  # advisory not deducted or added
