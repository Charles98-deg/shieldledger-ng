"""T07 short delivery + fuel tolerance · T08 price variance · T09 unsigned GRN."""
from decimal import Decimal

import pytest

from app.engine.decide import decide
from app.models.enums import VatTreatment, WhtCategory
from tests.conftest import mk_ctx, mk_grns, mk_invoice, mk_po

FUEL = (10000, "1150.00", WhtCategory.GOODS, VatTreatment.EXEMPT, "LITRE", "FUEL")


def _codes(d):
    return {f.code.value for f in d.flags}


def test_t07_short_delivery_d01_shape():
    po = mk_po([(100, "47500.00")])
    d = decide(mk_ctx(mk_invoice([(100, "47500.00")]), po, mk_grns(po, [94])))
    assert d.status.value == "RELEASE_PARTIAL" and _codes(d) == {"SHORT_DELIVERY_HOLD"}
    assert d.approved_gross == Decimal("4799875.00")
    assert d.blocked_or_hold == d.overpayment_blocked == Decimal("306375.00")


@pytest.mark.parametrize("delivered,held", [(9960, False), (9950, True)])
def test_t07_fuel_tolerance(delivered, held):
    po = mk_po([FUEL])
    d = decide(mk_ctx(mk_invoice([(10000, "1150.00")], vat="0.00"), po, mk_grns(po, [delivered])))
    assert ("SHORT_DELIVERY_HOLD" in _codes(d)) is held
    if held:
        assert d.blocked_or_hold == Decimal("57500.00")  # 50 L × ₦1,150
    else:
        assert d.status.value == "RELEASE" and d.blocked_or_hold == 0


def test_t07_non_fuel_has_zero_tolerance():
    po = mk_po([(10000, "1150.00", WhtCategory.GOODS, VatTreatment.EXEMPT, "LITRE", "LUBRICANT")])
    d = decide(mk_ctx(mk_invoice([(10000, "1150.00")], vat="0.00"), po, mk_grns(po, [9960])))
    assert "SHORT_DELIVERY_HOLD" in _codes(d)


@pytest.mark.parametrize("price,held", [
    ("9590.00", False),   # 0.947%
    ("9595.00", False),   # exactly 1.0% → passes (strictly greater holds)
    ("9595.01", True),
    ("9650.00", True),    # 1.579%
])
def test_t08_price_variance(price, held):
    po = mk_po([(100, "9500.00")])
    d = decide(mk_ctx(mk_invoice([(100, price)]), po))
    assert ("PRICE_VARIANCE_HOLD" in _codes(d)) is held
    if held:
        assert d.approved_gross == Decimal("1021250.00")


def test_t08_d12_numbers():
    po = mk_po([(100, "9500.00")])
    d = decide(mk_ctx(mk_invoice([(100, "9650.00")]), po))
    assert (d.gross, d.wht_to_remit, d.net_safe_payable, d.blocked_or_hold) == (
        Decimal("1037375.00"), Decimal("19000.00"), Decimal("1002250.00"), Decimal("16125.00"))
    assert d.overpayment_blocked == Decimal("16125.00")


def test_t09_unsigned_grn_holds_line_pending():
    po = mk_po([(10, "1000.00"), (5, "2000.00")])
    grns = mk_grns(po)
    grns[2] = grns[2].model_copy(update={"signed": False})
    d = decide(mk_ctx(mk_invoice([(10, "1000.00"), (5, "2000.00")]), po, grns))
    assert "UNSIGNED_GRN_HOLD" in _codes(d)
    assert d.status.value == "RELEASE_PARTIAL"
    assert d.blocked_or_hold == Decimal("10750.00")  # 10,000 base + 750 VAT
    assert d.pending_verification == Decimal("10750.00") and d.overpayment_blocked == 0
    assert d.wht_to_remit == Decimal("200.00")


def test_no_po_is_hold():
    d = decide(mk_ctx(mk_invoice([(1, "100.00")]), None))
    assert d.status.value == "HOLD" and _codes(d) == {"NO_PO_MATCH"}
    assert d.blocked_or_hold == d.gross


def test_rent_without_policy_needs_review():
    po = mk_po([(1, "500000.00", WhtCategory.RENT)])
    d = decide(mk_ctx(mk_invoice([(1, "500000.00")]), po))
    assert d.status.value == "NEEDS_HUMAN_REVIEW" and "POLICY_REQUIRED" in _codes(d) and d.excluded_from_totals
