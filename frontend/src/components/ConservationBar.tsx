import { naira, shareOf, toKobo } from "../money";
import { CheckMark } from "./Icons";

export function ConservationBar({
  parts,
  total,
  ok,
  totalLabel,
}: {
  parts: { label: string; value: string; color: string }[];
  total: string;
  ok: boolean;
  totalLabel: string;
}) {
  const t = toKobo(total);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4" aria-label="Conservation check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-zinc-100">Conservation: net + WHT + held = gross</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-bold ring-1 ring-inset ${ok ? "bg-[#e3f1e8] text-emerald-300 ring-emerald-500/50" : "bg-red-400 text-white ring-red-400"}`}
          role="status"
        >
          <CheckMark ok={ok} />
          {ok ? "Balances to the kobo" : "Does not balance"}
        </span>
      </div>
      <div className="mt-3 flex h-6 w-full gap-px overflow-hidden rounded-sm bg-zinc-800" aria-hidden>
        {t > 0n &&
          parts.map((p) => (
            <div key={p.label} className={p.color} style={{ width: `${shareOf(p.value, total)}%` }} title={`${p.label}: ${naira(p.value)}`} />
          ))}
      </div>
      <div className="tnum mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-4 sm:items-center">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-center justify-between gap-2 sm:block">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${p.color}`} />
              {p.label}
              {i < parts.length - 1 && <span className="hidden text-zinc-600 sm:inline"> +</span>}
            </div>
            <div className="text-base font-semibold">{naira(p.value)}</div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-2 sm:block sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <div className="text-xs text-zinc-400">= {totalLabel}</div>
          <div className="text-base font-bold">{naira(total)}</div>
        </div>
      </div>
    </section>
  );
}
