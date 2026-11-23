import type { DecisionStatus } from "../types";
import { StatusIcon } from "./Icons";
import { STATUS_LABEL } from "../decisionText";

const STYLE: Record<DecisionStatus, string> = {
  RELEASE: "bg-[#e3f1e8] text-emerald-300 ring-emerald-500/50",
  RELEASE_PARTIAL: "bg-[#f8edd3] text-amber-300 ring-amber-400/60",
  HOLD: "bg-[#f8e1d3] text-orange-300 ring-orange-400/60",
  BLOCKED: "bg-red-400 text-white ring-red-400",
  NEEDS_HUMAN_REVIEW: "bg-zinc-900 text-zinc-200 ring-zinc-600",
};


export function StatusChip({ status }: { status: DecisionStatus }) {
  return (
    <span title={`Engine status: ${status}`} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs font-bold ring-1 ring-inset ${STYLE[status]}`}>
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function FlagChip({ code, title, quiet }: { code: string; title?: string; quiet?: boolean }) {
  const tone =
    code === "TIN_FORMAT_WARNING" || code.endsWith("ADVISORY")
      ? "border-sky-400/60 bg-[#e6f0f7] text-sky-300"
      : code === "UNREGISTERED_VENDOR_BLOCKED" || code === "GHOST_VENDOR_SUSPECTED"
        ? "border-red-400/70 bg-[#f9e3e3] text-red-300"
        : "border-zinc-700 bg-zinc-900 text-zinc-200";
  if (quiet)
    return (
      <span title={title} className="inline-block whitespace-nowrap rounded border border-zinc-800 px-1 font-mono text-xs text-zinc-500">
        {code}
      </span>
    );
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${tone}`}>
      {code}
    </span>
  );
}
