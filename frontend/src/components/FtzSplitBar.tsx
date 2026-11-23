import { naira, shareOf } from "../money";
import type { FtzSummary } from "../types";
import { CheckMark } from "./Icons";

export function FtzSplitBar({ c }: { c: FtzSummary["classification"] }) {
  const parts = [
    { label: "Export", v: c.EXPORT, cls: "bg-adire-800" },
    { label: "Intra-zone", v: c.INTRA_ZONE, cls: "bg-adire-400" },
    { label: "Domestic (customs territory)", v: c.DOMESTIC_CUSTOMS_TERRITORY, cls: "bg-orange-400" },
  ];
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4" aria-label="Sales classification">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Trailing-12-month sales</h2>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${c.conserved ? "text-emerald-300" : "text-red-300"}`}>
          <CheckMark ok={c.conserved} />{c.conserved ? "Export + Intra-zone + Domestic = Total" : "classification does not sum"}
        </span>
      </div>
      <div className="mt-3 flex h-5 overflow-hidden rounded-sm bg-zinc-800" aria-hidden>
        {parts.map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${shareOf(p.v, c.TOTAL)}%` }} />
        ))}
      </div>
      <dl className="tnum mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} className="flex justify-between gap-2 sm:block">
            <dt className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${p.cls}`} />
              {p.label} · {shareOf(p.v, c.TOTAL)}%
            </dt>
            <dd className="font-semibold">{naira(p.v)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t border-zinc-800 pt-2 sm:block sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <dt className="text-xs text-zinc-400">Total sales</dt>
          <dd className="font-bold">{naira(c.TOTAL)}</dd>
        </div>
      </dl>
    </section>
  );
}
