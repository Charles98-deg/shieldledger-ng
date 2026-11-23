"""T19: no float() calls or float literals anywhere in backend/app; API money is strings."""
import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
MONEY_KEYS = ("gross", "approved_gross", "wht_to_remit", "net_safe_payable", "blocked_or_hold",
              "recoverable_input_vat", "overpayment_blocked", "pending_verification", "advisory_self_account")


def test_t19_no_float_in_app():
    offenders = []
    for py in APP.rglob("*.py"):
        tree = ast.parse(py.read_text(encoding="utf-8"), filename=str(py))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "float":
                offenders.append(f"{py.relative_to(APP)}:{node.lineno} float() call")
            if isinstance(node, ast.Constant) and isinstance(node.value, float):
                offenders.append(f"{py.relative_to(APP)}:{node.lineno} float literal {node.value!r}")
    assert not offenders, "\n".join(offenders)


def test_t19_api_money_is_string(pack_client):
    for d in pack_client.get("/api/decisions").json():
        for k in MONEY_KEYS:
            assert isinstance(d[k], str), (d["doc_label"], k, d[k])
    s = pack_client.get("/api/summary").json()

    def walk(o):
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        else:
            assert not isinstance(o, float), o
    walk(s)
    walk(pack_client.get("/api/ftz/summary").json())
    assert isinstance(s["direct_cash"]["total"], str)
