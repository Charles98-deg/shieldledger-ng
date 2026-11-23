"""T10 duplicates."""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.engine.duplicates import DupCandidate, find_duplicate, is_duplicate_pair, name_score
from app.rules.loader import Policies

P = Policies()
A = DupCandidate(1, "D01", "Efik Agro-Inputs Ltd", "EAI-2026-0417", date(2026, 11, 2), Decimal("5106250.00"))


def later(**kw):
    base = dict(invoice_id=2, doc_label="D03", vendor_name="EFIK AGRO INPUTS LIMITED", number="EAI-2026-O417",
                date=date(2026, 11, 11), total=Decimal("5106250.00"))
    base.update(kw)
    return DupCandidate(**base)


def test_t10_d03_flagged_later_doc_only():
    b = later()
    hit, steps = find_duplicate(b, [A, b], P)
    assert hit is A and steps[0].rule_id == "CTRL_DUPLICATE"
    assert find_duplicate(A, [A, b], P)[0] is None  # earlier document is not flagged


def test_t10_not_flagged_vendor_differs():
    assert not is_duplicate_pair(A, later(vendor_name="Ikom Packaging Supplies Ltd"), P)


def test_t10_not_flagged_amount_off_by_one_kobo():
    assert not is_duplicate_pair(A, later(total=Decimal("5106250.01")), P)


@pytest.mark.parametrize("days,dup", [(30, True), (31, False)])
def test_t10_window(days, dup):
    assert is_duplicate_pair(A, later(date=A.date + timedelta(days=days)), P) is dup


def test_t10_invoice_number_distance():
    assert is_duplicate_pair(A, later(number="EAI-2026-0418"), P)        # distance 1
    assert not is_duplicate_pair(A, later(number="EAI-2026-0499"), P)    # distance 2
    assert is_duplicate_pair(A, later(number="eai 2026 0417"), P)        # case/punct


def test_t10_fuzzy_boundary_87_vs_88():
    s87 = name_score(A.vendor_name, "Efic Agri Inputs")
    s88 = name_score(A.vendor_name, "Efik Agro Input Co")
    assert Decimal("87") <= s87 < Decimal("88")
    assert Decimal("88") <= s88 < Decimal("89")
    assert not is_duplicate_pair(A, later(vendor_name="Efic Agri Inputs"), P)
    assert is_duplicate_pair(A, later(vendor_name="Efik Agro Input Co"), P)
    assert is_duplicate_pair(A, later(vendor_name="Efic Agri Inputs"), Policies.from_overrides(DUP_FUZZY_MIN="87"))
