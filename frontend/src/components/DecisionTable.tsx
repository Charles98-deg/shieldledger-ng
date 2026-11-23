import { naira } from "../money";
import type { Decision } from "../types";
import { EngineBadge } from "./EngineBadge";
import { FlagChip, StatusChip } from "./StatusChip";

function Amount({ v, dim, excluded }: { v: string; dim?: boolean; excluded?: boolean }) {
  return <span className={`tnum ${excluded ? "text-zinc-500 line-through decoration-zinc-600" : dim ? "text-zinc-500" : ""}`}>{naira(v)}</span>;
}

const isPattern = (d: Decision) => d.kind !== "INVOICE";

export function DecisionTable({ rows, onOpen }: { rows: Decision[]; onOpen: (d: Decision) => void }) {
  return (
    <>
      {/* ≥ 640px: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 sm:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-3 py-2">Doc</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">WHT</th>
              <th className="px-3 py-2 text-right">Net safe payable</th>
              <th className="px-3 py-2 text-right">Held / blocked</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Flags</th>
              <th className="px-3 py-2">Engine</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((d) => (
              <tr
                key={`${d.kind}-${d.subject_id}`}
                tabIndex={0}
                onClick={() => onOpen(d)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(d))}
                className="cursor-pointer outline-none hover:bg-zinc-900 focus-visible:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                aria-label={`Open evidence for ${d.doc_label}`}
              >
                <td className="px-3 py-2 font-mono text-xs">
                  {d.doc_label}
                  {isPattern(d) && <div className="text-[10px] text-zinc-500">{d.kind === "PO_PATTERN" ? "PO pattern" : "vendor pattern"}</div>}
                </td>
                <td className="max-w-[14rem] truncate px-3 py-2" title={d.vendor_name}>
                  {d.vendor_name}
                </td>
                <td className="px-3 py-2 text-right">{isPattern(d) && d.kind === "VENDOR_PATTERN" ? "—" : <Amount v={d.gross} excluded={d.excluded_from_totals && !isPattern(d)} />}</td>
                <td className="px-3 py-2 text-right">{isPattern(d) ? "—" : <Amount v={d.wht_to_remit} dim={d.excluded_from_totals} />}</td>
                <td className="px-3 py-2 text-right font-semibold">{isPattern(d) ? "—" : <Amount v={d.net_safe_payable} dim={d.excluded_from_totals} />}</td>
                <td className="px-3 py-2 text-right">{isPattern(d) ? "—" : <Amount v={d.blocked_or_hold} dim={d.excluded_from_totals} />}</td>
                <td className="px-3 py-2">
                  <StatusChip status={d.status} />
                  {d.excluded_from_totals && !isPattern(d) && <div className="mt-0.5 text-[10px] text-zinc-500">excluded from totals</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex max-w-[16rem] flex-wrap gap-1">
                    {d.flags.length ? d.flags.map((f) => <FlagChip key={f.code} code={f.code} title={f.detail} />) : <span className="text-xs text-zinc-600">none</span>}
                  </div>
                </td>
                <td className="px-3 py-2">{isPattern(d) ? <span className="text-xs text-zinc-500">master data</span> : <EngineBadge engine={d.engine} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < 640px: cards */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((d) => (
          <li key={`${d.kind}-${d.subject_id}`}>
            <button onClick={() => onOpen(d)} className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-left hover:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-zinc-400">{d.doc_label}</div>
                  <div className="truncate font-medium">{d.vendor_name}</div>
                </div>
                <StatusChip status={d.status} />
              </div>
              {!isPattern(d) && (
                <dl className="tnum mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-zinc-500">Gross</dt>
                  <dd className="text-right">{naira(d.gross)}</dd>
                  <dt className="text-zinc-500">WHT</dt>
                  <dd className="text-right">{naira(d.wht_to_remit)}</dd>
                  <dt className="text-zinc-500">Net safe payable</dt>
                  <dd className="text-right font-semibold">{naira(d.net_safe_payable)}</dd>
                  <dt className="text-zinc-500">Held / blocked</dt>
                  <dd className="text-right">{naira(d.blocked_or_hold)}</dd>
                </dl>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {d.flags.map((f) => (
                  <FlagChip key={f.code} code={f.code} />
                ))}
                {!isPattern(d) && <EngineBadge engine={d.engine} />}
                {d.excluded_from_totals && !isPattern(d) && <span className="text-[10px] text-zinc-500">excluded from totals</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
