import { naira } from "../money";
import type { FtzPosition } from "../types";
import { StatusLabel } from "./StatusLabel";

export function InterpretationPanel({ base, scenario }: { base: FtzPosition; scenario: FtzPosition | null }) {
  const rows = [
    {
      k: "A",
      title: "CIT on domestic-attributable profit only",
      formula: "profit × domestic share × 30%",
      base: base.interpretations.A_domestic_attributable,
      scn: scenario?.interpretations.A_domestic_attributable,
    },
    {
      k: "B",
      title: "CIT on all profit (exemption lost)",
      formula: "profit × 30%",
      base: base.interpretations.B_all_profit,
      scn: scenario?.interpretations.B_all_profit,
    },
  ];
  return (
    <section className="rounded-lg border border-amber-400/30 bg-zinc-900 p-4" aria-label="Interpretation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">If the 25% line is crossed: two readings</h2>
        <div className="flex gap-1">
          <StatusLabel status="CONFLICTING" />
          <span className="text-xs text-zinc-500">FTZ_DOMESTIC_THRESHOLD</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-amber-200/90">Interpretation not settled in sources — see Statutory Register.</p>
      <p className="mt-1 text-xs text-zinc-400">
        Assumption (illustrative, user-editable in Policies): annual profit <span className="tnum font-medium text-zinc-200">{naira(base.illustrative_profit)}</span>. CIT rate 30%{" "}
        <StatusLabel status="SECONDARY_VERIFIED" />.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className="rounded border border-zinc-800 p-3">
            <div className="text-xs text-zinc-400">
              <span className="mr-1 rounded bg-zinc-800 px-1.5 font-mono font-bold text-zinc-200">{r.k}</span>
              {r.title}
            </div>
            <div className="mt-0.5 font-mono text-xs text-zinc-500">{r.formula}</div>
            <div className="tnum mt-2 text-2xl font-bold">{naira(r.base)}</div>
            <div className="text-xs text-zinc-500">at current share {base.share_pct}</div>
            {r.scn && (
              <div className="tnum mt-1 text-sm text-orange-200">
                {naira(r.scn)} <span className="text-xs text-zinc-500">at scenario share {scenario?.share_pct_4dp}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {base.min_etr_info && (
        <p className="tnum mt-3 text-xs text-zinc-400">
          Info (MIN_ETR_15 toggle ON): profit × 15% = {naira(base.min_etr_info)} <StatusLabel status="SECONDARY_VERIFIED" /> — information only.
        </p>
      )}
    </section>
  );
}
