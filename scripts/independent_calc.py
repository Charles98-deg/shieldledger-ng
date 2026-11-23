from decimal import Decimal as D, ROUND_HALF_UP, getcontext
import json
getcontext().prec = 28
q = lambda x: x.quantize(D("0.01"), rounding=ROUND_HALF_UP)
V = D("0.075")

def inv(base, vat_charged=True, wht_rate=D("0.02"), approved_base=None, vat_exempt=False):
    ab = base if approved_base is None else approved_base
    vat = q(base * V) if vat_charged and not vat_exempt else D(0)
    gross = base + vat
    avat = q(ab * V) if vat_charged and not vat_exempt else D(0)
    agross = ab + avat
    wht = q(ab * wht_rate)
    held = gross - agross
    net = agross - wht
    assert net + wht + held == gross
    return dict(gross=gross, vat=vat, approved_gross=agross, wht=wht, net=net, held=held, approved_vat=avat)

P = {}
P["D01"] = inv(D(100)*D(47500), approved_base=D(94)*D(47500)); P["D01"]["overpay"] = P["D01"]["held"]; P["D01"]["recov"] = P["D01"]["approved_vat"]
P["D02"] = inv(D(100)*D(9590)); P["D02"]["overpay"] = D(0); P["D02"]["recov"] = P["D02"]["approved_vat"]
d1 = P["D01"]["gross"]
P["D03"] = dict(gross=d1, vat=D(0), approved_gross=D(0), wht=D(0), net=D(0), held=d1, approved_vat=D(0), overpay=d1, recov=D(0))
P["D05"] = inv(D(650000), wht_rate=D("0.04")); P["D05"]["overpay"] = D(0); P["D05"]["recov"] = D(0)
b = D(1650000); vat = q(b*V); g = b + vat
P["D06"] = dict(gross=g, vat=vat, approved_gross=D(0), wht=D(0), net=D(0), held=g, approved_vat=D(0), overpay=D(0), recov=D(0))
P["D07"] = inv(D(1800000), vat_charged=False); P["D07"]["overpay"] = D(0); P["D07"]["recov"] = D(0)
b = D(420000); vat = q(b*V); g = b + vat; wht = q(b*D("0.02"))
P["D08"] = dict(gross=g, vat=vat, approved_gross=b, wht=wht, net=b-wht, held=vat, approved_vat=D(0), overpay=D(0), recov=D(0))
P["D09"] = inv(D(3000000), wht_rate=D("0.05")); P["D09"]["overpay"] = D(0); P["D09"]["recov"] = P["D09"]["approved_vat"]
P["D10"] = inv(D(18500000)); P["D10"]["overpay"] = D(0); P["D10"]["recov"] = P["D10"]["approved_vat"]
P["D11"] = inv(D(10000)*D(1150), vat_exempt=True); P["D11"]["overpay"] = D(0); P["D11"]["recov"] = D(0)
P["D12"] = inv(D(100)*D(9650), approved_base=D(100)*D(9500)); P["D12"]["overpay"] = P["D12"]["held"]; P["D12"]["recov"] = P["D12"]["approved_vat"]

tot = {f: sum(v[f] for v in P.values()) for f in ["gross", "net", "wht", "held", "overpay", "recov"]}
assert tot["net"] + tot["wht"] + tot["held"] == tot["gross"]
tot["direct_cash"] = tot["overpay"] + tot["recov"]
tot["s105_total"] = sum(q(P[k]["wht"] * D("0.40")) for k in P if P[k]["wht"] > 0)
tot["contingent"] = D("5000000") + tot["s105_total"]
print(json.dumps({k: str(v) for k, v in tot.items()}, indent=1))
