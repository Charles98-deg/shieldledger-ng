import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { CaseFile, focusCaseFile } from "../components/CaseFile";
import { ErrorBox, Loading } from "../components/Drawer";
import { BatchPanel, CaseList, keyOf } from "../components/RunList";
import { UploadZone } from "../components/UploadZone";
import { bucketOf, exceptionsFirst, type Bucket } from "../decisionText";
import type { Decision, Summary } from "../types";

const DESKTOP = "(min-width: 1024px)";
const isDesktop = () => typeof window !== "undefined" && window.matchMedia(DESKTOP).matches;

export function PaymentRun({ refreshKey, onChanged, devMode }: { refreshKey: number; onChanged: () => void; devMode: boolean }) {
  const [rows, setRows] = useState<Decision[] | null>(null);
  const [totals, setTotals] = useState<Summary["conservation"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bucket | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
  const patterns = exceptionsFirst(rows?.filter((r) => r.kind !== "INVOICE") ?? []);
  const shown = filter ? invoices.filter((d) => bucketOf(d) === filter) : invoices;
  const all = [...invoices, ...patterns];
  const current = all.find((d) => keyOf(d) === selected) ?? null;

  // Desktop always has a case open: the first case in view.
  useEffect(() => {
    if (!isDesktop() || !rows) return;
    const visible = [...shown, ...(filter ? [] : patterns)];
    if (!visible.some((d) => keyOf(d) === selected)) setSelected(visible[0] ? keyOf(visible[0]) : null);
  }, [rows, filter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-zinc-100">Payment run</h1>
          <p className="mt-1 max-w-[68ch] text-sm text-zinc-400">
            Which invoices can be paid, and how much. Exceptions come first; every figure traces to its rule and the document. Recommendation only: nothing is paid from here.
          </p>
        </div>
        <div className="xl:w-[46rem] xl:shrink-0">
          <UploadZone
            devMode={devMode}
            compact
            onDone={() => {
              load();
              onChanged();
            }}
          />
        </div>
      </div>

      {err && <ErrorBox error={err} onRetry={load} />}
      {!rows && !err && <Loading />}
      {rows && rows.length === 0 && (
        <div className="panel px-6 py-12 text-center text-sm text-zinc-400">
          No invoices in this run yet. Drop PDFs into the upload box{devMode ? " or load the demo pack" : ""}.
        </div>
      )}
      {rows && rows.length > 0 && (
        <>
          <BatchPanel invoices={invoices} totals={totals} filter={filter} onFilter={setFilter} />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-start">
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 text-sm text-zinc-500">
                <h2 className="panel-head">
                  {filter ? `Showing ${shown.length} of ${invoices.length} invoices` : `${invoices.length} invoices, exceptions first`}
                </h2>
                {filter ? (
                  <button onClick={() => setFilter(null)} className="font-semibold text-action-600 underline hover:text-action-800">
                    Show all
                  </button>
                ) : (
                  <span>Select a case to open it.</span>
                )}
              </div>
              <CaseList rows={shown} selected={selected} onSelect={select} label="Invoices" />
              {patterns.length > 0 && !filter && (
                <div className="space-y-3 pt-5">
                  <div className="px-1">
                    <h2 className="panel-head">PO &amp; vendor-master patterns</h2>
                    <p className="mt-0.5 text-sm text-zinc-500">Split purchases and vendor/payroll collisions found in master data. Not invoice amounts; excluded from totals.</p>
                  </div>
                  <CaseList rows={patterns} selected={selected} onSelect={select} label="Master-data patterns" />
                </div>
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
        </>
      )}
    </div>
  );
}
