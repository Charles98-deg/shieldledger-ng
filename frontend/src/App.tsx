import { useEffect, useState } from "react";
import { api } from "./api";
import { AuditDrawer } from "./components/AuditDrawer";
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
      <rect width="34" height="34" rx="7" fill="#ffffff" />
      <rect x="6" y="6" width="22" height="8" rx="1" fill="#172b55" />
      <rect x="6" y="17" width="13" height="11" rx="1" fill="#172b55" />
      <rect x="21.75" y="17.75" width="5.5" height="9.5" rx="1" fill="none" stroke="#2459c4" strokeWidth="1.5" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [refreshKey, setRefreshKey] = useState(0);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
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
          <div className="flex items-center gap-3 pb-1 lg:pb-3.5">
            <Mark />
            <div>
              <div className="text-lg font-bold leading-tight tracking-[-0.01em]">ShieldLedger NG</div>
              <div className="text-xs text-adire-300 lg:hidden">Pre-payment AP tax &amp; leakage guard · Nigeria 2026 rules · read-only</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-end gap-x-1 gap-y-2 lg:flex-nowrap" aria-label="Screens">
            <a
              href="#/run"
              aria-current={tab === "run" ? "page" : undefined}
              className={`whitespace-nowrap rounded-t-lg px-4 py-3 text-sm font-semibold transition-colors duration-150 ${
                tab === "run" ? "bg-zinc-950 text-zinc-100" : "text-adire-100 hover:bg-adire-800 hover:text-white"
              }`}
            >
              Payment Run
            </a>
            <div role="group" aria-labelledby="fin-group" className="flex flex-wrap items-end gap-x-0.5 lg:ml-4 lg:flex-nowrap lg:border-l lg:border-adire-700 lg:pl-4">
              <span id="fin-group" className="mb-3 mr-2 whitespace-nowrap text-xs font-semibold text-adire-300">
                For finance &amp; tax
              </span>
              {TABS.filter((t) => t.id !== "run").map((t) => (
                <a
                  key={t.id}
                  href={`#/${t.id}`}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`whitespace-nowrap rounded-t-lg px-3 py-2.5 text-xs font-semibold transition-colors duration-150 ${
                    tab === t.id ? "bg-zinc-950 text-zinc-100" : "text-adire-200 hover:bg-adire-800 hover:text-white"
                  }`}
                >
                  {t.label}
                </a>
              ))}
              {(
                [
                  ["Statutory Register", () => setRegisterOpen(true)],
                  ["Policies", () => setPoliciesOpen(true)],
                  ["Audit", () => setAuditOpen(true)],
                ] as const
              ).map(([label, open]) => (
                <button
                  key={label}
                  onClick={open}
                  className="mb-1 whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold text-adire-200 transition-colors duration-150 hover:bg-adire-800 hover:text-white"
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {healthErr && <div className="mt-4 rounded border border-red-400/40 bg-red-50 px-3 py-2 text-sm text-red-300">Backend unreachable. Start it with <code>make dev</code>.</div>}
      {health && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-xs text-zinc-500">
          <span>
            Rules pack <span className="font-mono font-semibold text-zinc-300">{health.rules_pack}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${health.extraction.gemini_state === "active" ? "bg-emerald-500" : health.extraction.gemini_state === "failing" ? "bg-orange-400" : "bg-zinc-600"}`} />
            {geminiLabel(health)}
          </span>
          <span>LLM transcribes · Python decides</span>
        </div>
      )}

      <main className="pb-6 pt-2">
        {tab === "run" && <PaymentRun refreshKey={refreshKey} onChanged={bump} devMode={health?.app_env === "dev"} />}
        {tab === "summary" && <ExposureSummary refreshKey={refreshKey} />}
        {tab === "ftz" && <FtzMonitor refreshKey={refreshKey} onChanged={bump} />}
      </main>

      <Footer />
      </div>
      <PolicyPanel open={policiesOpen} onClose={() => setPoliciesOpen(false)} onChanged={bump} />
      <RegisterDrawer open={registerOpen} onClose={() => setRegisterOpen(false)} />
      <AuditDrawer open={auditOpen} onClose={() => setAuditOpen(false)} />
    </div>
  );
}
