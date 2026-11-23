import { naira, shareOf, toKobo } from "../money";

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
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4" aria-label="Conservation check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Conservation</h2>
        <span
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/20 text-red-300"}`}
          role="status"
        >
          {ok ? "✓ balances to the kobo" : "✗ does not balance"}
        </span>
      </div>
      <div className="mt-3 flex h-4 w-full overflow-hidden rounded bg-zinc-800" aria-hidden>
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
            <div className="font-semibold">{naira(p.value)}</div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-2 sm:block sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <div className="text-xs text-zinc-400">= {totalLabel}</div>
          <div className="font-bold">{naira(total)}</div>
        </div>
      </div>
    </section>
  );
}
