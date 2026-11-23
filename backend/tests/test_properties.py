"""Hypothesis properties H1–H6."""
import sqlite3
from datetime import date, timedelta
from decimal import Decimal

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.engine import ftz
from app.engine.decide import decide
from app.engine.duplicates import DupCandidate, is_duplicate_pair
from app.models.enums import VatTreatment, WhtCategory
from app.money import from_db, q, to_str
from app.rules.loader import Policies
from tests.conftest import mk_ctx, mk_grns, mk_invoice, mk_po, registry

kobo = st.integers(min_value=100, max_value=100_000_000).map(lambda k: Decimal(k) / 100)
cats = st.sampled_from([WhtCategory.GOODS, WhtCategory.GENERAL_SERVICES, WhtCategory.CONSTRUCTION, WhtCategory.PROFESSIONAL])
treat = st.sampled_from([VatTreatment.STANDARD, VatTreatment.EXEMPT, VatTreatment.ZERO])


@st.composite
def invoice_case(draw):
    n = draw(st.integers(1, 3))
    po_lines, inv_lines, delivered, signed = [], [], [], []
    for _ in range(n):
        qty = draw(st.integers(1, 500))
        po_price = draw(kobo)
        inv_price = q(po_price * (1 + Decimal(draw(st.integers(-20, 50))) / 1000))
        po_lines.append((qty, str(po_price), draw(cats), draw(treat)))
        inv_lines.append((qty, str(max(inv_price, Decimal("0.01")))))
        delivered.append(draw(st.integers(0, qty)))
        signed.append(draw(st.booleans()) or True)
    has_tin = draw(st.booleans())
    small = draw(st.booleans())
    po = mk_po(po_lines)
    inv = mk_invoice(inv_lines, vat=draw(st.sampled_from(["auto", "0.00"])), tin="20456781-0001" if has_tin else None)
    grns = mk_grns(po, delivered)
    if not draw(st.booleans()):
        grns[1] = grns[1].model_copy(update={"signed": False})
    return mk_ctx(inv, po, grns, reg=registry(small=small, vat_reg=not small))


@settings(max_examples=300, deadline=None)
@given(invoice_case())
def test_h1_conservation(ctx):
    d = decide(ctx)
    assert d.net_safe_payable + d.wht_to_remit + d.blocked_or_hold == d.gross
    assert d.overpayment_blocked + d.pending_verification == d.blocked_or_hold


@settings(max_examples=300, deadline=None)
@given(invoice_case())
def test_h2_bounds(ctx):
    d = decide(ctx)
    assert Decimal("0") <= d.wht_to_remit <= d.approved_base <= d.approved_gross <= d.gross
    assert d.net_safe_payable >= 0 and d.blocked_or_hold >= 0 and d.overpayment_blocked >= 0


WORDS = ["Efik", "Agro", "Inputs", "Calabar", "Cartons", "Marine", "Works", "Ikom", "Supply", "Power", "Ltd", "Nig"]
names = st.lists(st.sampled_from(WORDS), min_size=1, max_size=4).map(" ".join)


def perturb(name: str, how: int) -> str:
    if how == 0:
        return name.upper()
    if how == 1:
        return "  " + name.replace(" ", "   ") + " "
    if how == 2:
        return name.replace(" ", ", ") + "."
    return name.lower().replace(" ", " - ")


@settings(max_examples=300, deadline=None)
@given(names, names, st.integers(0, 3), st.booleans(), st.integers(0, 40), st.booleans())
def test_h3_duplicate_symmetric_and_invariant(n1, n2, how, same_amt, days, same_no):
    p = Policies()
    a = DupCandidate(1, "A", n1, "INV-100", date(2026, 11, 1), Decimal("1000.00"))
    b = DupCandidate(2, "B", n2, "INV-100" if same_no else "INV-1O1", date(2026, 11, 1) + timedelta(days=days),
                     Decimal("1000.00") if same_amt else Decimal("1000.01"))
    assert is_duplicate_pair(a, b, p) == is_duplicate_pair(b, a, p)
    b2 = DupCandidate(2, "B", perturb(n2, how), b.number, b.date, b.total)
    assert is_duplicate_pair(a, b2, p) == is_duplicate_pair(a, b, p)


@settings(max_examples=400, deadline=None)
@given(st.integers(min_value=100, max_value=10**14), st.data())
def test_h4_ftz_headroom(t_kobo, data):
    t = Decimal(t_kobo) / 100
    max_d = (t_kobo - 1) // 4
    d = Decimal(data.draw(st.integers(0, max_d))) / 100
    if not d < Decimal("0.25") * t:
        return
    x = ftz.headroom(d, t, "AT_OR_ABOVE_BREACH")
    assert ftz.share(d + x, t + x) < Decimal("0.25")
    e = x + Decimal("0.02")
    assert ftz.share(d + e, t + e) >= Decimal("0.25")


money_str = st.integers(min_value=0, max_value=10**15).map(lambda k: to_str(Decimal(k) / 100))


@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(money_str)
def test_h5_roundtrip_db_and_api(pack_client, s):
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE m(v TEXT)")
    conn.execute("INSERT INTO m VALUES (?)", (s,))
    back = from_db(conn.execute("SELECT v FROM m").fetchone()[0])
    assert back == Decimal(s) and to_str(back) == s
    r = pack_client.post("/api/ftz/scenario", json={"additional_domestic": s}).json()
    assert Decimal(r["additional_domestic"]) == Decimal(s)


@given(st.decimals(min_value=-10**12, max_value=10**12, allow_nan=False, allow_infinity=False, places=6))
def test_h6_quantize_idempotent(x):
    assert q(q(x)) == q(x)
