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

function geminiLabel(h: Health): string {
  const x = h.extraction;
  switch (x.gemini_state) {
    case "active":
      return `Gemini: ${x.gemini_active_model}`;
    case "failing":
      return "Gemini: last call failed, offline parser active";
    case "configured_unused":
      return "Gemini: no successful call yet, offline parser active";
    default:
      return "Gemini: not configured, offline parser active";
  }
}

/** Adire-style mark: a resist-dyed square, the undyed band is the money held back. */
function Mark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="shrink-0">
      <rect width="34" height="34" rx="4" fill="#f3f3ef" />
      <rect x="5" y="5" width="24" height="9" fill="#1d2d6b" />
      <rect x="5" y="17" width="15" height="12" fill="#1d2d6b" />
      <rect x="22.75" y="17.75" width="5.5" height="10.5" fill="none" stroke="#1d2d6b" strokeWidth="1.5" />
    </svg>
  );
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
  }, [refreshKey]);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen">
      <header className="bg-adire-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pt-3 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3 pb-1 lg:pb-3">
            <Mark />
            <div>
              <div className="text-lg font-bold leading-tight tracking-[-0.01em]">ShieldLedger NG</div>
              <div className="text-xs text-adire-200 lg:hidden xl:block">Pre-payment AP tax &amp; leakage guard · Nigeria 2026 rules · read-only</div>
            </div>
          </div>
          <nav className="-mx-1 flex flex-wrap items-end gap-x-1 gap-y-2 lg:flex-nowrap" aria-label="Screens">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#/${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={`whitespace-nowrap rounded-t px-3.5 py-2.5 text-sm font-semibold ${
                  tab === t.id ? "bg-zinc-950 text-adire-900" : "text-adire-100 hover:bg-adire-800 hover:text-white"
                }`}
              >
                {t.label}
              </a>
            ))}
            <span className="mx-2 hidden h-6 w-px self-center bg-adire-700 lg:inline-block" />
            <button onClick={() => setRegisterOpen(true)} className="mb-1.5 whitespace-nowrap rounded border border-adire-600 px-3 py-1.5 text-sm font-semibold text-adire-50 hover:bg-adire-800">
              Statutory Register
            </button>
            <button onClick={() => setPoliciesOpen(true)} className="mb-1.5 whitespace-nowrap rounded border border-adire-600 px-3 py-1.5 text-sm font-semibold text-adire-50 hover:bg-adire-800">
              Policies
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {healthErr && <div className="mt-3 rounded border border-red-400 bg-red-500/10 p-2 text-sm text-red-300">Backend unreachable. Start it with <code>make dev</code>.</div>}
      {health && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-zinc-800 py-2.5 text-xs text-zinc-400">
          <span>
            Rules pack <span className="font-mono font-semibold text-zinc-200">{health.rules_pack}</span>
          </span>
          <span>{geminiLabel(health)}</span>
          <span>LLM transcribes · Python decides</span>
        </div>
      )}

      <main className="py-5">
        {tab === "run" && <PaymentRun refreshKey={refreshKey} onChanged={bump} devMode={health?.app_env === "dev"} />}
        {tab === "summary" && <ExposureSummary refreshKey={refreshKey} />}
        {tab === "ftz" && <FtzMonitor refreshKey={refreshKey} onChanged={bump} />}
      </main>

      <Footer />
      </div>
      <PolicyPanel open={policiesOpen} onClose={() => setPoliciesOpen(false)} onChanged={bump} />
      <RegisterDrawer open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}
