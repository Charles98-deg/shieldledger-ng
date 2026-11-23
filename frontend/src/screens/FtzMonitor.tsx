import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorBox, Loading } from "../components/Drawer";
import { BAND_TONE, FtzScale } from "../components/FtzScale";
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-zinc-100">Free-zone monitor</h1>
        <p className="mt-1 max-w-[72ch] text-sm text-zinc-400">
          Qua River Agro-Processing FZE (fictional, illustrative ledger). Share of sales into the customs territory against the 25% line in the NTA 2025 free-zone provisions.
        </p>
      </div>

      <section aria-labelledby="ftz-pos" className="panel p-6">
        <h2 id="ftz-pos" className="sr-only">
          Current position
        </h2>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
          <div>
            <p className="label">Domestic share of sales · trailing 12 months</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="tnum text-[3.25rem] font-bold leading-none tracking-[-0.02em] text-zinc-100">{s.share_pct}</p>
              <span className={`badge px-2.5 py-1 text-sm font-bold uppercase tracking-[0.04em] ${(BAND_TONE[s.band] ?? BAND_TONE.CRITICAL).badge}`}>{s.band}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              The line is <strong className="text-zinc-200">25%</strong> of total sales. Bands: under 18% safe, under 22% watch, under 25% critical.
            </p>
          </div>
          <div className="md:border-l md:border-zinc-800 md:pl-10">
            <p className="label">Headroom before the line</p>
            <p className="tnum mt-1 text-3xl font-bold tracking-[-0.01em] text-zinc-100">{naira(s.headroom)}</p>
            <p className="mt-2 text-sm text-zinc-500">
              Extra domestic sales (added to both domestic and total) before the share reaches the line under the selected boundary reading. Floored to the kobo.
            </p>
          </div>
        </div>
        <div className="mt-6">
          <FtzScale shareStr={s.share} sharePct={s.share_pct} band={s.band} />
        </div>
      </section>

      <FtzSplitBar c={s.classification} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="ftz-conf" className="panel p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ftz-conf" className="panel-head">
              Boundary reading
            </h2>
            <StatusLabel status={rule("FTZ_DOMESTIC_THRESHOLD")?.status ?? "CONFLICTING"} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            <strong className="font-semibold text-amber-300">Conflicting</strong> means sources disagree: here, on whether exactly 25% breaches and on the effective date. You choose the reading; the change is audited.
          </p>
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="FTZ boundary">
            {BOUNDARIES.map((b) => (
              <label
                key={b.v}
                className={`flex cursor-pointer items-center gap-3 rounded border px-3.5 py-2.5 text-sm transition-colors duration-150 ${
                  s.boundary === b.v ? "border-action-300 bg-action-50 font-semibold text-zinc-100" : "border-zinc-700 text-zinc-300 hover:bg-zinc-950"
                }`}
              >
                <input type="radio" name="ftzb" checked={s.boundary === b.v} disabled={saving} onChange={() => setBoundary(b.v)} className="h-4 w-4 accent-action-600" />
                {b.label}
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="ftz-unv" className="panel p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ftz-unv" className="panel-head">
              Not verified in sources
            </h2>
            <StatusLabel status="UNVERIFIED" />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            <strong className="font-semibold text-red-300">Unverified</strong> means the provision was not located in the sources reviewed. These are shown as a countdown and a flag only; no tax effect is computed.
          </p>
          <dl className="mt-4 divide-y divide-zinc-800 border-y border-zinc-800">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-sm text-zinc-300">
                Sunset date <strong className="tnum text-zinc-100">{s.sunset.date}</strong> <StatusLabel status={s.sunset.status} />
                <span className="block text-xs text-zinc-500">{rule("FTZ_SUNSET")?.cite}</span>
              </dt>
              <dd className="tnum text-lg font-bold text-zinc-100">
                {s.sunset.days_remaining} <span className="text-sm font-normal text-zinc-500">days remaining</span>
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-sm text-zinc-300">
                Arm’s-length flag <StatusLabel status={rule("FTZ_ARMS_LENGTH_OUTSOURCING")?.status ?? "UNVERIFIED"} />
                <span className="block text-xs text-zinc-500">Related-party outsourced rows. Flag only; no tax effect computed.</span>
              </dt>
              <dd className="tnum text-lg font-bold text-zinc-100">
                {s.arms_length_flags} <span className="text-sm font-normal text-zinc-500">row(s)</span>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <ScenarioInput onResult={setScn} />
      <InterpretationPanel base={s} scenario={scn} />

      <section className="panel p-6">
        <h2 className="panel-head">Rules cited on this screen</h2>
        <ul className="mt-3 divide-y divide-zinc-800 text-sm">
          {s.rules.map((r) => (
            <li key={r.id} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[17rem_10rem_minmax(0,1fr)] sm:items-center">
              <span className="font-mono text-xs text-zinc-300">{r.id}</span>
              <span>
                <StatusLabel status={r.status} />
              </span>
              <span className="text-zinc-500">{r.cite}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel overflow-hidden">
        <button onClick={() => setShowLedger(!showLedger)} aria-expanded={showLedger} className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-zinc-950">
          <span className="panel-head">
            Ledger <span className="text-sm font-normal text-zinc-500">· {s.ledger.length} rows, illustrative</span>
          </span>
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`text-zinc-500 transition-transform duration-150 ${showLedger ? "rotate-90" : ""}`}>
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
        {showLedger && (
          <div className="overflow-x-auto border-t border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2">Class</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Customer (fictional)</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Ref</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {s.ledger.map((r) => (
                  <tr key={r.id} className={r.related_party_outsourced ? "bg-amber-400/5" : ""}>
                    <td className="px-4 py-1.5 font-mono">{r.period}</td>
                    <td className="px-4 py-1.5">
                      {r.classification.replace(/_/g, " ").toLowerCase()}
                      {r.related_party_outsourced && <span className="ml-1 text-amber-300">· related-party</span>}
                    </td>
                    <td className="hidden px-4 py-1.5 sm:table-cell">{r.customer}</td>
                    <td className="hidden px-4 py-1.5 font-mono sm:table-cell">{r.invoice_ref}</td>
                    <td className="tnum px-4 py-1.5 text-right">{naira(r.amount)}</td>
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
