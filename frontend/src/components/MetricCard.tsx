import type { ReactNode } from "react";
import { naira } from "../money";

/**
 * One of the two headline measures. They are different kinds of money, so each carries its kind
 * in words (a tag) and in hue: green = cash, amber = contingent exposure (not cash).
 */
export function MetricCard({
  title,
  kind,
  total,
  caption,
  lines,
  tone,
  footnote,
}: {
  title: string;
  kind: string;
  total: string;
  caption?: string;
  lines: { label: ReactNode; value: string }[];
  tone: "emerald" | "amber";
  footnote?: ReactNode;
}) {
  const tag = tone === "emerald" ? "bg-emerald-50 text-emerald-300" : "bg-amber-50 text-amber-300";
  const text = tone === "emerald" ? "text-emerald-300" : "text-amber-300";
  return (
    <section className="panel flex flex-col p-6" aria-label={title}>
      <span className={`badge self-start uppercase tracking-[0.06em] text-2xs ${tag}`}>{kind}</span>
      <h2 className="mt-3 text-lg font-bold text-zinc-100">{title}</h2>
      {caption && <p className="text-sm text-zinc-500">{caption}</p>}
      <p className={`tnum mt-3 text-4xl font-bold tracking-[-0.02em] ${text}`}>{naira(total)}</p>
      <dl className="mt-5 divide-y divide-zinc-800 border-t border-zinc-800 text-sm">
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-zinc-400">{l.label}</dt>
            <dd className="tnum whitespace-nowrap font-semibold text-zinc-100">{naira(l.value)}</dd>
          </div>
        ))}
      </dl>
      {footnote && <div className="mt-auto pt-4 text-sm leading-relaxed text-zinc-500">{footnote}</div>}
    </section>
  );
}
