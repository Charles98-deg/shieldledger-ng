import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorBox, Loading } from "../components/Drawer";
import { FtzGauge } from "../components/FtzGauge";
import { FtzSplitBar } from "../components/FtzSplitBar";
import { InterpretationPanel } from "../components/InterpretationPanel";
import { ScenarioInput } from "../components/ScenarioInput";
import { StatusLabel } from "../components/StatusLabel";
import { naira } from "../money";
import type { FtzPosition, FtzSummary } from "../types";

const BOUNDARIES = [
  { v: "AT_OR_ABOVE_BREACH", label: "≥ 25% breaches (default)" },
  { v: "ABOVE_ONLY_BREACH", label: "> 25% breaches (exactly 25% = CRITICAL)" },
];

export function FtzMonitor({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [s, setS] = useState<FtzSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scn, setScn] = useState<FtzPosition | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setErr(null);
    api
      .ftz()
      .then(setS)
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(load, [refreshKey]);

  async function setBoundary(v: string) {
    setS((cur) => (cur ? { ...cur, boundary: v } : cur));
    setSaving(true);
    try {
      await api.putPolicies({ FTZ_BOUNDARY: v });
      setScn(null);
      load();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!s) return <Loading />;
  const rule = (id: string) => s.rules.find((r) => r.id === id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Free-zone monitor · Qua River Agro-Processing FZE (fictional)</h1>
        <p className="text-sm text-zinc-400">
          Share of sales into the customs territory vs the 25% line in the NTA 2025 free-zone provisions <StatusLabel status={rule("FTZ_DOMESTIC_THRESHOLD")?.status ?? "CONFLICTING"} />.
          Illustrative ledger.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>
          Sunset date <strong>{s.sunset.date}</strong>: <strong className="tnum">{s.sunset.days_remaining}</strong> days remaining{" "}
          <StatusLabel status={s.sunset.status} />
        </span>
        <span className="text-xs text-zinc-400">{rule("FTZ_SUNSET")?.cite}</span>
      </div>

      <FtzSplitBar c={s.classification} />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 md:col-span-1">
          <FtzGauge shareStr={s.share} sharePct={s.share_pct} band={s.band} />
          <p className="mt-2 text-center text-xs text-zinc-500">Bands: &lt;18% safe · &lt;22% watch · &lt;25% critical · 25% line</p>
        </section>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Headroom</h2>
          <p className="tnum mt-2 text-3xl font-bold text-orange-200">{naira(s.headroom)}</p>
          <p className="mt-1 text-xs text-zinc-500">Extra domestic sales (added to both domestic and total) before the share reaches the line under the selected reading. Floored to the kobo.</p>
        </section>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Boundary reading</h2>
          <div className="mt-2 space-y-1" role="radiogroup" aria-label="FTZ boundary">
            {BOUNDARIES.map((b) => (
              <label key={b.v} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="ftzb" checked={s.boundary === b.v} disabled={saving} onChange={() => setBoundary(b.v)} className="accent-orange-500" />
                {b.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Sources conflict on whether exactly 25% breaches, and on the effective date. <StatusLabel status="CONFLICTING" /> Change is audited.
          </p>
          <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Arm’s-length flag</h2>
          <p className="mt-1 text-sm">
            <strong className="tnum">{s.arms_length_flags}</strong> related-party outsourced row(s) <StatusLabel status={rule("FTZ_ARMS_LENGTH_OUTSOURCING")?.status ?? "UNVERIFIED"} />
          </p>
          <p className="text-xs text-zinc-500">Flag only; no tax effect computed.</p>
        </section>
      </div>

      <ScenarioInput onResult={setScn} />
      <InterpretationPanel base={s} scenario={scn} />

      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Rules cited on this screen</h2>
        <ul className="mt-2 space-y-1 text-xs">
          {s.rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{r.id}</span>
              <StatusLabel status={r.status} />
              <span className="text-zinc-400">{r.cite}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-800">
        <button onClick={() => setShowLedger(!showLedger)} aria-expanded={showLedger} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold">
          Ledger ({s.ledger.length} rows, illustrative) <span aria-hidden>{showLedger ? "▾" : "▸"}</span>
        </button>
        {showLedger && (
          <div className="overflow-x-auto border-t border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-1.5">Period</th>
                  <th className="px-3 py-1.5">Class</th>
                  <th className="hidden px-3 py-1.5 sm:table-cell">Customer (fictional)</th>
                  <th className="hidden px-3 py-1.5 sm:table-cell">Ref</th>
                  <th className="px-3 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {s.ledger.map((r) => (
                  <tr key={r.id} className={r.related_party_outsourced ? "bg-amber-400/5" : ""}>
                    <td className="px-3 py-1 font-mono">{r.period}</td>
                    <td className="px-3 py-1">
                      {r.classification.replace(/_/g, " ").toLowerCase()}
                      {r.related_party_outsourced && <span className="ml-1 text-amber-300">· related-party</span>}
                    </td>
                    <td className="hidden px-3 py-1 sm:table-cell">{r.customer}</td>
                    <td className="hidden px-3 py-1 font-mono sm:table-cell">{r.invoice_ref}</td>
                    <td className="tnum px-3 py-1 text-right">{naira(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
