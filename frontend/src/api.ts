import type { AuditEvent, AuditVerify, Decision, EvidenceStep, FtzPosition, FtzSummary, Health, Policy, Rule, Summary } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "Backend unreachable — is `make dev` running?");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface UploadResult {
  filename: string;
  document_id?: number;
  idempotent_replay?: boolean;
  engine?: string;
  status_gate?: string;
  gate_flags?: string[];
  error?: { code: string; message: string; http_status: number };
}

export const api = {
  health: () => req<Health>("/health"),
  decisions: () => req<Decision[]>("/decisions"),
  evidence: (invoiceId: number) =>
    req<{ invoice_id: number; document: Record<string, unknown> | null; evidence: EvidenceStep[] }>(`/decisions/${invoiceId}/evidence`),
  summary: () => req<Summary>("/summary"),
  evaluate: () => req<{ decisions: number; summary: Summary }>("/runs/evaluate", { method: "POST" }),
  upload: (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));
    return req<{ results: UploadResult[] }>("/documents", { method: "POST", body: fd });
  },
  resetDemo: () => req<{ ingested: number; seconds: string; engines: string[] }>("/dev/reset-demo", { method: "POST" }),
  policies: () => req<{ policies: Policy[]; policy_required: string[] }>("/policies"),
  putPolicies: (changes: Record<string, string>) =>
    req<{ applied: Record<string, string>; policies: Policy[] }>("/policies", { ...json(changes), method: "PUT" }),
  rules: () => req<{ pack: string; effective_date: string; rules: Rule[]; disclaimer: string }>("/rules"),
  ftz: () => req<FtzSummary>("/ftz/summary"),
  ftzScenario: (additional_domestic: string, illustrative_profit?: string) =>
    req<{ additional_domestic: string; base: FtzPosition; scenario: FtzPosition }>(
      "/ftz/scenario",
      json({ additional_domestic, illustrative_profit }),
    ),
  auditVerify: () => req<AuditVerify>("/audit/verify"),
  audit: (limit = 200) => req<AuditEvent[]>(`/audit?limit=${limit}`),
  fieldValidation: () =>
    req<{ quotes: { text: string; who: string; date: string; channel: string }[]; company_examples: { description: string; who: string; date: string }[]; label: string }>(
      "/field-validation",
    ),
};
