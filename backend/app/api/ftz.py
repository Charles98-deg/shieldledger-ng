from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.api.deps import read, today
from app.engine import ftz
from app.models.enums import FtzClass
from app.money import MoneyParseError, parse_money
from app.repo import master
from app.repo import policies as policy_repo

router = APIRouter(tags=["ftz"])


class Scenario(BaseModel):
    additional_domestic: str
    illustrative_profit: str | None = None


@router.get("/ftz/summary")
def ftz_summary(request: Request) -> dict:
    with read(request) as conn:
        return ftz.summary(master.ftz_rows(conn), policy_repo.load(conn), today(request))


@router.post("/ftz/scenario")
def ftz_scenario(body: Scenario, request: Request) -> dict:
    try:
        add = parse_money(body.additional_domestic)
        profit = parse_money(body.illustrative_profit) if body.illustrative_profit else None
    except MoneyParseError as exc:
        raise HTTPException(422, str(exc)) from exc
    if add < 0:
        raise HTTPException(422, "additional_domestic must be ≥ 0")
    with read(request) as conn:
        rows = master.ftz_rows(conn)
        pol = policy_repo.load(conn)
    tot = ftz.totals(rows)
    d = tot[FtzClass.DOMESTIC_CUSTOMS_TERRITORY]
    t = sum(tot.values())
    return {"additional_domestic": str(add), "base": ftz.position(d, t, pol, profit),
            "scenario": ftz.position(d + add, t + add, pol, profit)}
