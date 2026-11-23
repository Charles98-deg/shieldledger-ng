"""Render backend/seed/invoices/D01..D12.json → demo/pack/D01..D12.pdf.

Monospace 'Label: value' layout, one item per line, so pypdf text extraction is
reliable for the offline parser. invariant=1 makes the bytes deterministic, so
re-running this script does not change SHA-256 idempotency keys.
"""
from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "backend" / "seed" / "invoices"
OUT = ROOT / "demo" / "pack"


def render(inv: dict, path: Path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4, invariant=1)
    c.setTitle(f"{inv['doc']} - fictional demo invoice")
    w, h = A4
    y = h - 56
    c.setFont("Helvetica-Bold", 15)
    c.drawString(48, y, "TAX INVOICE")
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 48, y, f"ShieldLedger NG demo pack - {inv['doc']}")
    y -= 14
    c.setFillColorRGB(0.7, 0.1, 0.1)
    c.drawString(48, y, "FICTIONAL DEMO DOCUMENT - not a real vendor, TIN, bank account or phone number")
    c.setFillColorRGB(0, 0, 0)
    y -= 26
    c.setFont("Courier", 9.5)
    body = [
        f"Vendor: {inv['vendor']}",
        f"Vendor TIN: {inv['vendor_tin']}",
        f"Invoice No: {inv['invoice_no']}",
        f"Invoice Date: {inv['invoice_date']}",
        f"PO Ref: {inv['po_ref']}",
        f"Bank NUBAN: {inv['bank_nuban']}",
        f"Phone: {inv['phone']}",
        f"Currency: {inv['currency']}",
        f"Bill To - {inv['buyer']}",
        "",
        "LINE | description | qty | unit_price | amount",
    ]
    for ln in inv["lines"]:
        body.append(f"LINE | {ln['description']} | {ln['qty']} | {ln['unit_price']} | {ln['amount']}")
    body += [
        "",
        f"Subtotal: {inv['subtotal']}",
        f"VAT (7.5%): {inv['vat']}",
        f"Total: {inv['total']}",
    ]
    for line in body:
        if line == "LINE | description | qty | unit_price | amount":
            c.setFont("Courier-Oblique", 8)
            c.drawString(48, y, "(columns: description | qty | unit price NGN | amount NGN)")
            c.setFont("Courier", 9.5)
        else:
            c.drawString(48, y, line)
        y -= 15
    c.setFont("Helvetica", 7)
    c.drawString(48, 40, "Demo data is fictional. Generated for the TCC'26 ShieldLedger NG demo; any resemblance to a real entity is coincidental.")
    c.showPage()
    c.save()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src in sorted(SRC.glob("D*.json")):
        inv = json.loads(src.read_text(encoding="utf-8"))
        render(inv, OUT / f"{inv['doc']}.pdf")
        print(f"wrote {OUT / (inv['doc'] + '.pdf')}")


if __name__ == "__main__":
    main()
