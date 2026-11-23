import type { RuleStatus } from "../types";

// Honesty labels. Verified = quiet green; conflicting = amber; unverified = red; brief-only = slate.
const STYLE: Record<RuleStatus, string> = {
  SECONDARY_VERIFIED: "bg-emerald-50 text-emerald-300",
  CONFLICTING: "bg-amber-50 text-amber-300",
  BRIEF_ONLY: "bg-zinc-800 text-zinc-300",
  UNVERIFIED: "bg-red-50 text-red-300",
  BUYER_POLICY: "bg-adire-100 text-adire-800",
};

export const STATUS_HELP: Record<RuleStatus, string> = {
  SECONDARY_VERIFIED: "Supported by a law-firm / practitioner summary of the gazetted Act. Primary text not read.",
  CONFLICTING: "Sources disagree. A toggle or buyer policy decides; the default is stated.",
  BRIEF_ONLY: "From the build brief only; no independent source located.",
  UNVERIFIED: "Not located in sources reviewed. Used only as a label, warning or hold.",
  BUYER_POLICY: "The buyer's own AP control or engine invariant. Not law.",
};

export function StatusLabel({ status }: { status: RuleStatus | string }) {
  const s = status as RuleStatus;
  return (
    <span
      title={STATUS_HELP[s]}
      className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-px align-[1px] font-mono text-2xs font-semibold uppercase ${STYLE[s] ?? "bg-zinc-800 text-zinc-300"}`}
    >
      {status}
    </span>
  );
}
