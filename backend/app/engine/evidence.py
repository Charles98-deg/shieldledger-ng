"""Evidence-step constructors. Cite + status always come from the rule pack."""
from __future__ import annotations

from typing import Any

from app.models.domain import EvidenceStep
from app.models.enums import RuleStatus
from app.rules.loader import rules


def _s(v: Any) -> str:
    return v if isinstance(v, str) else str(v)


def step(
    rule_id: str,
    *,
    field: str | None = None,
    inputs: dict[str, Any] | None = None,
    computation: str = "",
    result: str = "",
    source_doc: str | None = None,
    policy: str | None = None,
    raw_snippet: str | None = None,
    status: RuleStatus | None = None,
) -> EvidenceStep:
    r = rules().get(rule_id)
    return EvidenceStep(
        rule_id=r.id,
        rule_version=r.version,
        cite=r.cite,
        status=status or r.status,
        source_doc=source_doc,
        field=field,
        inputs={k: _s(v) for k, v in (inputs or {}).items()},
        computation=computation,
        result=result,
        policy_applied=policy,
        raw_snippet=raw_snippet,
    )
