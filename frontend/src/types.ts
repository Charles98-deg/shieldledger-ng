// Money is always a decimal STRING from the API ("1234.56"). Never parse to float.
export type Money = string;

export type DecisionStatus = "RELEASE" | "RELEASE_PARTIAL" | "HOLD" | "BLOCKED" | "NEEDS_HUMAN_REVIEW";
export type RuleStatus = "SECONDARY_VERIFIED" | "CONFLICTING" | "BRIEF_ONLY" | "UNVERIFIED" | "BUYER_POLICY";

export interface Flag {
  code: string;
  detail: string;
}

export interface EvidenceStep {
  rule_id: string;
  rule_version: number;
  cite: string;
  status: RuleStatus;
  source_doc: string | null;
  field: string | null;
  inputs: Record<string, string>;
  computation: string;
  result: string;
  policy_applied: string | null;
  raw_snippet: string | null;
}

export interface Exposure {
  rule_id: string;
  label: string;
  amount: Money;
  counted_in_headline: boolean;
}

export interface Decision {
  kind: "INVOICE" | "PO_PATTERN" | "VENDOR_PATTERN";
  invoice_id: number | null;
  subject_id: string;
  doc_label: string;
  vendor_name: string;
  status: DecisionStatus;
  gross: Money;
  approved_base: Money;
  approved_gross: Money;
  wht_to_remit: Money;
  net_safe_payable: Money;
  blocked_or_hold: Money;
  recoverable_input_vat: Money;
  overpayment_blocked: Money;
  pending_verification: Money;
  advisory_self_account: Money;
  excluded_from_totals: boolean;
  remittance_due: string | null;
  contingent_exposures: Exposure[];
  flags: Flag[];
  evidence?: EvidenceStep[];
  evidence_count: number;
  document_id?: number;
  filename?: string;
  engine?: string;
  vendor_resolved_id?: string | null;
  vendor_candidate_id?: string | null;
  invoice_number?: string;
}

export interface Summary {
  direct_cash: { input_vat_identified: Money; overpayments_blocked: Money; total: Money };
  contingent_fines_blocked: { unregistered_contractor_s100_2: Money; failure_to_deduct_s105: Money; total: Money };
  pending_verification_holds: Money;
  advisories: { vat_self_account: Money };
  conservation: { gross: Money; net_safe_payable: Money; wht_to_remit: Money; blocked_or_hold: Money; ok: boolean };
  needs_review_count: number;
  invoice_count: number;
  pattern_flags: number;
}

export interface Rule {
  id: string;
  version: number;
  kind: string;
  value: unknown;
  cite: string;
  status: RuleStatus;
  source_url: string | null;
  note: string;
}

export interface Policy {
  key: string;
  value: string;
  default: string;
  label: string;
  type: string;
  status: "BUYER_POLICY";
  rule_id: string | null;
  rule_status: RuleStatus | null;
  rule_cite: string | null;
  policy_required: boolean;
}

export interface FtzPosition {
  domestic: Money;
  total: Money;
  share: string;
  share_pct: string;
  share_pct_4dp: string;
  band: "SAFE" | "WATCH" | "CRITICAL" | "BREACHED";
  boundary: string;
  headroom: Money;
  illustrative_profit: Money;
  interpretations: { A_domestic_attributable: Money; B_all_profit: Money };
  min_etr_info?: Money;
}

export interface FtzSummary extends FtzPosition {
  classification: { EXPORT: Money; INTRA_ZONE: Money; DOMESTIC_CUSTOMS_TERRITORY: Money; TOTAL: Money; conserved: boolean };
  sunset: { date: string; days_remaining: number; status: RuleStatus };
  arms_length_flags: number;
  rules: { id: string; cite: string; status: RuleStatus; note: string }[];
  ledger: {
    id: string;
    period: string;
    classification: string;
    customer: string;
    invoice_ref: string;
    amount: Money;
    related_party_outsourced: boolean;
  }[];
}

export interface AuditVerify {
  ok: boolean;
  checked: number;
  first_bad_id: number | null;
}

export interface Health {
  status: string;
  app_env: string;
  today: string;
  rules_pack: string;
  extraction: { gemini_available: boolean; gemini_model: string; gemini_fallback_models: string[]; offline_parser: boolean };
}
