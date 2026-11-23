from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Request

from app import service
from app.api.deps import read, today, write
from app.config import POLICY_DEFAULTS
from app.repo import policies as policy_repo
from app.rules.loader import POLICY_META, rules

router = APIRouter(tags=["policies"])


def _view(conn) -> dict:
    p = policy_repo.load(conn)
    rp = rules()
    items = []
    for k, meta in POLICY_META.items():
        rule = rp.get(meta["rule"]) if meta.get("rule") else None
        items.append({
            "key": k, "value": p.s(k), "default": POLICY_DEFAULTS[k], "label": meta["label"], "type": meta["type"],
            "status": "BUYER_POLICY", "rule_id": rule.id if rule else None,
            "rule_status": rule.status.value if rule else None, "rule_cite": rule.cite if rule else None,
            "policy_required": k in p.required_unset(),
        })
    return {"policies": items, "policy_required": p.required_unset()}


@router.get("/policies")
def get_policies(request: Request) -> dict:
    with read(request) as conn:
        return _view(conn)


@router.put("/policies")
def put_policies(request: Request, changes: dict[str, str] = Body(...)) -> dict:
    try:
        with write(request) as conn:
            applied = policy_repo.update(conn, changes)
            decs = service.evaluate_all(conn, today(request))
            return {"applied": applied, **_view(conn), "summary": service.summary(decs)}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
