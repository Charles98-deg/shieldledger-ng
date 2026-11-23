// Plain-English copy for the AP clerk: one sentence per flag, and one next action per case that
// follows the engine status.
//
// Rules:
// - Numbers are only ever *read*: from the flag's own detail text (pattern-matched, never parsed to
//   float) or from a single API money field. Nothing is added, subtracted or recomputed here.
// - When the detail text doesn't match the expected shape, fall back to the existing explanation
//   (`reasonLine`), so a changed engine message degrades to the old wording, never to a wrong number.
import { reasonLine } from "../decisionText";
import { naira } from "../money";
import type { Decision, Flag } from "../types";

export interface Plain {
  sentence: string;
  action: string;
}

type Copy = { sentence: string };

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

type Writer = (d: Decision, f: Flag) => Copy | null;

/** One entry per flag code. Return null to fall back to the existing explanation text. */
const COPY: Record<string, Writer> = {
  SHORT_DELIVERY_HOLD: (_d, f) => {
    const m = new RegExp(`invoiced ${NUM}, GRN delivered ${NUM}`).exec(f.detail);
    return m ? { sentence: `Invoiced for ${m[1]}, but only ${m[2]} were delivered.` } : null;
  },
  DUPLICATE_SUSPECTED: (_d, f) => {
    const m = /duplicate of (\S+)(?: \(([^)]+)\))?/.exec(f.detail);
    return m ? { sentence: `This looks like a second copy of ${m[1]}${m[2] ? ` (invoice ${m[2]})` : ""}.` } : null;
  },
  FOOTING_FAILURE: (_d, f) => {
    const m = new RegExp(`= ${MONEY} != printed total ${MONEY}`).exec(f.detail);
    return m
      ? { sentence: `The invoice lines add up to ${asNaira(m[1])}, but the printed total is ${asNaira(m[2])}.` }
      : null;
  },
  UNREGISTERED_VENDOR_BLOCKED: (d, f) => {
    const tin = /TIN (\S+)/.exec(f.detail)?.[1];
    const fine = d.contingent_exposures.find((e) => e.rule_id === "UNREGISTERED_CONTRACTOR_FINE");
    if (!tin) return null;
    return {
      sentence: `The supplier's TIN ${tin} is not in the taxpayer registry.${fine ? ` Paying them risks a ${naira(fine.amount)} fine.` : ""}`,
    };
  },
  MISSING_TIN_DOUBLE_WHT: () => ({ sentence: "There is no supplier TIN on the invoice, so WHT is taken at double the rate." }),
  INVALID_VAT_CHARGE_HOLD: (_d, f) => {
    const m = new RegExp(`charged ${MONEY} VAT`).exec(f.detail);
    return m
      ? { sentence: `A small supplier that isn't registered for VAT charged ${asNaira(m[1])} VAT. That part is held.` }
      : null;
  },
  PRICE_VARIANCE_HOLD: (_d, f) => {
    const m = new RegExp(`invoice ${MONEY} vs PO ${MONEY} \\(([\\d.]+%)\\)`).exec(f.detail);
    return m
      ? { sentence: `Charged ${asNaira(m[1])} a unit against ${asNaira(m[2])} on the purchase order (${m[3]} over).` }
      : null;
  },
  VAT_OMITTED_SELF_ACCOUNT_ADVISORY: (_d, f) => {
    const m = new RegExp(`advisory ${MONEY}`).exec(f.detail);
    return {
      sentence: `No VAT was charged on a standard supply${m ? ` (advisory ${asNaira(m[1])}, not counted)` : ""}. The payment itself is fine.`,
    };
  },
  SPLIT_PO_SUSPECTED: (_d, f) => {
    const m = /cluster ([A-Z0-9-]+(?:, [A-Z0-9-]+)+) sums (\d+\.\d{2})/.exec(f.detail);
    return m
      ? { sentence: `Purchase orders ${m[1]} together come to ${asNaira(m[2])}; they may have been split to stay under the approval limit.` }
      : null;
  },
  GHOST_VENDOR_SUSPECTED: (_d, f) => {
    const m = /payroll (\S+)/.exec(f.detail);
    return m ? { sentence: `This supplier's bank account is the same as employee ${m[1]}'s on the payroll.` } : null;
  },
};

// Short reasons for HOLD actions ("Hold: <reason>"), by the case's most decisive flag.
const HOLD_REASON: Record<string, string> = {
  DUPLICATE_SUSPECTED: "check it wasn't already paid",
  SPLIT_PO_SUSPECTED: "check the approvals",
  GHOST_VENDOR_SUSPECTED: "check the bank account",
  NO_PO_MATCH: "find the PO",
  UNSIGNED_GRN_HOLD: "get the GRN signed",
  POLICY_REQUIRED: "set the policy",
  TIN_FORMAT_WARNING: "check the TIN",
};

/**
 * The action always follows the engine status, never stronger than it:
 * BLOCKED → "Don't pay"; HOLD → "Hold: <reason>"; NEEDS_HUMAN_REVIEW → "Check by hand";
 * RELEASE_PARTIAL → "Pay <qty or amount> only"; RELEASE → "Pay" or a flag's pay-and-follow-up action.
 * Quantities come from the short-delivery flag text; amounts from the API's net_safe_payable.
 */
function statusAction(d: Decision, top: Flag | undefined, releaseAction: string | undefined): string {
  switch (d.status) {
    case "BLOCKED":
      return "Don't pay";
    case "NEEDS_HUMAN_REVIEW":
      return "Check by hand";
    case "HOLD":
      return `Hold: ${(top && HOLD_REASON[top.code]) || "see what happened"}`;
    case "RELEASE_PARTIAL": {
      const short = d.flags.find((f) => f.code === "SHORT_DELIVERY_HOLD");
      const qty = short && new RegExp(`GRN delivered ${NUM}`).exec(short.detail)?.[1];
      return qty ? `Pay ${qty} only` : `Pay ${naira(d.net_safe_payable)} only`;
    }
    case "RELEASE":
      return releaseAction ?? "Pay";
  }
}

// Actions a RELEASE case may carry: still "pay", plus a follow-up. Anything else becomes plain "Pay".
const RELEASE_ACTION: Record<string, string> = {
  MISSING_TIN_DOUBLE_WHT: "Pay; ask vendor for TIN",
  VAT_OMITTED_SELF_ACCOUNT_ADVISORY: "Pay as normal",
  TIN_FORMAT_WARNING: "Pay; check the TIN",
};

export function rankedFlags(d: Decision): Flag[] {
  const rank = (c: string) => (FLAG_ORDER.indexOf(c) + 1 || 99);
  return [...d.flags].sort((a, b) => rank(a.code) - rank(b.code));
}

/** Sentence for one flag. `fromCopy` is false when it fell back to the existing explanation text. */
export function plainSentence(d: Decision, f: Flag): { sentence: string; fromCopy: boolean } {
  const w = COPY[f.code]?.(d, f) ?? null;
  return w?.sentence ? { sentence: w.sentence, fromCopy: true } : { sentence: reasonLine({ ...d, flags: [f] }), fromCopy: false };
}

/** Plain sentence + status-driven action for one flag. */
export function plainFlag(d: Decision, f: Flag): Plain {
  return { sentence: plainSentence(d, f).sentence, action: statusAction(d, f, RELEASE_ACTION[f.code]) };
}

/** The case headline: the most decisive flag's sentence, and the action the status allows. */
export function plainCase(d: Decision): Plain {
  const top = rankedFlags(d)[0];
  if (!top) return { sentence: reasonLine(d), action: statusAction(d, undefined, undefined) };
  return plainFlag(d, top);
}
