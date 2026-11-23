import { actionAmount, reasonLine } from "../decisionText";
import { naira, shareOf, toKobo } from "../money";
import type { Decision } from "../types";
import { EngineBadge } from "./EngineBadge";
import { FlagChip, StatusChip } from "./StatusChip";

function Amount({ v, dim, excluded }: { v: string; dim?: boolean; excluded?: boolean }) {
  return <span className={`tnum ${excluded ? "text-zinc-500 line-through decoration-zinc-600" : dim ? "text-zinc-500" : ""}`}>{naira(v)}</span>;
}

const isPattern = (d: Decision) => d.kind !== "INVOICE";
const keyOf = (d: Decision) => `${d.kind}-${d.subject_id}`;

/** Dye strip: the invoice's gross; dyed = net payable, half-dyed = WHT, undyed = held. */
function DyeStrip({ d }: { d: Decision }) {
  if (isPattern(d) || toKobo(d.gross) === 0n) return null;
  const label = d.excluded_from_totals
    ? `Excluded from totals: ${naira(d.gross)} awaiting review`
    : `Net ${naira(d.net_safe_payable)}, WHT ${naira(d.wht_to_remit)}, held ${naira(d.blocked_or_hold)} of ${naira(d.gross)}`;
  return (
    <div className="h-3 w-full" role="img" aria-label={label} title={label}>
      <div className="flex h-full w-full gap-px">
        {d.excluded_from_totals ? (
          <div className="dye-held-review h-full w-full rounded-[2px]" />
        ) : (
          <>
            {toKobo(d.net_safe_payable) > 0n && <div className="dye-net h-full" style={{ width: `${shareOf(d.net_safe_payable, d.gross)}%` }} />}
            {toKobo(d.wht_to_remit) > 0n && <div className="dye-wht h-full min-w-[2px]" style={{ width: `${shareOf(d.wht_to_remit, d.gross)}%` }} />}
            {toKobo(d.blocked_or_hold) > 0n && <div className="dye-held h-full min-w-[3px]" style={{ width: `${shareOf(d.blocked_or_hold, d.gross)}%` }} />}
          </>
        )}
      </div>
    </div>
  );
}

export function DyeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400" aria-hidden>
      <span className="inline-flex items-center gap-1.5"><span className="dye-net inline-block h-3 w-4" />Net safe payable</span>
      <span className="inline-flex items-center gap-1.5"><span className="dye-wht inline-block h-3 w-4" />WHT to remit</span>
      <span className="inline-flex items-center gap-1.5"><span className="dye-held inline-block h-3 w-4" />Held / blocked</span>
      <span className="inline-flex items-center gap-1.5"><span className="dye-held-review inline-block h-3 w-4" />Excluded, needs a person</span>
      <span>Each bar is one invoice's gross.</span>
    </div>
  );
}

/** Action cell: plain-English decision, the reason, then the engine's flag codes as small chips. */
function Action({ d }: { d: Decision }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={d.status} />
        <span className="tnum font-bold text-zinc-100">{actionAmount(d)}</span>
      </div>
      <p className="mt-1 text-sm leading-snug text-zinc-300">{reasonLine(d)}</p>
      {(d.flags.length > 0 || d.excluded_from_totals) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {d.flags.map((f) => (
            <FlagChip key={f.code} code={f.code} title={f.detail} quiet />
          ))}
          {d.excluded_from_totals && !isPattern(d) && <span className="text-xs text-zinc-500">excluded from totals</span>}
        </div>
      )}
    </div>
  );
}

export function DecisionTable({ rows, onOpen, selected }: { rows: Decision[]; onOpen: (d: Decision) => void; selected?: string | null }) {
  const anyMoney = rows.some((r) => !isPattern(r));
  return (
    <>
      {/* ≥ 640px: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-700 bg-adire-50 text-left text-xs font-semibold uppercase tracking-wide text-adire-900">
            <tr>
              <th className="px-3 py-2">Doc</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="w-[40%] px-3 py-2">What to do</th>
              {anyMoney && (
                <>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">WHT</th>
                  <th className="px-3 py-2 text-right">Net safe payable</th>
                  <th className="px-3 py-2 text-right">Held / blocked</th>
                  <th className="w-24 px-3 py-2">Split</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((d) => (
              <tr
                key={keyOf(d)}
                tabIndex={0}
                aria-selected={selected === keyOf(d)}
                onClick={() => onOpen(d)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(d))}
                className="row-select cursor-pointer align-top outline-none hover:bg-zinc-950 focus-visible:shadow-[inset_0_0_0_2px_#1d2d6b] aria-selected:bg-adire-100 aria-selected:shadow-[inset_0_0_0_2px_#1d2d6b]"
                aria-label={`Open evidence for ${d.doc_label}`}
              >
                <td className="px-3 py-3 font-mono text-sm font-semibold">
                  {d.doc_label}
                  {isPattern(d) && <div className="font-sans text-xs font-normal text-zinc-500">{d.kind === "PO_PATTERN" ? "PO pattern" : "vendor pattern"}</div>}
                </td>
                <td className="max-w-[12rem] px-3 py-3" title={d.vendor_name}>
                  <div className="font-medium [overflow-wrap:anywhere]">{d.vendor_name}</div>
                  <div className="mt-1">{isPattern(d) ? <span className="text-xs text-zinc-500">master data</span> : <EngineBadge engine={d.engine} />}</div>
                </td>
                <td className="px-3 py-3">
                  <Action d={d} />
                </td>
                {anyMoney && (
                  <>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{isPattern(d) && d.kind === "VENDOR_PATTERN" ? "—" : <Amount v={d.gross} excluded={d.excluded_from_totals && !isPattern(d)} />}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{isPattern(d) ? "—" : <Amount v={d.wht_to_remit} dim={d.excluded_from_totals} />}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{isPattern(d) ? "—" : <Amount v={d.net_safe_payable} dim={d.excluded_from_totals} />}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{isPattern(d) ? "—" : <Amount v={d.blocked_or_hold} dim={d.excluded_from_totals} />}</td>
                    <td className="px-3 py-3 pt-4">
                      <DyeStrip d={d} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < 640px: cards */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((d) => (
          <li key={keyOf(d)}>
            <button
              onClick={() => onOpen(d)}
              aria-pressed={selected === keyOf(d)}
              className="row-select w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left hover:bg-zinc-950 aria-pressed:bg-adire-100 aria-pressed:shadow-[inset_0_0_0_2px_#1d2d6b]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-zinc-300">{d.doc_label}</span>
                <span className="truncate font-medium">{d.vendor_name}</span>
              </div>
              <div className="mt-2">
                <Action d={d} />
              </div>
              <div className="mt-2">
                <DyeStrip d={d} />
              </div>
              {!isPattern(d) && (
                <dl className="tnum mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
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
              {!isPattern(d) && (
                <div className="mt-2">
                  <EngineBadge engine={d.engine} />
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
