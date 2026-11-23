"""T01 WHT rates · T02 rounding · money parser."""
from datetime import date
from decimal import Decimal

import pytest

from app.engine.wht import compute_wht, remittance_due, wht_rate
from app.models.enums import WhtCategory
from app.money import MoneyParseError, fmt_naira, parse_money, q, to_str
from app.rules.loader import Policies, PolicyRequired, rules, validate_policy

P = Policies()


# ---- T01
@pytest.mark.parametrize("cat,rate", [
    (WhtCategory.GOODS, "0.02"), (WhtCategory.GENERAL_SERVICES, "0.02"),
    (WhtCategory.CONSTRUCTION, "0.02"), (WhtCategory.PROFESSIONAL, "0.05"),
])
def test_t01_wht_rates(cat, rate):
    r, steps = wht_rate(cat, True, P)
    assert r == Decimal(rate)
    assert steps and steps[0].rule_id == "WHT_RATES"


def test_t01_category_status_labels():
    assert wht_rate(WhtCategory.GOODS, True, P)[1][0].status.value == "BRIEF_ONLY"
    assert wht_rate(WhtCategory.CONSTRUCTION, True, P)[1][0].status.value == "BRIEF_ONLY"
    assert wht_rate(WhtCategory.GENERAL_SERVICES, True, P)[1][0].status.value == "SECONDARY_VERIFIED"
    assert wht_rate(WhtCategory.PROFESSIONAL, True, P)[1][0].status.value == "SECONDARY_VERIFIED"


def test_t01_double_without_tin():
    assert wht_rate(WhtCategory.GENERAL_SERVICES, False, P)[0] == Decimal("0.04")
    assert wht_rate(WhtCategory.PROFESSIONAL, False, P)[0] == Decimal("0.10")
    off = Policies.from_overrides(WHT_NO_TIN_DOUBLE="OFF")
    assert wht_rate(WhtCategory.GENERAL_SERVICES, False, off)[0] == Decimal("0.02")


def test_t01_rent_and_other_require_policy():
    with pytest.raises(PolicyRequired):
        wht_rate(WhtCategory.RENT, True, P)
    with pytest.raises(PolicyRequired):
        wht_rate(WhtCategory.OTHER, True, P)
    set_rent = Policies.from_overrides(WHT_RENT_RATE="0.10")
    r, steps = wht_rate(WhtCategory.RENT, True, set_rent)
    assert r == Decimal("0.10") and steps[0].status.value == "CONFLICTING"


def test_t01_small_payer_exemption_default_off():
    assert P.on("WHT_SMALL_PAYER_EXEMPT") is False
    both = Policies.from_overrides(WHT_SMALL_PAYER_EXEMPT="ON", BUYER_IS_SMALL_COMPANY="ON")
    assert wht_rate(WhtCategory.GOODS, True, both)[0] == Decimal("0")


def test_wht_on_base():
    amt, _ = compute_wht({WhtCategory.GOODS: Decimal("4465000.00")}, True, P)
    assert amt == Decimal("89300.00")


# ---- T02
def test_t02_rounding():
    assert q(Decimal("1333333.33") * Decimal("0.075")) == Decimal("100000.00")
    assert q(Decimal("0.005")) == Decimal("0.01")
    assert q(Decimal("2.675")) == Decimal("2.68")  # would be 2.67 with binary float


def test_remittance_due():
    assert remittance_due(date(2026, 11, 23)) == date(2026, 12, 21)
    assert remittance_due(date(2026, 12, 5)) == date(2027, 1, 21)


@pytest.mark.parametrize("raw,expected", [
    ("₦1,240,000.00", "1240000.00"), ("NGN 1 240 000", "1240000.00"), ("1240000", "1240000.00"),
    (" 9,590.00 ", "9590.00"), ("0.00", "0.00"),
])
def test_parse_money_ok(raw, expected):
    assert to_str(parse_money(raw)) == expected


@pytest.mark.parametrize("raw", ["1.240,00", "12,40,000", "1,2345", "abc", "", "1.234", "1,240.5.0"])
def test_parse_money_rejects_ambiguous(raw):
    with pytest.raises(MoneyParseError):
        parse_money(raw)


def test_q_rejects_non_decimal():
    with pytest.raises(TypeError):
        q(1)


def test_fmt():
    assert fmt_naira(Decimal("5106250")) == "₦5,106,250.00"


def test_rule_pack_has_no_verified_primary_and_statuses_valid():
    rp = rules()
    allowed = {"SECONDARY_VERIFIED", "CONFLICTING", "BRIEF_ONLY", "UNVERIFIED", "BUYER_POLICY"}
    for r in rp.rules.values():
        assert r.status.value in allowed
        assert r.version == 1 and r.cite
    from app.config import RULES_PATH
    assert "status: VERIFIED_PRIMARY" not in RULES_PATH.read_text()
    assert rp.get("INPUT_VAT_RECOVERY").cite.startswith("NTA 2025 s.156")


def test_policy_validation():
    assert validate_policy("FTZ_BOUNDARY", "ABOVE_ONLY_BREACH") == "ABOVE_ONLY_BREACH"
    with pytest.raises(ValueError):
        validate_policy("FTZ_BOUNDARY", "SOMETHING")
    with pytest.raises(ValueError):
        validate_policy("PRICE_VARIANCE_TOL", "2")
    with pytest.raises(ValueError):
        validate_policy("NOPE", "1")
