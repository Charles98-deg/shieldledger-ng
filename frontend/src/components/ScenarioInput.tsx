import { useState } from "react";
import { api } from "../api";
import { naira, parseInput } from "../money";
import type { FtzPosition } from "../types";
import { ErrorBox } from "./Drawer";
import { BAND_TONE } from "./FtzScale";

export function ScenarioInput({ onResult }: { onResult: (r: FtzPosition | null) => void }) {
  const [val, setVal] = useState("25,000,000.00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<FtzPosition | null>(null);

  async function run() {
    const m = parseInput(val);
    if (m === null) {
      setErr("Enter a naira amount like 25,000,000.00");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await api.ftzScenario(m);
      setRes(r.scenario);
      onResult(r.scenario);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-6" aria-label="Scenario">
      <h2 className="panel-head">Scenario: what if we sell more into the customs territory?</h2>
      <p className="mt-1 text-sm text-zinc-500">Adds the amount to both domestic and total sales and recomputes the share, band and headroom.</p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="flex-1 sm:max-w-md">
          <label htmlFor="scn" className="label">
            Additional domestic sales
          </label>
          <div className="mt-1 flex h-10 items-center rounded border border-zinc-700 bg-zinc-900 px-3 focus-within:border-action-600 focus-within:ring-2 focus-within:ring-action-100">
            <span className="text-zinc-500">₦</span>
            <input id="scn" value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" className="tnum w-full bg-transparent px-1.5 text-base outline-none" />
          </div>
        </div>
        <button disabled={busy} className="btn btn-primary">
          {busy ? "Computing…" : "Run scenario"}
        </button>
        {res && (
          <button
            type="button"
            onClick={() => {
              setRes(null);
              onResult(null);
            }}
            className="btn btn-secondary"
          >
            Clear
          </button>
        )}
      </form>
      {err && (
        <div className="mt-2">
          <ErrorBox error={err} />
        </div>
      )}
      {res && (
        <dl className="tnum mt-5 grid grid-cols-2 gap-x-6 gap-y-4 rounded bg-zinc-950 px-5 py-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="label">New domestic share</dt>
            <dd className="mt-0.5 text-xl font-bold text-zinc-100">{res.share_pct_4dp}</dd>
          </div>
          <div>
            <dt className="label">Band</dt>
            <dd className="mt-1">
              <span className={`badge font-bold uppercase ${(BAND_TONE[res.band] ?? BAND_TONE.CRITICAL).badge}`}>{res.band}</span>
            </dd>
          </div>
          <div>
            <dt className="label">Remaining headroom</dt>
            <dd className="mt-0.5 text-xl font-bold text-zinc-100">{naira(res.headroom)}</dd>
          </div>
          <div>
            <dt className="label">Domestic / total</dt>
            <dd className="mt-0.5 text-base font-semibold text-zinc-100">
              {naira(res.domestic, { compact: true })} / {naira(res.total, { compact: true })}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
