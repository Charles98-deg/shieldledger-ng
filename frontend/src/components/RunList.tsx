import { useRef, type KeyboardEvent } from "react";
import { BUCKETS, bucketAmount, bucketOf, reasonLine, type Bucket } from "../decisionText";
import { naira } from "../money";
import type { Decision, Summary } from "../types";
import { CheckMark, StatusIcon } from "./Icons";
import { STATUS_TONE, StatusChip } from "./StatusChip";

export const keyOf = (d: Decision) => `${d.kind}-${d.subject_id}`;

/**
 * Batch header: the one answer first (net safe to pay), settled against gross, then the five decision
 * buckets as a segmented filter. Totals come from /api/summary, kobo-exact strings.
 */
export function BatchPanel({
  invoices,
  totals,
  filter,
  onFilter,
}: {
  invoices: Decision[];
  totals: Summary["conservation"] | null;
  filter: Bucket | null;
  onFilter: (b: Bucket | null) => void;
}) {
  return (
    <section aria-label="Batch totals" className="panel overflow-hidden">
      {totals && (
        <div className="flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-end xl:justify-between xl:gap-8">
          <div>
            <p className="label">Net safe to pay</p>
            <p className="tnum mt-1 text-4xl font-bold tracking-[-0.02em] text-zinc-100">{naira(totals.net_safe_payable)}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {invoices.length} invoices in this run · recommendation only, nothing is paid from here
            </p>
          </div>
          <dl className="tape grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:text-right">
            <div>
              <dt className="label">Gross invoiced</dt>
              <dd className="mt-0.5 text-base font-semibold text-zinc-100">{naira(totals.gross)}</dd>
            </div>
            <div>
              <dt className="label">
                <span aria-hidden>− </span>WHT to remit
              </dt>
              <dd className="mt-0.5 text-base font-semibold text-zinc-100">{naira(totals.wht_to_remit)}</dd>
            </div>
            <div>
              <dt className="label">
                <span aria-hidden>− </span>Held or blocked
              </dt>
              <dd className="mt-0.5 text-base font-semibold text-zinc-100">{naira(totals.blocked_or_hold)}</dd>
            </div>
            <div>
              <dt className="label">Check</dt>
              <dd className={`mt-0.5 inline-flex items-center gap-1.5 text-base font-semibold ${totals.ok ? "text-emerald-300" : "text-red-300"}`} role="status">
                <CheckMark ok={totals.ok} />
                {totals.ok ? "Balances" : "Off"}
              </dd>
            </div>
          </dl>
        </div>
      )}
      <div role="group" aria-label="Filter the batch by decision" className="grid grid-cols-2 border-t border-zinc-800 bg-zinc-950/60 sm:grid-cols-3 lg:grid-cols-5">
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
              className={`row-select relative border-zinc-800 px-5 py-3.5 text-left hover:bg-zinc-900 disabled:cursor-default disabled:opacity-50 aria-pressed:bg-adire-800 aria-pressed:hover:bg-adire-800 ${i > 0 ? "lg:border-l" : ""} max-lg:shadow-[inset_-1px_-1px_0_#e4e8ef]`}
            >
              <span className={`flex items-center gap-1.5 text-sm font-bold ${on ? "text-white" : STATUS_TONE[b.status].text}`}>
                <StatusIcon status={b.status} />
                {b.label}
                <span className={`tnum ml-auto text-xl font-bold leading-none ${on ? "text-white" : "text-zinc-100"}`}>{rows.length}</span>
              </span>
              <span className={`tnum mt-1.5 block text-base font-semibold ${on ? "text-white" : "text-zinc-100"}`}>{naira(amt.value)}</span>
              <span className={`block text-xs ${on ? "text-adire-200" : "text-zinc-500"}`}>{amt.caption}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Right-hand money for a queue row: the figure that matters for this decision, and what it means. */
function rowMoney(d: Decision): { value: string | null; caption: string; struck?: boolean } {
  if (d.kind !== "INVOICE") return { value: null, caption: "check before paying this vendor" };
  switch (d.status) {
    case "RELEASE":
      return { value: naira(d.net_safe_payable), caption: "to pay" };
    case "RELEASE_PARTIAL":
      return { value: naira(d.net_safe_payable), caption: `to pay · hold ${naira(d.blocked_or_hold)}` };
    case "HOLD":
      return { value: naira(d.blocked_or_hold), caption: "held" };
    case "BLOCKED":
      return { value: naira(d.blocked_or_hold), caption: "blocked" };
    case "NEEDS_HUMAN_REVIEW":
      return { value: naira(d.gross), caption: "check the invoice first", struck: true };
  }
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
    <ul aria-label={label} className="panel divide-y divide-zinc-800 overflow-hidden">
      {rows.map((d, i) => {
        const on = keyOf(d) === selected;
        const m = rowMoney(d);
        return (
          <li key={keyOf(d)}>
            <button
              ref={(el) => (refs.current[i] = el)}
              aria-current={on ? "true" : undefined}
              tabIndex={on || (selIndex < 0 && i === 0) ? 0 : -1}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => onKey(e, i)}
              className="row-select group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-5 py-4 text-left hover:bg-zinc-950 focus-visible:outline-offset-[-2px] aria-[current=true]:bg-action-50"
            >
              <span className="flex min-w-0 items-baseline gap-2.5">
                <span className="w-[3.25rem] shrink-0 font-mono text-xs font-semibold text-zinc-500 group-aria-[current=true]:text-action-700">{d.doc_label}</span>
                <span className="min-w-0 font-semibold text-zinc-100 [overflow-wrap:anywhere]">{d.vendor_name}</span>
              </span>
              <span className={`tnum whitespace-nowrap text-right font-bold ${m.struck ? "text-zinc-500 line-through decoration-zinc-500" : "text-zinc-100"}`}>{m.value ?? ""}</span>
              <span className="flex min-w-0 items-center sm:pl-[3.875rem]">
                <StatusChip status={d.status} />
              </span>
              <span className="self-center whitespace-nowrap text-right text-xs text-zinc-500">{m.caption}</span>
              <span className="col-span-2 max-w-[62ch] text-sm text-zinc-400 sm:pl-[3.875rem]">{reasonLine(d)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
