import { naira, shareOf, toKobo } from "../money";
import { CheckMark } from "./Icons";

/** net + WHT + held = gross, as one bar and one aligned equation. */
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
    <section className="panel p-6" aria-label="Conservation check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="panel-head">Where the gross goes</h2>
          <p className="text-sm text-zinc-500">Net safe payable + WHT to remit + blocked or held = gross invoiced</p>
        </div>
        <span className={`badge ${ok ? "bg-emerald-50 text-emerald-300" : "bg-red-400 text-white"}`} role="status">
          <CheckMark ok={ok} />
          {ok ? "Balances to the kobo" : "Does not balance"}
        </span>
      </div>
      <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
        {t > 0n &&
          parts.map((p) => (
            <div key={p.label} className={p.color} style={{ width: `${shareOf(p.value, total)}%` }} title={`${p.label}: ${naira(p.value)}`} />
          ))}
      </div>
      <dl className="tnum mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-4">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-baseline justify-between gap-2 border-b border-zinc-800 py-2 sm:block sm:border-b-0 sm:py-0">
            <dt className="flex items-center gap-2 text-xs text-zinc-500">
              <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${p.color}`} />
              {p.label}
              <span aria-hidden className="text-zinc-600">· {shareOf(p.value, total)}%</span>
              {i < parts.length - 1 && <span className="sr-only">plus</span>}
            </dt>
            <dd className="text-base font-semibold text-zinc-100 sm:mt-1">{naira(p.value)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:border-l sm:border-zinc-800 sm:py-0 sm:pl-6">
          <dt className="text-xs text-zinc-500">= {totalLabel}</dt>
          <dd className="text-base font-bold text-zinc-100 sm:mt-1">{naira(total)}</dd>
        </div>
      </dl>
    </section>
  );
}
