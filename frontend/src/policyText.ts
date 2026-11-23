// Human labels and units for buyer policies. Display only: values sent to the API keep the
// backend's canonical form (ratios as decimal strings such as "0.010"). Percent conversion is a
// two-place decimal shift on strings, with no float math.

export type Unit = "percent" | "days" | "naira" | "score" | "toggle" | "choice";

export interface PolicyText {
  label: string;
  help?: string;
  unit: Unit;
  group: string;
  options?: Record<string, string>;
}

export const GROUPS = ["Matching (PO / goods received / invoice)", "Duplicates & split purchases", "Withholding tax & VAT", "Reading invoices", "Free zone"];

export const POLICY_TEXT: Record<string, PolicyText> = {
  PRICE_VARIANCE_TOL: { label: "Price allowed above the PO", help: "Hold the difference when the invoice price is more than this above the PO price.", unit: "percent", group: GROUPS[0] },
  QTY_TOL_DEFAULT: { label: "Short delivery allowed", help: "How far delivered quantity may fall below invoiced before the shortfall is held.", unit: "percent", group: GROUPS[0] },
  QTY_TOL_FUEL: { label: "Short delivery allowed on fuel (litres)", help: "Same check for fuel lines measured in litres.", unit: "percent", group: GROUPS[0] },
  PO_APPROVAL_LIMIT: { label: "PO approval limit", help: "Used by the split-purchase check.", unit: "naira", group: GROUPS[1] },
  DUP_FUZZY_MIN: { label: "Duplicate check: supplier-name similarity", help: "How alike two supplier names must be to count as the same supplier.", unit: "score", group: GROUPS[1] },
  DUP_WINDOW_DAYS: { label: "Duplicate check: look-back window", unit: "days", group: GROUPS[1] },
  SPLIT_WINDOW_DAYS: { label: "Split-purchase check: window", unit: "days", group: GROUPS[1] },
  SPLIT_BAND_LOW: { label: "Split-purchase check: flag POs from", help: "Lower edge, as a share of the PO approval limit.", unit: "percent", group: GROUPS[1] },
  SPLIT_BAND_HIGH: { label: "Split-purchase check: flag POs up to", help: "Upper edge, as a share of the PO approval limit.", unit: "percent", group: GROUPS[1] },
  WHT_RENT_RATE: { label: "WHT rate on rent", help: "Sources conflict (5% vs 10%), so there is no default. Rent invoices go to a person until this is set.", unit: "percent", group: GROUPS[2] },
  WHT_NO_TIN_DOUBLE: { label: "Double WHT when the supplier has no TIN", unit: "toggle", group: GROUPS[2] },
  WHT_SMALL_PAYER_EXEMPT: { label: "Small-company payer exemption from WHT", unit: "toggle", group: GROUPS[2] },
  BUYER_IS_SMALL_COMPANY: { label: "We are a small company", unit: "toggle", group: GROUPS[2] },
  SMALL_VENDOR_VAT_HOLD: { label: "Hold VAT charged by small vendors not registered for VAT", unit: "toggle", group: GROUPS[2] },
  CBN_MPR: { label: "CBN monetary policy rate", help: "Only used to show late-remittance interest; leave blank to hide it.", unit: "percent", group: GROUPS[2] },
  MIN_ETR_ENABLED: { label: "Show the 15% minimum effective tax rate row", unit: "toggle", group: GROUPS[2] },
  LLM_MIN_CONFIDENCE: {
    label: "Minimum reading confidence for the TIN and total",
    help: "Below this, the invoice goes to a person.",
    unit: "choice",
    group: GROUPS[3],
    options: { HIGH: "High", MEDIUM: "Medium", LOW: "Low" },
  },
  FTZ_BOUNDARY: {
    label: "When is the free-zone 25% line breached?",
    help: "Sources conflict on whether exactly 25% is a breach.",
    unit: "choice",
    group: GROUPS[4],
    options: { AT_OR_ABOVE_BREACH: "At 25% or above (default)", ABOVE_ONLY_BREACH: "Only above 25%" },
  },
  FTZ_ILLUSTRATIVE_PROFIT: { label: "Free-zone annual profit (illustrative)", help: "An assumption for the two-readings panel, not a figure from the ledger.", unit: "naira", group: GROUPS[4] },
};

export const UNIT_SUFFIX: Partial<Record<Unit, string>> = { percent: "%", days: "days", score: "out of 100" };

/** Shift a plain decimal string by `places` (positive = ×10^places). Returns null when not a number. */
function shift(v: string, places: number): string | null {
  const t = v.trim();
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (!m[1] && !m[2])) return null;
  let int = m[1] || "0";
  let frac = m[2] || "";
  if (places > 0) {
    frac = frac.padEnd(places, "0");
    int = int + frac.slice(0, places);
    frac = frac.slice(places);
  } else {
    const n = -places;
    int = int.padStart(n + 1, "0");
    frac = int.slice(int.length - n) + frac;
    int = int.slice(0, int.length - n);
  }
  int = int.replace(/^0+(?=\d)/, "");
  frac = frac.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** "0.010" → "1" ; "0.005" → "0.5" ; "" → "". */
export function ratioToPercent(v: string): string {
  if (v.trim() === "") return "";
  return shift(v, 2) ?? v;
}

/** "1.5" → "0.015"; invalid input is passed through so the API's validation reports it. */
export function percentToRatio(v: string): string {
  if (v.trim() === "") return "";
  return shift(v, -2) ?? v;
}
