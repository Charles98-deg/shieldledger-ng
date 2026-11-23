import type { RuleStatus } from "../types";

const STYLE: Record<RuleStatus, string> = {
  SECONDARY_VERIFIED: "border-emerald-600/60 text-emerald-300",
  CONFLICTING: "border-amber-500/70 text-amber-300",
  BRIEF_ONLY: "border-violet-500/60 text-violet-300",
  UNVERIFIED: "border-red-500/60 text-red-300",
  BUYER_POLICY: "border-sky-500/60 text-sky-300",
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
      className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide ${STYLE[s] ?? "border-zinc-600 text-zinc-300"}`}
    >
      {status}
    </span>
  );
}
