import { useState } from "react";
import { api } from "../api";
import { naira, parseInput } from "../money";
import type { FtzPosition } from "../types";
import { ErrorBox } from "./Drawer";

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
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4" aria-label="Scenario">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">What if we sell more into the customs territory?</h2>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor="scn" className="sr-only">
          Additional domestic sales in naira
        </label>
        <div className="flex flex-1 items-center rounded border border-zinc-700 bg-zinc-950 px-2">
          <span className="text-zinc-500">₦</span>
          <input id="scn" value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" className="tnum w-full bg-transparent px-1 py-1.5 font-mono outline-none" />
        </div>
        <button disabled={busy} className="rounded bg-orange-500 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-50">
          {busy ? "Computing…" : "Run scenario"}
        </button>
        {res && (
          <button
            type="button"
            onClick={() => {
              setRes(null);
              onResult(null);
            }}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm"
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
        <dl className="tnum mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500">New domestic share</dt>
            <dd className="font-semibold">{res.share_pct_4dp}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Band</dt>
            <dd className={`font-bold ${res.band === "BREACHED" ? "text-red-400" : "text-orange-300"}`}>{res.band}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Remaining headroom</dt>
            <dd className="font-semibold">{naira(res.headroom)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Domestic / total</dt>
            <dd className="text-xs">
              {naira(res.domestic, { compact: true })} / {naira(res.total, { compact: true })}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
