"""T11 split-PO."""
from datetime import date
from decimal import Decimal

import pytest

from app.engine.split_po import band, cluster_exceeds, detect, in_band
from app.rules.loader import Policies
from tests.conftest import mk_po

P = Policies()


def _po(pid, vendor, amount, d):
    return mk_po([(1, amount)], po_id=pid, vendor_id=vendor, po_date=d)


def test_t11_s1_flagged_s0_clean():
    pos = [
        _po("PO-9001", "V-IKANG", "4900000.00", date(2026, 11, 3)),
        _po("PO-9002", "V-IKANG", "4850000.00", date(2026, 11, 7)),
        _po("PO-9101", "V-MKPANI", "4900000.00", date(2026, 11, 4)),
        _po("PO-9201", "V-ITU", "4900000.00", date(2026, 10, 1)),
        _po("PO-9202", "V-ITU", "4800000.00", date(2026, 10, 13)),
    ]
    hits = detect(pos, {}, P)
    assert [h.po_id for h in hits] == ["PO-9001", "PO-9002"]
    assert all(h.cluster_sum == Decimal("9750000.00") for h in hits)


def test_t11_band():
    assert band(P) == (Decimal("4250000.00"), Decimal("4995000.00"))


@pytest.mark.parametrize("amt,inside", [
    ("4250000.00", True), ("4249999.99", False), ("4995000.00", True), ("4995000.01", False)])
def test_t11_band_edges(amt, inside):
    assert in_band(Decimal(amt), P) is inside


def test_t11_band_edges_in_detection():
    pos = [_po("A", "V", "4250000.00", date(2026, 11, 1)), _po("B", "V", "4995000.00", date(2026, 11, 2))]
    assert len(detect(pos, {}, P)) == 2
    pos = [_po("A", "V", "4249999.99", date(2026, 11, 1)), _po("B", "V", "4995000.01", date(2026, 11, 2))]
    assert detect(pos, {}, P) == []


def test_t11_sum_exactly_limit_not_flagged():
    assert cluster_exceeds(Decimal("5000000.00"), P) is False
    assert cluster_exceeds(Decimal("5000000.01"), P) is True
    wide = Policies.from_overrides(SPLIT_BAND_LOW="0.5")
    pos = [_po("A", "V", "2500000.00", date(2026, 11, 1)), _po("B", "V", "2500000.00", date(2026, 11, 2))]
    assert detect(pos, {}, wide) == []
    pos[1] = _po("B", "V", "2500000.01", date(2026, 11, 2))
    assert len(detect(pos, {}, wide)) == 2


def test_t11_window_inclusive_7_days():
    pos = [_po("A", "V", "4900000.00", date(2026, 11, 1)), _po("B", "V", "4900000.00", date(2026, 11, 8))]
    assert len(detect(pos, {}, P)) == 2
    pos[1] = _po("B", "V", "4900000.00", date(2026, 11, 9))
    assert detect(pos, {}, P) == []
