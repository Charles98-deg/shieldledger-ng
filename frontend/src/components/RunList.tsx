import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { plainCase, plainSentence, rankedFlags } from "../copy/plain";
import { BUCKETS, STATUS_LABEL, bucketAmount, bucketOf } from "../decisionText";
import { naira } from "../money";
import type { Decision, Summary } from "../types";
import { CheckMark, StatusIcon } from "./Icons";
import { STATUS_TONE } from "./StatusChip";

export const keyOf = (d: Decision) => `${d.kind}-${d.subject_id}`;

/** A collapsed "Show working" block. Native <details>: keyboard and screen-reader support for free. */
export function Working({ label = "Show working", children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-semibold text-action-600 hover:text-action-800 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-150 group-open:rotate-90">
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">Hide working</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * Step 2, the answer. Every figure is an API value: the batch totals from /api/summary, counts of
 * decisions from /api/decisions. Nothing is computed beyond counting rows.
 */
export function Answer({ invoices, totals }: { invoices: Decision[]; totals: Summary["conservation"] }) {
  // Counts of rows only; the three lines below reconcile: full + part = payable, need you + ready = checked.
  const full = invoices.filter((d) => d.status === "RELEASE").length;
  const part = invoices.filter((d) => d.status === "RELEASE_PARTIAL").length;
  const payable = full + part;
  const needYou = invoices.length - full;
  return (
    <div>
      <p className="tnum text-3xl font-bold leading-tight tracking-[-0.02em] text-zinc-100 sm:text-4xl">
        Safe to pay today: <span className="whitespace-nowrap">{naira(totals.net_safe_payable)}</span>{" "}
        <span className="whitespace-nowrap text-2xl font-semibold text-zinc-400 sm:text-3xl">
          across {payable} invoice{payable === 1 ? "" : "s"}
        </span>{" "}
        <span className="whitespace-nowrap text-xl font-semibold text-zinc-500 sm:text-2xl">
          ({full} in full, {part} in part)
        </span>
      </p>
      <ul className="tnum mt-3 space-y-1 text-lg text-zinc-300">
        <li>
          <strong className="text-zinc-100">{needYou}</strong> need{needYou === 1 ? "s" : ""} you · <strong className="text-zinc-100">{full}</strong> ready to pay ·{" "}
          <span className="text-zinc-500">
            {invoices.length} checked
          </span>
        </li>
        <li>
          <strong className="text-zinc-100">{naira(totals.blocked_or_hold)}</strong> on hold until fixed
        </li>
      </ul>

      <ul aria-label="Invoices by decision" className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-800 pt-4">
        {BUCKETS.map((b) => {
          const n = invoices.filter((d) => bucketOf(d) === b.id).length;
          return (
            <li key={b.id} className={`inline-flex items-center gap-2 text-sm font-semibold ${n ? STATUS_TONE[b.status].text : "text-zinc-500"}`}>
              <StatusIcon status={b.status} />
              <span className="text-zinc-200">{b.label}</span>
              <span className="tnum text-base font-bold text-zinc-100">{n}</span>
            </li>
          );
        })}
      </ul>

      <Working className="mt-4">
        <div className="space-y-4 rounded bg-zinc-950 px-4 py-4">
          <dl className="tape grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
            <div>
              <dt className="label">Gross invoiced</dt>
              <dd className="mt-0.5 font-semibold text-zinc-100">{naira(totals.gross)}</dd>
            </div>
            <div>
              <dt className="label">− WHT to remit</dt>
              <dd className="mt-0.5 font-semibold text-zinc-100">{naira(totals.wht_to_remit)}</dd>
            </div>
            <div>
              <dt className="label">− Held or blocked</dt>
              <dd className="mt-0.5 font-semibold text-zinc-100">{naira(totals.blocked_or_hold)}</dd>
            </div>
            <div>
              <dt className="label">= Net safe payable</dt>
              <dd className="mt-0.5 font-semibold text-zinc-100">{naira(totals.net_safe_payable)}</dd>
            </div>
            <div>
              <dt className="label">Conservation</dt>
              <dd className={`mt-0.5 inline-flex items-center gap-1.5 font-semibold ${totals.ok ? "text-emerald-300" : "text-red-300"}`}>
                <CheckMark ok={totals.ok} />
                {totals.ok ? "Balances to the kobo" : "Does not balance"}
              </dd>
            </div>
          </dl>
          <dl className="tnum grid grid-cols-2 gap-x-6 gap-y-3 border-t border-zinc-800 pt-3 text-sm sm:grid-cols-5">
            {BUCKETS.map((b) => {
              const rows = invoices.filter((d) => bucketOf(d) === b.id);
              const amt = bucketAmount(rows, b.id);
              return (
                <div key={b.id}>
                  <dt className="label">{b.label}</dt>
                  <dd className="mt-0.5 font-semibold text-zinc-100">{naira(amt.value)}</dd>
                  <dd className="text-xs text-zinc-500">{amt.caption}</dd>
                </div>
              );
            })}
          </dl>
          <p className="text-xs text-zinc-500">Invoices needing a person are excluded from every total until reviewed. Recommendation only: nothing is paid from here.</p>
        </div>
      </Working>
    </div>
  );
}

/** The amount at risk on a row, read straight from the decision. */
function atRisk(d: Decision): { value: string | null; caption: string } {
  if (d.kind !== "INVOICE") return { value: d.gross !== "0.00" ? naira(d.gross) : null, caption: d.kind === "PO_PATTERN" ? "PO value, not in totals" : "vendor master, not in totals" };
  switch (d.status) {
    case "RELEASE":
      return { value: naira(d.net_safe_payable), caption: "to pay" };
    case "RELEASE_PARTIAL":
      return { value: naira(d.blocked_or_hold), caption: `on hold · pay ${naira(d.net_safe_payable)}` };
    case "HOLD":
      return { value: naira(d.blocked_or_hold), caption: "on hold" };
    case "BLOCKED":
      return { value: naira(d.blocked_or_hold), caption: "blocked" };
    case "NEEDS_HUMAN_REVIEW":
      return { value: naira(d.gross), caption: "not counted until checked" };
  }
}

/** Step 3 rows: vendor, amount at risk, one plain sentence, one action. Arrow keys move the selection. */
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
        const m = atRisk(d);
        const p = plainCase(d);
        const top = rankedFlags(d)[0];
        const tone = STATUS_TONE[d.status];
        return (
          <li key={keyOf(d)}>
            <button
              ref={(el) => (refs.current[i] = el)}
              aria-current={on ? "true" : undefined}
              tabIndex={on || (selIndex < 0 && i === 0) ? 0 : -1}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => onKey(e, i)}
              className="row-select grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-4 text-left hover:bg-zinc-950 focus-visible:outline-offset-[-2px] aria-[current=true]:bg-action-50"
            >
              <span className={`pt-1 ${tone.text}`} title={STATUS_LABEL[d.status]}>
                <StatusIcon status={d.status} />
                <span className="sr-only">{STATUS_LABEL[d.status]}: </span>
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-zinc-100 [overflow-wrap:anywhere]">{d.vendor_name}</span>
                <span className="ml-2 font-mono text-xs text-zinc-500">{d.doc_label}</span>
              </span>
              <span className="tnum whitespace-nowrap text-right font-bold text-zinc-100">{m.value ?? ""}</span>
              <span aria-hidden />
              <span className="max-w-[60ch] text-sm text-zinc-400" data-copy={top && !plainSentence(d, top).fromCopy ? "fallback" : "copy"}>
                {p.sentence}
              </span>
              <span className="whitespace-nowrap text-right text-xs text-zinc-500">{m.caption}</span>
              <span aria-hidden />
              <span className="pt-1">
                <span className={`badge ${tone.badge}`}>{p.action}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
