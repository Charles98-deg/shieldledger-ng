import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { CaseFile, focusCaseFile } from "../components/CaseFile";
import { ErrorBox, Loading } from "../components/Drawer";
import { Answer, CaseList, keyOf } from "../components/RunList";
import { UploadZone } from "../components/UploadZone";
import { exceptionsFirst } from "../decisionText";
import type { Decision, Summary } from "../types";

const DESKTOP = "(min-width: 1024px)";
const isDesktop = () => typeof window !== "undefined" && window.matchMedia(DESKTOP).matches;

function Step({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`step-${n}`} className="flex items-baseline gap-2.5 text-lg font-bold text-zinc-100">
          <span aria-hidden className="tnum grid h-6 w-6 translate-y-[-1px] place-items-center self-center rounded-full bg-adire-800 text-xs font-bold text-white">
            {n}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Payment Run in three steps for the AP clerk: drop invoices, read the answer, fix what needs you.
 * Everything for a finance lead or auditor stays one "Show working" click away.
 */
export function PaymentRun({ refreshKey, onChanged, devMode }: { refreshKey: number; onChanged: () => void; devMode: boolean }) {
  const [rows, setRows] = useState<Decision[] | null>(null);
  const [totals, setTotals] = useState<Summary["conservation"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Below 1024px the case file opens full-screen over the list.
  const [mobileOpen, setMobileOpen] = useState(false);

  const load = useCallback(() => {
    setErr(null);
    api
      .decisions()
      .then(setRows)
      .catch((e) => setErr((e as Error).message));
    api
      .summary()
      .then((s) => setTotals(s.invoice_count > 0 ? s.conservation : null))
      .catch(() => setTotals(null));
  }, []);
  useEffect(load, [load, refreshKey]);

  const invoices = exceptionsFirst(rows?.filter((r) => r.kind === "INVOICE") ?? []);
  const exceptions = invoices.filter((d) => d.status !== "RELEASE");
  const ready = invoices.filter((d) => d.status === "RELEASE");
  const patterns = exceptionsFirst(rows?.filter((r) => r.kind !== "INVOICE") ?? []);
  const all = [...invoices, ...patterns];
  const current = all.find((d) => keyOf(d) === selected) ?? null;
  const hasRun = invoices.length > 0;

  // Desktop always has a case open: the first exception.
  useEffect(() => {
    if (!isDesktop() || !rows) return;
    const first = exceptions[0] ?? patterns[0] ?? ready[0];
    if (!all.some((d) => keyOf(d) === selected)) setSelected(first ? keyOf(first) : null);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const select = (d: Decision) => {
    setSelected(keyOf(d));
    if (!isDesktop()) {
      setMobileOpen(true);
      requestAnimationFrame(focusCaseFile);
    }
  };

  const upload = (
    <UploadZone
      devMode={devMode}
      onDone={({ seconds }) => {
        setCheckedIn(seconds);
        setUploadOpen(false);
        load();
        onChanged();
      }}
    />
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-zinc-100">Payment run</h1>
        <p className="mt-1 max-w-[68ch] text-sm text-zinc-500">What can I safely pay today, and what do I need to fix? Recommendation only: nothing is paid from here.</p>
      </div>

      <Step n={1} title="Drop invoices">
        {hasRun && !uploadOpen ? (
          <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <p className="inline-flex items-center gap-2 text-base text-zinc-200">
              <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <path d="M3 8.5l3 3 7-7" />
              </svg>
              <span className="tnum">
                <strong>{invoices.length}</strong> invoices checked{checkedIn ? ` in ${checkedIn} s` : ""}
              </span>
            </p>
            <button onClick={() => setUploadOpen(true)} className="text-sm font-semibold text-action-600 underline hover:text-action-800">
              Add or reload invoices
            </button>
          </div>
        ) : (
          upload
        )}
      </Step>

      {err && <ErrorBox error={err} onRetry={load} />}
      {!rows && !err && <Loading />}

      {rows && hasRun && totals && (
        <Step n={2} title="The answer">
          <div className="panel px-6 py-5">
            <Answer invoices={invoices} totals={totals} />
          </div>
        </Step>
      )}

      {rows && rows.length > 0 && (
        <Step n={3} title="What needs you" aside={<span className="text-sm text-zinc-500">Exceptions first. Select one to see what to do.</span>}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-start">
            <div className="space-y-4">
              {exceptions.length > 0 ? (
                <CaseList rows={exceptions} selected={selected} onSelect={select} label="Invoices that need you" />
              ) : (
                <p className="panel px-5 py-4 text-sm text-zinc-500">Nothing needs you in this run.</p>
              )}

              {patterns.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h3 className="px-1 text-base font-bold text-zinc-100">
                    Check these vendors before paying <span className="text-sm font-normal text-zinc-500">· from PO and vendor master data, not in totals</span>
                  </h3>
                  <CaseList rows={patterns} selected={selected} onSelect={select} label="Vendor and PO checks" />
                </div>
              )}

              {ready.length > 0 && (
                <details className="group panel overflow-hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-zinc-950 [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2 text-base font-bold text-zinc-100">
                      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                        <path d="M3 8.5l3 3 7-7" />
                      </svg>
                      <span className="tnum">{ready.length}</span> invoices ready to pay
                    </span>
                    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 transition-transform duration-150 group-open:rotate-90">
                      <path d="M6 3.5 10.5 8 6 12.5" />
                    </svg>
                  </summary>
                  <div className="border-t border-zinc-800 [&>ul]:rounded-none [&>ul]:border-0">
                    <CaseList rows={ready} selected={selected} onSelect={select} label="Invoices ready to pay" />
                  </div>
                </details>
              )}
            </div>

            <div
              className={`${mobileOpen ? "fixed inset-0 z-40 block overflow-y-auto bg-zinc-950 p-3" : "hidden"} lg:sticky lg:top-4 lg:z-auto lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:rounded-lg lg:bg-transparent lg:p-0`}
              role={mobileOpen ? "dialog" : undefined}
              aria-modal={mobileOpen || undefined}
              aria-label="Case file"
            >
              <CaseFile d={current} onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        </Step>
      )}

      {rows && rows.length === 0 && <p className="panel px-6 py-10 text-center text-sm text-zinc-500">No invoices in this run yet. Drop PDFs into step 1{devMode ? " or load the demo pack" : ""}.</p>}
    </div>
  );
}
