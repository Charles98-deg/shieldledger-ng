import { useEffect, useState } from "react";
import { api } from "./api";
import { Footer } from "./components/Footer";
import { PolicyPanel } from "./components/PolicyPanel";
import { RegisterDrawer } from "./components/RegisterDrawer";
import { ExposureSummary } from "./screens/ExposureSummary";
import { FtzMonitor } from "./screens/FtzMonitor";
import { PaymentRun } from "./screens/PaymentRun";
import type { Health } from "./types";

const TABS = [
  { id: "run", label: "Payment Run" },
  { id: "summary", label: "Exposure Summary" },
  { id: "ftz", label: "FTZ Monitor" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function tabFromHash(): Tab {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (TABS.find((t) => t.id === h)?.id ?? "run") as Tab;
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [refreshKey, setRefreshKey] = useState(0);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState(false);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealthErr(true));
  }, []);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-zinc-800 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div aria-hidden className="grid h-8 w-8 place-items-center rounded bg-emerald-600 font-black text-white">
            S
          </div>
          <div>
            <div className="font-bold leading-tight">ShieldLedger NG</div>
            <div className="text-[11px] text-zinc-400">Pre-payment AP tax &amp; leakage guard · Nigeria 2026 rules · read-only</div>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Screens">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#/${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-sm ${tab === t.id ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-300 hover:bg-zinc-800"}`}
            >
              {t.label}
            </a>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-zinc-700 md:inline-block" />
          <button onClick={() => setRegisterOpen(true)} className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            Statutory Register
          </button>
          <button onClick={() => setPoliciesOpen(true)} className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            Policies
          </button>
        </nav>
      </header>

      {healthErr && <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200">Backend unreachable. Start it with <code>make dev</code>.</div>}
      {health && (
        <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-zinc-500">
          <span>rules pack {health.rules_pack}</span>
          <span>
            extraction:{" "}
            {health.extraction.gemini_available ? `Gemini (${health.extraction.gemini_model} → ${health.extraction.gemini_fallback_models.join(" → ")}) → offline parser` : "offline parser (no Gemini key)"}
          </span>
          <span>LLM transcribes · Python decides</span>
        </div>
      )}

      <main className="py-5">
        {tab === "run" && <PaymentRun refreshKey={refreshKey} onChanged={bump} devMode={health?.app_env === "dev"} />}
        {tab === "summary" && <ExposureSummary refreshKey={refreshKey} />}
        {tab === "ftz" && <FtzMonitor refreshKey={refreshKey} onChanged={bump} />}
      </main>

      <Footer />
      <PolicyPanel open={policiesOpen} onClose={() => setPoliciesOpen(false)} onChanged={bump} />
      <RegisterDrawer open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}
