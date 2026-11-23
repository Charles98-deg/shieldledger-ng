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
  const ring = tone === "emerald" ? "border-emerald-500/40" : "border-amber-400/40";
  const text = tone === "emerald" ? "text-emerald-300" : "text-amber-200";
  return (
    <section className={`rounded-lg border ${ring} bg-zinc-900/70 p-4 sm:p-5`} aria-label={title}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h2>
      {caption && <p className="mt-0.5 text-xs text-zinc-400">{caption}</p>}
      <p className={`tnum mt-3 text-3xl font-bold sm:text-4xl ${text}`}>{naira(total)}</p>
      <dl className="mt-4 space-y-1.5 border-t border-zinc-800 pt-3 text-sm">
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <dt className="text-zinc-400">{l.label}</dt>
            <dd className="tnum font-medium text-zinc-100">{naira(l.value)}</dd>
          </div>
        ))}
      </dl>
      {footnote && <div className="mt-3 text-xs leading-relaxed text-zinc-500">{footnote}</div>}
    </section>
  );
}
