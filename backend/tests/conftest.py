from __future__ import annotations

import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import Clock  # noqa: E402
from app.models.domain import GRN, POLine, PurchaseOrder, RegistryEntry  # noqa: E402
from app.models.enums import VatTreatment, WhtCategory  # noqa: E402
from app.models.verified import VerifiedInvoice, VerifiedLine  # noqa: E402
from app.money import q  # noqa: E402
from app.rules.loader import Policies  # noqa: E402

TODAY = date(2026, 11, 23)
ROOT = BACKEND.parent
GOLDEN = json.loads((BACKEND / "tests" / "golden" / "pack_expected.json").read_text())
TIN = "20456781-0001"


@pytest.fixture
def clock() -> Clock:
    return Clock(TODAY)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    from fastapi.testclient import TestClient

    from app.main import create_app
    app = create_app(str(tmp_path / "t.db"), Clock(TODAY), app_env="dev")
    return TestClient(app)


@pytest.fixture(scope="session")
def pack_client(tmp_path_factory):
    """One demo-pack run shared by golden/E2E/trap tests (offline parser, no key)."""
    import os
    os.environ.pop("GEMINI_API_KEY", None)
    from fastapi.testclient import TestClient

    from app.main import create_app
    app = create_app(str(tmp_path_factory.mktemp("pack") / "pack.db"), Clock(TODAY), app_env="dev")
    c = TestClient(app)
    r = c.post("/api/dev/reset-demo")
    assert r.status_code == 200, r.text
    return c


# ------------------------------------------------------------ builders
def D(x) -> Decimal:
    return Decimal(str(x))


def mk_po(lines, po_id="PO-T", vendor_id="V-T", po_date=date(2026, 10, 1)) -> PurchaseOrder:
    pl = []
    for i, ln in enumerate(lines, start=1):
        qty, price, *rest = ln
        wht = rest[0] if len(rest) > 0 else WhtCategory.GOODS
        vat = rest[1] if len(rest) > 1 else VatTreatment.STANDARD
        uom = rest[2] if len(rest) > 2 else "EA"
        cat = rest[3] if len(rest) > 3 else "GENERAL"
        pl.append(POLine(line_no=i, description=f"item {i}", qty=D(qty), unit_price=D(price), uom=uom, category=cat,
                         wht_category=wht, vat_treatment=vat))
    total = sum((x.qty * x.unit_price for x in pl), Decimal("0"))
    return PurchaseOrder(id=po_id, vendor_id=vendor_id, po_date=po_date, total_amount=total, lines=pl)


def mk_invoice(lines, vat: str | Decimal = "auto", tin: str | None = TIN, vendor="Test Vendor Ltd", number="INV-1",
               d=date(2026, 11, 2), po="PO-T", total=None) -> VerifiedInvoice:
    vl = [VerifiedLine(description=f"item {i}", quantity=D(qn), unit_price=D(p), amount=q(D(qn) * D(p)))
          for i, (qn, p) in enumerate(lines, start=1)]
    sub = sum((x.amount for x in vl), Decimal("0"))
    v = q(sub * Decimal("0.075")) if vat == "auto" else D(vat)
    return VerifiedInvoice(vendor_name=vendor, vendor_tin=tin, invoice_number=number, invoice_date=d, po_reference=po,
                           currency="NGN", subtotal=sub, vat_amount=v, vat_charged=v > 0,
                           total_amount=total if total is not None else sub + v, lines=vl)


def mk_grns(po: PurchaseOrder, delivered=None, signed=True) -> dict[int, GRN]:
    out = {}
    for i, ln in enumerate(po.lines):
        dq = D(delivered[i]) if delivered is not None else ln.qty
        out[ln.line_no] = GRN(id=f"G{ln.line_no}", po_id=po.id, line_no=ln.line_no, delivered_qty=dq, signed=signed)
    return out


def registry(tin=TIN, small=False, vat_reg=True) -> dict[str, RegistryEntry]:
    t = tin.replace("-", "")
    return {t: RegistryEntry(tin=t, name="Test Vendor Ltd", vat_registered=vat_reg, small_business=small)}


def mk_ctx(inv: VerifiedInvoice, po: PurchaseOrder | None, grns=None, reg=None, policies=None, others=None,
           invoice_id=1, label="T01"):
    from app.engine.decide import InvoiceContext
    return InvoiceContext(
        invoice_id=invoice_id, doc_label=label, vendor_name=inv.vendor_name, invoice=inv, printed_total=inv.total_amount,
        po=po, grns=grns if grns is not None else (mk_grns(po) if po else {}),
        registry=reg if reg is not None else registry(), others=others or [],
        policies=policies or Policies(), payment_date=TODAY)
