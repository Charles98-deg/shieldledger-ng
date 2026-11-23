import type { DecisionStatus } from "../types";
import { StatusIcon } from "./Icons";
import { STATUS_LABEL } from "../decisionText";

// One badge shape for every decision. Hue + icon + words: status is never colour alone.
// Strength rises with severity: tinted for pay / pay part / hold, solid for do-not-pay,
// outlined neutral for "needs a person" (excluded until reviewed).
export const STATUS_TONE: Record<DecisionStatus, { badge: string; text: string; tint: string }> = {
  RELEASE: { badge: "bg-emerald-50 text-emerald-300", text: "text-emerald-300", tint: "bg-emerald-50" },
  RELEASE_PARTIAL: { badge: "bg-amber-50 text-amber-300", text: "text-amber-300", tint: "bg-amber-50" },
  HOLD: { badge: "bg-orange-50 text-orange-300", text: "text-orange-300", tint: "bg-orange-50" },
  BLOCKED: { badge: "bg-red-400 text-white", text: "text-red-300", tint: "bg-red-50" },
  NEEDS_HUMAN_REVIEW: { badge: "bg-zinc-900 text-zinc-300 ring-1 ring-inset ring-zinc-600", text: "text-zinc-300", tint: "bg-zinc-950" },
};

export function StatusChip({ status }: { status: DecisionStatus }) {
  return (
    <span title={`Engine status: ${status}`} className={`badge ${STATUS_TONE[status].badge}`}>
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Flag codes are secondary: small, quiet, monospace (they are codes). */
export function FlagChip({ code, title, quiet }: { code: string; title?: string; quiet?: boolean }) {
  const tone =
    code === "TIN_FORMAT_WARNING" || code.endsWith("ADVISORY")
      ? "bg-sky-50 text-sky-300"
      : code === "UNREGISTERED_VENDOR_BLOCKED" || code === "GHOST_VENDOR_SUSPECTED"
        ? "bg-red-50 text-red-300"
        : "bg-zinc-950 text-zinc-400";
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-px font-mono text-2xs ${quiet ? "bg-zinc-950 text-zinc-500" : tone}`}>
      {code}
    </span>
  );
}
