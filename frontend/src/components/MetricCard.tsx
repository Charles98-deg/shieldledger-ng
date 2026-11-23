import type { ReactNode } from "react";
import { naira } from "../money";

export function MetricCard({
  title,
  total,
  caption,
  lines,
  tone,
  footnote,
}: {
  title: string;
  total: string;
  caption?: string;
  lines: { label: ReactNode; value: string }[];
  tone: "emerald" | "amber";
  footnote?: ReactNode;
}) {
  const band = tone === "emerald" ? "bg-emerald-500" : "bg-amber-400";
  const text = tone === "emerald" ? "text-emerald-300" : "text-amber-300";
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900" aria-label={title}>
      <div aria-hidden className={`h-1 ${band}`} />
      <div className="p-4 sm:p-5">
      <h2 className="text-base font-bold text-zinc-100">{title}</h2>
      {caption && <p className="mt-0.5 text-xs text-zinc-400">{caption}</p>}
      <p className={`tnum mt-3 text-3xl font-bold tracking-[-0.02em] sm:text-[2.5rem] sm:leading-none ${text}`}>{naira(total)}</p>
      <dl className="mt-4 space-y-1.5 border-t border-zinc-800 pt-3 text-sm">
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <dt className="text-zinc-400">{l.label}</dt>
            <dd className="tnum font-semibold text-zinc-100">{naira(l.value)}</dd>
          </div>
        ))}
      </dl>
      {footnote && <div className="mt-3 text-sm leading-relaxed text-zinc-400">{footnote}</div>}
      </div>
    </section>
  );
}
