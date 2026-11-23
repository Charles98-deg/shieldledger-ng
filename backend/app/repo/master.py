"""Master data: vendors, POs, GRNs, registry, payroll, FTZ ledger + seeding."""
from __future__ import annotations

import json
import sqlite3
from datetime import date
from decimal import Decimal
from pathlib import Path

from app.config import POLICY_DEFAULTS
from app.engine.ftz import LedgerRow
from app.models.domain import GRN, Employee, POLine, PurchaseOrder, RegistryEntry, VendorRecord
from app.models.enums import FtzClass, VatTreatment, WhtCategory
from app.money import parse_money, parse_qty, to_str
from app.normalize import po_norm, tin_norm


def _load(seed_dir: Path, name: str) -> dict:
    return json.loads((seed_dir / name).read_text(encoding="utf-8"))


def seed_all(conn: sqlite3.Connection, seed_dir: Path) -> dict[str, int]:
    vendors = _load(seed_dir, "vendors.json")["vendors"]
    traps = _load(seed_dir, "non_invoice_traps.json")
    pos = _load(seed_dir, "purchase_orders.json")["purchase_orders"] + traps["purchase_orders"]
    counts = {"vendors": 0, "purchase_orders": 0, "grns": 0, "registry": 0, "employees": 0, "ftz_rows": 0}
    for v in vendors + traps["vendors"]:
        conn.execute("INSERT OR REPLACE INTO vendors(id,name,tin,nuban,phone) VALUES (?,?,?,?,?)",
                     (v["id"], v["name"], v.get("tin"), v.get("nuban"), v.get("phone")))
        counts["vendors"] += 1
    for p in pos:
        total = sum((parse_qty(ln["qty"]) * parse_money(ln["unit_price"]) for ln in p["lines"]), Decimal("0"))
        conn.execute("INSERT OR REPLACE INTO purchase_orders(id,vendor_id,po_date,total_amount) VALUES (?,?,?,?)",
                     (p["id"], p["vendor_id"], p["po_date"], to_str(total)))
        for ln in p["lines"]:
            conn.execute(
                "INSERT OR REPLACE INTO po_lines(po_id,line_no,description,qty,unit_price,uom,category,wht_category,vat_treatment)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (p["id"], ln["line_no"], ln["description"], str(parse_qty(ln["qty"])), to_str(parse_money(ln["unit_price"])),
                 ln["uom"], ln["category"], ln["wht_category"], ln["vat_treatment"]))
        counts["purchase_orders"] += 1
    for g in _load(seed_dir, "grns.json")["grns"]:
        conn.execute("INSERT OR REPLACE INTO grns(id,po_id,line_no,delivered_qty,signed) VALUES (?,?,?,?,?)",
                     (g["id"], g["po_id"], g["line_no"], str(parse_qty(g["delivered_qty"])), 1 if g["signed"] else 0))
        counts["grns"] += 1
    for r in _load(seed_dir, "nrs_registry.json")["registry"]:
        conn.execute("INSERT OR REPLACE INTO nrs_taxpayer_registry(tin,name,vat_registered,small_business) VALUES (?,?,?,?)",
                     (tin_norm(r["tin"]), r["name"], int(r["vat_registered"]), int(r["small_business"])))
        counts["registry"] += 1
    for e in _load(seed_dir, "employee_payroll.json")["employees"]:
        conn.execute("INSERT OR REPLACE INTO employee_payroll(emp_id,name,nuban,phone) VALUES (?,?,?,?)",
                     (e["emp_id"], e["name"], e.get("nuban"), e.get("phone")))
        counts["employees"] += 1
    for f in _load(seed_dir, "ftz_ledger.json")["rows"]:
        conn.execute(
            "INSERT OR REPLACE INTO ftz_ledger(id,period,classification,customer,invoice_ref,amount,related_party_outsourced)"
            " VALUES (?,?,?,?,?,?,?)",
            (f["id"], f["period"], f["classification"], f["customer"], f["invoice_ref"], to_str(parse_money(f["amount"])),
             int(f.get("related_party_outsourced", False))))
        counts["ftz_rows"] += 1
    for k, v in POLICY_DEFAULTS.items():
        conn.execute("INSERT OR IGNORE INTO policy_settings(key,value,updated_at) VALUES (?,?,datetime('now'))", (k, v))
    return counts


def vendors(conn: sqlite3.Connection) -> list[VendorRecord]:
    return [VendorRecord(**dict(r)) for r in conn.execute("SELECT id,name,tin,nuban,phone FROM vendors ORDER BY id")]


def vendor_names(conn: sqlite3.Connection) -> dict[str, str]:
    return {v.id: v.name for v in vendors(conn)}


def purchase_orders(conn: sqlite3.Connection) -> list[PurchaseOrder]:
    lines: dict[str, list[POLine]] = {}
    for r in conn.execute("SELECT * FROM po_lines ORDER BY po_id, line_no"):
        lines.setdefault(r["po_id"], []).append(POLine(
            line_no=r["line_no"], description=r["description"], qty=Decimal(r["qty"]), unit_price=Decimal(r["unit_price"]),
            uom=r["uom"], category=r["category"], wht_category=WhtCategory(r["wht_category"]),
            vat_treatment=VatTreatment(r["vat_treatment"])))
    return [PurchaseOrder(id=r["id"], vendor_id=r["vendor_id"], po_date=date.fromisoformat(r["po_date"]),
                          total_amount=Decimal(r["total_amount"]), lines=lines.get(r["id"], []))
            for r in conn.execute("SELECT * FROM purchase_orders ORDER BY id")]


def po_index(conn: sqlite3.Connection) -> dict[str, PurchaseOrder]:
    return {po_norm(p.id): p for p in purchase_orders(conn)}


def grns_by_po(conn: sqlite3.Connection) -> dict[str, dict[int, GRN]]:
    out: dict[str, dict[int, GRN]] = {}
    for r in conn.execute("SELECT * FROM grns"):
        out.setdefault(r["po_id"], {})[r["line_no"]] = GRN(
            id=r["id"], po_id=r["po_id"], line_no=r["line_no"], delivered_qty=Decimal(r["delivered_qty"]), signed=bool(r["signed"]))
    return out


def registry(conn: sqlite3.Connection) -> dict[str, RegistryEntry]:
    return {r["tin"]: RegistryEntry(tin=r["tin"], name=r["name"], vat_registered=bool(r["vat_registered"]),
                                    small_business=bool(r["small_business"]))
            for r in conn.execute("SELECT * FROM nrs_taxpayer_registry")}


def employees(conn: sqlite3.Connection) -> list[Employee]:
    return [Employee(**dict(r)) for r in conn.execute("SELECT emp_id,name,nuban,phone FROM employee_payroll ORDER BY emp_id")]


def ftz_rows(conn: sqlite3.Connection) -> list[LedgerRow]:
    return [LedgerRow(id=r["id"], period=r["period"], classification=FtzClass(r["classification"]), customer=r["customer"],
                      invoice_ref=r["invoice_ref"], amount=Decimal(r["amount"]),
                      related_party_outsourced=bool(r["related_party_outsourced"]))
            for r in conn.execute("SELECT * FROM ftz_ledger ORDER BY classification, period, id")]
