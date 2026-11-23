import { useRef, type KeyboardEvent } from "react";
import { BUCKETS, actionAmount, bucketAmount, bucketOf, reasonLine, type Bucket } from "../decisionText";
import { naira } from "../money";
import type { Decision } from "../types";
import { StatusIcon } from "./Icons";
import { FlagChip, StatusChip } from "./StatusChip";

const TONE: Record<Bucket, string> = {
  PAY_NOW: "text-emerald-300",
  PAY_PART: "text-amber-300",
  HOLD: "text-orange-300",
  DO_NOT_PAY: "text-red-300",
  NEEDS_PERSON: "text-zinc-200",
};

export const keyOf = (d: Decision) => `${d.kind}-${d.subject_id}`;

/**
 * "Which invoices can I pay, and how much?" One segmented control: each bucket shows its count and
 * naira amount and filters the case list.
 */
export function SummaryStrip({ invoices, filter, onFilter }: { invoices: Decision[]; filter: Bucket | null; onFilter: (b: Bucket | null) => void }) {
  return (
    <div role="group" aria-label="Filter the batch by decision" className="grid grid-cols-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 sm:grid-cols-3 lg:grid-cols-5">
      {BUCKETS.map((b, i) => {
        const rows = invoices.filter((d) => bucketOf(d) === b.id);
        const amt = bucketAmount(rows, b.id);
        const on = filter === b.id;
        return (
          <button
            key={b.id}
            aria-pressed={on}
            disabled={rows.length === 0}
            onClick={() => onFilter(on ? null : b.id)}
            className={`row-select relative border-zinc-800 px-4 py-3 text-left hover:bg-zinc-950 disabled:cursor-default disabled:opacity-55 aria-pressed:bg-adire-800 aria-pressed:hover:bg-adire-800 ${
              i > 0 ? "border-l" : ""
            } max-lg:border-b`}
          >
            <div className={`flex items-center gap-1.5 text-sm font-bold ${on ? "text-white" : TONE[b.id]}`}>
              <StatusIcon status={b.status} />
              {b.label}
              <span className={`tnum ml-auto text-2xl font-bold leading-none ${on ? "text-white" : "text-zinc-100"}`}>{rows.length}</span>
            </div>
            <div className={`tnum mt-2 text-lg font-semibold leading-tight ${on ? "text-white" : "text-zinc-100"}`}>{naira(amt.value)}</div>
            <div className={`text-xs ${on ? "text-adire-100" : "text-zinc-400"}`}>{amt.caption}</div>
          </button>
        );
      })}
    </div>
  );
}

/** The batch as a queue of cases, exceptions first. Arrow keys move the selection. */
export function CaseList({ rows, selected, onSelect, label }: { rows: Decision[]; selected: string | null; onSelect: (d: Decision) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : -1;
    if (next < 0 || next >= rows.length) return;
    e.preventDefault();
    onSelect(rows[next]);
    refs.current[next]?.focus();
  };
  const selIndex = rows.findIndex((d) => keyOf(d) === selected);
  return (
    <ul aria-label={label} className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
      {rows.map((d, i) => {
        const on = keyOf(d) === selected;
        const pattern = d.kind !== "INVOICE";
        return (
          <li key={keyOf(d)}>
            <button
              ref={(el) => (refs.current[i] = el)}
              aria-current={on ? "true" : undefined}
              tabIndex={on || (selIndex < 0 && i === 0) ? 0 : -1}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => onKey(e, i)}
              className="row-select grid w-full grid-cols-[3.25rem_1fr] gap-x-2 px-3 py-3 text-left hover:bg-zinc-950 focus-visible:outline-offset-[-2px] aria-[current=true]:bg-adire-100 aria-[current=true]:shadow-[inset_0_0_0_2px_#1d2d6b]"
            >
              <span className="pt-0.5 font-mono text-sm font-semibold text-zinc-200">{d.doc_label}</span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 font-semibold text-zinc-100 [overflow-wrap:anywhere]">{d.vendor_name}</span>
                  <span className={`tnum whitespace-nowrap font-bold ${d.excluded_from_totals && !pattern ? "text-zinc-500 line-through decoration-zinc-500" : "text-zinc-100"}`}>
                    {d.excluded_from_totals && !pattern ? naira(d.gross) : actionAmount(d)}
                  </span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusChip status={d.status} />
                  <span className="text-sm text-zinc-300">{reasonLine(d)}</span>
                </span>
                {d.flags.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {d.flags.map((f) => (
                      <FlagChip key={f.code} code={f.code} quiet />
                    ))}
                    {pattern && <span className="text-xs text-zinc-500">master data, not in totals</span>}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
