"""Trap suite: 100% recall over traps, 0 false positives over controls. Writes reports/trap_report.md."""
from tests.conftest import ROOT

TRAPS = {
    "D01": ("Short delivery", {"D01": {"SHORT_DELIVERY_HOLD"}}),
    "D03": ("Duplicate of D01", {"D03": {"DUPLICATE_SUSPECTED"}}),
    "D04": ("Footing failure", {"D04": {"FOOTING_FAILURE"}}),
    "D05": ("Missing TIN", {"D05": {"MISSING_TIN_DOUBLE_WHT"}}),
    "D06": ("TIN not in registry", {"D06": {"UNREGISTERED_VENDOR_BLOCKED"}}),
    "D07": ("VAT omitted on standard supply", {"D07": {"VAT_OMITTED_SELF_ACCOUNT_ADVISORY"}}),
    "D08": ("Small vendor charges VAT", {"D08": {"INVALID_VAT_CHARGE_HOLD"}}),
    "D12": ("Price variance", {"D12": {"PRICE_VARIANCE_HOLD"}}),
    "S1": ("Split PO (Ikang Civil Works)", {"PO-9001": {"SPLIT_PO_SUSPECTED"}, "PO-9002": {"SPLIT_PO_SUSPECTED"}}),
    "G1": ("Ghost vendor (Anwana Support Services)", {"V-ANWANA": {"GHOST_VENDOR_SUSPECTED"}}),
}
CONTROLS = {
    "D02": ("Price within tolerance", ["D02"]),
    "D09": ("Professional services, clean", ["D09"]),
    "D10": ("Capex generator, clean", ["D10"]),
    "D11": ("AGO VAT-exempt within fuel tolerance", ["D11"]),
    "S0a": ("Single near-limit PO (Mkpani Hardware)", ["PO-9101"]),
    "S0b": ("Two near-limit POs 12 days apart (Itu Quarry)", ["PO-9201", "PO-9202"]),
    "G0": ("Vendor NUBAN with no payroll match (Akpabuyo Cleaning)", ["V-AKPABUYO"]),
}


def test_trap_suite(pack_client):
    rows = {d["doc_label"]: {f["code"] for f in d["flags"]} for d in pack_client.get("/api/decisions").json()}
    lines = ["# Trap report (seeded demo pack)", "",
             "> Synthetic seeded pack: a regression check, not a measure of general accuracy.", "",
             "On the seeded pack (12 invoices, 2 PO-pattern traps/controls, 1 vendor-pattern trap/control). "
             "This is a regression check on fictional seeded data, not a measure of general accuracy.", "",
             "| Item | Kind | Scenario | Expected | Got | Result |", "|---|---|---|---|---|---|"]
    hits = 0
    for tid, (desc, expect) in TRAPS.items():
        ok = all(rows.get(subj, set()) == flags for subj, flags in expect.items())
        hits += ok
        got = "; ".join(f"{s}: {','.join(sorted(rows.get(s, set()))) or '-'}" for s in expect)
        exp = "; ".join(f"{s}: {','.join(sorted(f))}" for s, f in expect.items())
        lines.append(f"| {tid} | trap | {desc} | {exp} | {got} | {'PASS' if ok else 'MISS'} |")
    fps = 0
    for cid, (desc, subjects) in CONTROLS.items():
        flagged = {s: rows[s] for s in subjects if rows.get(s)}
        fps += bool(flagged)
        got = "; ".join(f"{s}: {','.join(sorted(f))}" for s, f in flagged.items()) or "no flags"
        lines.append(f"| {cid} | control | {desc} | no flags | {got} | {'PASS' if not flagged else 'FALSE POSITIVE'} |")
    recall = hits / len(TRAPS)
    lines[2:2] = [f"- **Recall over traps:** {hits}/{len(TRAPS)} = {recall:.0%}",
                  f"- **False positives over controls:** {fps}/{len(CONTROLS)}", ""]
    out = ROOT / "reports" / "trap_report.md"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    assert hits == len(TRAPS), "\n".join(lines)
    assert fps == 0, "\n".join(lines)
