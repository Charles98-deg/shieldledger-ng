import type { DecisionStatus } from "../types";

const STYLE: Record<DecisionStatus, string> = {
  RELEASE: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  RELEASE_PARTIAL: "bg-amber-400/15 text-amber-200 ring-amber-400/40",
  HOLD: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  BLOCKED: "bg-red-500/15 text-red-300 ring-red-500/50",
  NEEDS_HUMAN_REVIEW: "bg-zinc-500/20 text-zinc-300 ring-zinc-400/40",
};

const LABEL: Record<DecisionStatus, string> = {
  RELEASE: "Release",
  RELEASE_PARTIAL: "Release partial",
  HOLD: "Hold",
  BLOCKED: "Blocked",
  NEEDS_HUMAN_REVIEW: "Needs review",
};

export function StatusChip({ status }: { status: DecisionStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLE[status]}`}>
      {LABEL[status]}
    </span>
  );
}

export function FlagChip({ code, title }: { code: string; title?: string }) {
  const tone =
    code === "TIN_FORMAT_WARNING" || code.endsWith("ADVISORY")
      ? "border-sky-500/40 text-sky-300"
      : code === "UNREGISTERED_VENDOR_BLOCKED" || code === "GHOST_VENDOR_SUSPECTED"
        ? "border-red-500/50 text-red-300"
        : "border-zinc-600 text-zinc-300";
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] ${tone}`}>
      {code}
    </span>
  );
}
