// Plain-English presentation of a Decision for the AP clerk ("which invoices can I pay, and how
// much?"). Pure functions of data the API already returns: status, money strings, flags and their
// details. No amount is computed here except BigInt sums of API money strings for the summary strip.
import { addMoney, isZero, naira } from "./money";
import type { Decision, DecisionStatus } from "./types";

export type Bucket = "PAY_NOW" | "PAY_PART" | "HOLD" | "DO_NOT_PAY" | "NEEDS_PERSON";

export const BUCKETS: { id: Bucket; label: string; status: DecisionStatus }[] = [
  { id: "PAY_NOW", label: "Pay now", status: "RELEASE" },
  { id: "PAY_PART", label: "Pay part", status: "RELEASE_PARTIAL" },
  { id: "HOLD", label: "Hold", status: "HOLD" },
  { id: "DO_NOT_PAY", label: "Do not pay", status: "BLOCKED" },
  { id: "NEEDS_PERSON", label: "Needs a person", status: "NEEDS_HUMAN_REVIEW" },
];

export const STATUS_LABEL: Record<DecisionStatus, string> = {
  RELEASE: "Pay now",
  RELEASE_PARTIAL: "Pay part",
  HOLD: "Hold",
  BLOCKED: "Do not pay",
  NEEDS_HUMAN_REVIEW: "Needs a person",
};

export function bucketOf(d: Decision): Bucket {
  return BUCKETS.find((b) => b.status === d.status)!.id;
}

/** Exceptions first: the clerk's attention order. */
const RANK: Record<DecisionStatus, number> = { BLOCKED: 0, HOLD: 1, NEEDS_HUMAN_REVIEW: 2, RELEASE_PARTIAL: 3, RELEASE: 4 };

export function exceptionsFirst(rows: Decision[]): Decision[] {
  return [...rows].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      Number(b.flags.length > 0) - Number(a.flags.length > 0) ||
      a.doc_label.localeCompare(b.doc_label, "en", { numeric: true }),
  );
}

/** The action line: what to do and how much. */
export function actionLine(d: Decision): string {
  if (d.kind !== "INVOICE") return "Check this pattern before paying the vendor";
  switch (d.status) {
    case "RELEASE":
      return `Pay ${naira(d.net_safe_payable)}`;
    case "RELEASE_PARTIAL":
      return `Pay ${naira(d.net_safe_payable)}, hold ${naira(d.blocked_or_hold)}`;
    case "HOLD":
      return `Hold ${naira(d.blocked_or_hold)}`;
    case "BLOCKED":
      return `Do not pay ${naira(d.blocked_or_hold)}`;
    case "NEEDS_HUMAN_REVIEW":
      return "Check the invoice before paying";
  }
}

// Most decisive flag first; the reason line explains that one.
const FLAG_ORDER = [
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

function sentence(d: Decision, code: string, detail: string): string {
  switch (code) {
    case "UNREGISTERED_VENDOR_BLOCKED": {
      const fine = d.contingent_exposures.length ? addMoney(...d.contingent_exposures.map((e) => e.amount)) : null;
      return `Supplier TIN not found in the taxpayer registry${fine ? `; paying risks a ${naira(fine)} fine` : ""}.`;
    }
    case "DUPLICATE_SUSPECTED":
      return `Looks like a ${detail}.`;
    case "GHOST_VENDOR_SUSPECTED":
      return `Vendor bank account matches an employee (${detail}).`;
    case "SPLIT_PO_SUSPECTED":
      return `POs may have been split to stay under the approval limit (${detail}).`;
    case "FOOTING_FAILURE":
      return "The invoice lines don't add up to the printed total.";
    case "VALIDATION_FAILURE":
      return `Some invoice fields could not be read or are invalid (${detail}).`;
    case "LOW_CONFIDENCE_CRITICAL_FIELD":
      return "The TIN or total could not be read with enough confidence.";
    case "OFFLINE_NO_OCR":
      return "This is an image; it can't be read without Gemini.";
    case "POLICY_REQUIRED":
      return "A buyer policy must be set before this can be decided (see Policies).";
    case "NO_PO_MATCH":
      return "No matching purchase order was found.";
    case "UNSIGNED_GRN_HOLD":
      return "The goods-received note is not signed.";
    case "SHORT_DELIVERY_HOLD":
      return `Short delivery: ${detail}; pay only for what arrived.`;
    case "PRICE_VARIANCE_HOLD":
      return `Price above the PO: ${detail}.`;
    case "INVALID_VAT_CHARGE_HOLD":
      return "A small vendor not registered for VAT charged VAT; hold the VAT portion.";
    case "MISSING_TIN_DOUBLE_WHT":
      return "No supplier TIN on the invoice: WHT is deducted at double rate.";
    case "TIN_FORMAT_WARNING":
      return "The TIN format looks unusual; check it against the registry.";
    case "VAT_OMITTED_SELF_ACCOUNT_ADVISORY":
      return "VAT was not charged; advisory only, the payment is not affected.";
    default:
      return detail ? `${detail}.` : code;
  }
}

/** The amount beside the status chip in the table (the chip already carries the verb). */
export function actionAmount(d: Decision): string {
  if (d.kind !== "INVOICE") return "check before paying this vendor";
  switch (d.status) {
    case "RELEASE":
      return naira(d.net_safe_payable);
    case "RELEASE_PARTIAL":
      return `${naira(d.net_safe_payable)} · hold ${naira(d.blocked_or_hold)}`;
    case "HOLD":
    case "BLOCKED":
      return naira(d.blocked_or_hold);
    case "NEEDS_HUMAN_REVIEW":
      return "check the invoice first";
  }
}

/** One-line reason, deterministic from status and flags. */
export function reasonLine(d: Decision): string {
  const ranked = [...d.flags].sort((a, b) => {
    const ia = FLAG_ORDER.indexOf(a.code);
    const ib = FLAG_ORDER.indexOf(b.code);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const top = ranked[0];
  if (top) return sentence(d, top.code, top.detail);
  if (d.kind === "INVOICE" && d.status === "RELEASE") {
    return isZero(d.wht_to_remit) ? "All checks passed." : `All checks passed; WHT of ${naira(d.wht_to_remit)} is withheld.`;
  }
  return "See the evidence trail.";
}

/** Summary-strip money for a bucket: what the clerk can pay, or what is held. */
export function bucketAmount(rows: Decision[], b: Bucket): { value: string; caption: string } {
  const sum = (f: (d: Decision) => string) => (rows.length ? addMoney(...rows.map(f)) : "0.00");
  switch (b) {
    case "PAY_NOW":
      return { value: sum((d) => d.net_safe_payable), caption: "to pay" };
    case "PAY_PART":
      return { value: sum((d) => d.net_safe_payable), caption: `to pay · ${naira(sum((d) => d.blocked_or_hold))} held` };
    case "HOLD":
      return { value: sum((d) => d.blocked_or_hold), caption: "held" };
    case "DO_NOT_PAY":
      return { value: sum((d) => d.blocked_or_hold), caption: "blocked" };
    case "NEEDS_PERSON":
      return { value: sum((d) => d.gross), caption: "excluded from totals" };
  }
}
