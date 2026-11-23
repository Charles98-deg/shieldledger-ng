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
    <section className="panel p-6" aria-label="Interpretation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-head">If the 25% line is crossed: two readings</h2>
        <div className="flex items-center gap-2">
          <StatusLabel status="CONFLICTING" />
          <span className="code">FTZ_DOMESTIC_THRESHOLD</span>
        </div>
      </div>
      <p className="mt-1 text-sm text-amber-300">Interpretation not settled in sources: both readings are shown, neither is chosen. See Statutory Register.</p>
      <p className="mt-1 text-sm text-zinc-500">
        Assumption (illustrative, user-editable in Policies): annual profit <span className="tnum font-medium text-zinc-200">{naira(base.illustrative_profit)}</span>. CIT rate 30%{" "}
        <StatusLabel status="SECONDARY_VERIFIED" />.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className="rounded bg-zinc-950 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <span className="grid h-6 w-6 place-items-center rounded-sm bg-adire-800 text-xs font-bold text-white">{r.k}</span>
              {r.title}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{r.formula}</div>
            <div className="tnum mt-3 text-2xl font-bold text-zinc-100">{naira(r.base)}</div>
            <div className="text-xs text-zinc-500">at current share {base.share_pct}</div>
            {r.scn && (
              <div className="tnum mt-2 border-t border-zinc-800 pt-2 text-base font-semibold text-orange-300">
                {naira(r.scn)} <span className="text-xs text-zinc-500">at scenario share {scenario?.share_pct_4dp}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {base.min_etr_info && (
        <p className="tnum mt-4 text-sm text-zinc-500">
          Info (MIN_ETR_15 toggle ON): profit × 15% = {naira(base.min_etr_info)} <StatusLabel status="SECONDARY_VERIFIED" /> — information only.
        </p>
      )}
    </section>
  );
}
