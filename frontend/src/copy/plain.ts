// Plain-English copy for the AP clerk: one sentence and one next action per flag.
//
// Rules:
// - Numbers are only ever *read*: from the flag's own detail text (pattern-matched, never parsed to
//   float) or from a single API money field. Nothing is added, subtracted or recomputed here.
// - When the detail text doesn't match the expected shape, fall back to the existing explanation
//   (`reasonLine`), so a changed engine message degrades to the old wording, never to a wrong number.
import { reasonLine } from "../decisionText";
import { naira } from "../money";
import type { Decision, DecisionStatus, Flag } from "../types";

export interface Plain {
  sentence: string;
  action: string;
}

// Most decisive flag first; the case's headline explains that one.
export const FLAG_ORDER = [
  "UNREGISTERED_VENDOR_BLOCKED",
  "DUPLICATE_SUSPECTED",
  "GHOST_VENDOR_SUSPECTED",
  "SPLIT_PO_SUSPECTED",
  "FOOTING_FAILURE",
  "VALIDATION_FAILURE",
  "LOW_CONFIDENCE_CRITICAL_FIELD",
  "OFFLINE_NO_OCR",
  "POLICY_REQUIRED",
  "NO_PO_MATCH",
  "UNSIGNED_GRN_HOLD",
  "SHORT_DELIVERY_HOLD",
  "PRICE_VARIANCE_HOLD",
  "INVALID_VAT_CHARGE_HOLD",
  "MISSING_TIN_DOUBLE_WHT",
  "TIN_FORMAT_WARNING",
  "VAT_OMITTED_SELF_ACCOUNT_ADVISORY",
];

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const MONEY = String.raw`₦?(\d[\d,]*\.\d{2})`;

/** Money read from text: "1240000.00" or "₦1,240,000.00" → "₦1,240,000.00" (formatting only). */
const asNaira = (s: string) => naira(s.replace(/,/g, ""));

type Writer = (d: Decision, f: Flag) => Plain | null;

/** One entry per flag code. Return null to fall back to the existing explanation text. */
const COPY: Record<string, Writer> = {
  SHORT_DELIVERY_HOLD: (_d, f) => {
    const m = new RegExp(`invoiced ${NUM}, GRN delivered ${NUM}`).exec(f.detail);
    return m ? { sentence: `Invoiced for ${m[1]}, but only ${m[2]} were delivered.`, action: `Pay ${m[2]} only` } : null;
  },
  DUPLICATE_SUSPECTED: (_d, f) => {
    const m = /duplicate of (\S+)(?: \(([^)]+)\))?/.exec(f.detail);
    return m ? { sentence: `This looks like a second copy of ${m[1]}${m[2] ? ` (invoice ${m[2]})` : ""}.`, action: "Don't pay" } : null;
  },
  FOOTING_FAILURE: (_d, f) => {
    const m = new RegExp(`= ${MONEY} != printed total ${MONEY}`).exec(f.detail);
    return m
      ? { sentence: `The invoice lines add up to ${asNaira(m[1])}, but the printed total is ${asNaira(m[2])}.`, action: "Check by hand" }
      : null;
  },
  UNREGISTERED_VENDOR_BLOCKED: (d, f) => {
    const tin = /TIN (\S+)/.exec(f.detail)?.[1];
    const fine = d.contingent_exposures.find((e) => e.rule_id === "UNREGISTERED_CONTRACTOR_FINE");
    if (!tin) return null;
    return {
      sentence: `The supplier's TIN ${tin} is not in the taxpayer registry.${fine ? ` Paying them risks a ${naira(fine.amount)} fine.` : ""}`,
      action: "Don't pay",
    };
  },
  MISSING_TIN_DOUBLE_WHT: () => ({ sentence: "There is no supplier TIN on the invoice, so WHT is taken at double the rate.", action: "Ask vendor for TIN" }),
  INVALID_VAT_CHARGE_HOLD: (_d, f) => {
    const m = new RegExp(`charged ${MONEY} VAT`).exec(f.detail);
    return m
      ? { sentence: `A small supplier that isn't registered for VAT charged ${asNaira(m[1])} VAT. That part is held.`, action: "Ask vendor for VAT proof" }
      : null;
  },
  PRICE_VARIANCE_HOLD: (_d, f) => {
    const m = new RegExp(`invoice ${MONEY} vs PO ${MONEY} \\(([\\d.]+%)\\)`).exec(f.detail);
    return m
      ? { sentence: `Charged ${asNaira(m[1])} a unit against ${asNaira(m[2])} on the purchase order (${m[3]} over).`, action: "Pay the PO price" }
      : null;
  },
  VAT_OMITTED_SELF_ACCOUNT_ADVISORY: (_d, f) => {
    const m = new RegExp(`advisory ${MONEY}`).exec(f.detail);
    return {
      sentence: `No VAT was charged on a standard supply${m ? ` (advisory ${asNaira(m[1])}, not counted)` : ""}. The payment itself is fine.`,
      action: "Pay as normal",
    };
  },
  SPLIT_PO_SUSPECTED: (_d, f) => {
    const m = /cluster ([A-Z0-9-]+(?:, [A-Z0-9-]+)+) sums (\d+\.\d{2})/.exec(f.detail);
    return m
      ? { sentence: `Purchase orders ${m[1]} together come to ${asNaira(m[2])}; they may have been split to stay under the approval limit.`, action: "Check the approvals" }
      : null;
  },
  GHOST_VENDOR_SUSPECTED: (_d, f) => {
    const m = /payroll (\S+)/.exec(f.detail);
    return m ? { sentence: `This supplier's bank account is the same as employee ${m[1]}'s on the payroll.`, action: "Check by hand" } : null;
  },
  VALIDATION_FAILURE: () => ({ sentence: "", action: "Check by hand" }),
  LOW_CONFIDENCE_CRITICAL_FIELD: () => ({ sentence: "", action: "Check by hand" }),
  OFFLINE_NO_OCR: () => ({ sentence: "", action: "Check by hand" }),
  POLICY_REQUIRED: () => ({ sentence: "", action: "Set the policy" }),
  NO_PO_MATCH: () => ({ sentence: "", action: "Find the PO" }),
  UNSIGNED_GRN_HOLD: () => ({ sentence: "", action: "Get the GRN signed" }),
  TIN_FORMAT_WARNING: () => ({ sentence: "", action: "Check the TIN" }),
};

const STATUS_ACTION: Record<DecisionStatus, string> = {
  RELEASE: "Pay",
  RELEASE_PARTIAL: "Pay part",
  HOLD: "Hold",
  BLOCKED: "Don't pay",
  NEEDS_HUMAN_REVIEW: "Check by hand",
};

export function rankedFlags(d: Decision): Flag[] {
  const rank = (c: string) => (FLAG_ORDER.indexOf(c) + 1 || 99);
  return [...d.flags].sort((a, b) => rank(a.code) - rank(b.code));
}

/** Plain sentence + action for one flag, with the existing explanation as the fallback. */
export function plainFlag(d: Decision, f: Flag): Plain {
  const w = COPY[f.code]?.(d, f) ?? null;
  const fallback = reasonLine({ ...d, flags: [f] });
  return { sentence: w?.sentence || fallback, action: w?.action || STATUS_ACTION[d.status] };
}

/** The case headline: the most decisive flag's sentence and action. */
export function plainCase(d: Decision): Plain {
  const top = rankedFlags(d)[0];
  if (!top) return { sentence: reasonLine(d), action: STATUS_ACTION[d.status] };
  return plainFlag(d, top);
}
