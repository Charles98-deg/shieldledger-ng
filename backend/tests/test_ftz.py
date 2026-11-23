"""T16 FTZ monitor."""
from decimal import Decimal

import pytest

from app.engine import ftz
from app.models.enums import FtzBand
from app.rules.loader import Policies
from tests.conftest import GOLDEN

G = GOLDEN["ftz"]
D_, T_ = Decimal("234000000.00"), Decimal("1000000000.00")
P = Policies()


def test_t16_summary(pack_client):
    s = pack_client.get("/api/ftz/summary").json()
    c = s["classification"]
    assert (c["EXPORT"], c["INTRA_ZONE"], c["DOMESTIC_CUSTOMS_TERRITORY"], c["TOTAL"]) == (
        "720000000.00", "46000000.00", "234000000.00", "1000000000.00")
    assert c["conserved"] is True
    assert s["share_pct"] == G["share_pct"] and s["band"] == G["band"]
    assert s["headroom"] == G["headroom"]
    assert s["interpretations"] == {"A_domestic_attributable": G["A_base"], "B_all_profit": G["B"]}
    assert s["arms_length_flags"] == 1
    assert s["sunset"]["date"] == "2028-01-01" and s["sunset"]["status"] == "UNVERIFIED"
    assert s["sunset"]["days_remaining"] == 404


def test_t16_scenario(pack_client):
    r = pack_client.post("/api/ftz/scenario", json={"additional_domestic": "25000000.00"}).json()
    assert r["scenario"]["share_pct_4dp"] == G["scenario_share_pct_4dp"]
    assert r["scenario"]["band"] == "BREACHED" and r["scenario"]["headroom"] == "0.00"
    assert r["scenario"]["interpretations"]["A_domestic_attributable"] == G["A_scenario"]
    assert pack_client.post("/api/ftz/scenario", json={"additional_domestic": "abc"}).status_code == 422


def test_t16_headroom_is_largest_non_breaching_kobo():
    x = ftz.headroom(D_, T_, "AT_OR_ABOVE_BREACH")
    assert x == Decimal("21333333.33")
    assert ftz.share(D_ + x, T_ + x) < Decimal("0.25")
    assert ftz.share(D_ + x + Decimal("0.01"), T_ + x + Decimal("0.01")) >= Decimal("0.25")


@pytest.mark.parametrize("boundary,expected", [("AT_OR_ABOVE_BREACH", FtzBand.BREACHED), ("ABOVE_ONLY_BREACH", FtzBand.CRITICAL)])
def test_t16_boundary_toggle_at_exactly_25(boundary, expected):
    assert ftz.band(Decimal("250") / Decimal("1000"), boundary) == expected


def test_t16_bands():
    assert ftz.band(Decimal("0.1799"), "AT_OR_ABOVE_BREACH") == FtzBand.SAFE
    assert ftz.band(Decimal("0.18"), "AT_OR_ABOVE_BREACH") == FtzBand.WATCH
    assert ftz.band(Decimal("0.22"), "AT_OR_ABOVE_BREACH") == FtzBand.CRITICAL
    assert ftz.band(Decimal("0.234"), "AT_OR_ABOVE_BREACH") == FtzBand.CRITICAL


def test_t16_headroom_above_only_allows_exactly_25():
    d, t = Decimal("200.00"), Decimal("1000.00")
    x_at = ftz.headroom(d, t, "AT_OR_ABOVE_BREACH")
    x_above = ftz.headroom(d, t, "ABOVE_ONLY_BREACH")
    assert x_above == Decimal("66.66") and ftz.share(d + x_above, t + x_above) <= Decimal("0.25")
    assert x_at <= x_above


def test_t16_interpretations():
    i = ftz.interpretations(Decimal("200000000.00"), D_, T_)
    assert i == {"A_domestic_attributable": "14040000.00", "B_all_profit": "60000000.00"}


def test_min_etr_toggle(pack_client):
    assert "min_etr_info" not in pack_client.get("/api/ftz/summary").json()
    pos = ftz.position(D_, T_, Policies.from_overrides(MIN_ETR_ENABLED="ON"))
    assert pos["min_etr_info"] == "30000000.00"
