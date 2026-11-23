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
    <section className="panel p-6" aria-label="Sales classification">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-head">Trailing 12-month sales</h2>
        <span className={`badge ${c.conserved ? "bg-emerald-50 text-emerald-300" : "bg-red-400 text-white"}`}>
          <CheckMark ok={c.conserved} />{c.conserved ? "Export + Intra-zone + Domestic = Total" : "classification does not sum"}
        </span>
      </div>
      <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
        {parts.map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${shareOf(p.v, c.TOTAL)}%` }} />
        ))}
      </div>
      <dl className="tnum mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} className="flex items-baseline justify-between gap-2 border-b border-zinc-800 py-2 sm:block sm:border-b-0 sm:py-0">
            <dt className="flex items-center gap-2 text-xs text-zinc-500">
              <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${p.cls}`} />
              {p.label} · {shareOf(p.v, c.TOTAL)}%
            </dt>
            <dd className="text-base font-semibold text-zinc-100 sm:mt-1">{naira(p.v)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:border-l sm:border-zinc-800 sm:py-0 sm:pl-6">
          <dt className="text-xs text-zinc-500">Total sales</dt>
          <dd className="text-base font-bold text-zinc-100 sm:mt-1">{naira(c.TOTAL)}</dd>
        </div>
      </dl>
    </section>
  );
}
