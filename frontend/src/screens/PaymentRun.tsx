import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { DecisionTable, DyeLegend } from "../components/DecisionTable";
import { ErrorBox, Loading } from "../components/Drawer";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { UploadZone } from "../components/UploadZone";
import { BUCKETS, bucketAmount, bucketOf, exceptionsFirst, type Bucket } from "../decisionText";
import { naira } from "../money";
import type { Decision } from "../types";

const TONE: Record<Bucket, string> = {
  PAY_NOW: "text-emerald-300",
  PAY_PART: "text-amber-300",
  HOLD: "text-orange-300",
  DO_NOT_PAY: "text-red-300",
  NEEDS_PERSON: "text-zinc-300",
};

/** "Which invoices can I pay, and how much?" One button per decision bucket; each filters the table. */
function SummaryStrip({ invoices, filter, onFilter }: { invoices: Decision[]; filter: Bucket | null; onFilter: (b: Bucket | null) => void }) {
  return (
    <div role="group" aria-label="Filter by decision" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {BUCKETS.map((b) => {
        const rows = invoices.filter((d) => bucketOf(d) === b.id);
        const amt = bucketAmount(rows, b.id);
        const on = filter === b.id;
        return (
          <button
            key={b.id}
            aria-pressed={on}
            disabled={rows.length === 0}
            onClick={() => onFilter(on ? null : b.id)}
            className="row-select rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left hover:border-zinc-600 disabled:cursor-default disabled:opacity-55 aria-pressed:border-adire-800 aria-pressed:bg-adire-100 aria-pressed:shadow-[inset_0_0_0_1px_#1d2d6b]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-base font-bold ${TONE[b.id]}`}>{b.label}</span>
              <span className="tnum text-2xl font-bold leading-none text-zinc-100">{rows.length}</span>
            </div>
            <div className="tnum mt-2 text-lg font-semibold leading-tight text-zinc-100">{naira(amt.value)}</div>
            <div className="text-xs text-zinc-400">{amt.caption}</div>
          </button>
        );
      })}
    </div>
  );
}

export function PaymentRun({ refreshKey, onChanged, devMode }: { refreshKey: number; onChanged: () => void; devMode: boolean }) {
  const [rows, setRows] = useState<Decision[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Decision | null>(null);
  const [filter, setFilter] = useState<Bucket | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api
      .decisions()
      .then(setRows)
      .catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(load, [load, refreshKey]);

  const invoices = exceptionsFirst(rows?.filter((r) => r.kind === "INVOICE") ?? []);
  const patterns = exceptionsFirst(rows?.filter((r) => r.kind !== "INVOICE") ?? []);
  const shown = filter ? invoices.filter((d) => bucketOf(d) === filter) : invoices;
  const sel = open ? `${open.kind}-${open.subject_id}` : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Payment run</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-zinc-400">
          Pre-payment check of a vendor invoice batch: 3-way match, duplicates, registry, VAT &amp; WHT. Every number links to its evidence. Recommendation only — nothing is paid.
        </p>
      </div>
      <UploadZone
        devMode={devMode}
        onDone={() => {
          load();
          onChanged();
        }}
      />
      {err && <ErrorBox error={err} onRetry={load} />}
      {!rows && !err && <Loading />}
      {rows && rows.length === 0 && (
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-400">
          No invoices yet. Drop PDFs above{devMode ? " or click “Load demo pack”" : ""}.
        </div>
      )}
      {rows && rows.length > 0 && (
        <>
          <SummaryStrip invoices={invoices} filter={filter} onFilter={setFilter} />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-zinc-400">
            <span>
              {filter ? (
                <>
                  Showing <strong className="text-zinc-100">{shown.length}</strong> of {invoices.length} invoices ·{" "}
                  <button onClick={() => setFilter(null)} className="font-semibold text-adire-700 underline hover:text-adire-900">
                    Show all
                  </button>
                </>
              ) : (
                <>
                  <strong className="text-zinc-100">{invoices.length} invoices</strong>, exceptions first. Click a row for the evidence trail.
                </>
              )}
            </span>
            <DyeLegend />
          </div>
          <DecisionTable rows={shown} onOpen={setOpen} selected={sel} />
          {patterns.length > 0 && (
            <div className="space-y-2">
              <h2 className="pt-4 text-lg font-bold">PO &amp; vendor-master patterns</h2>
              <p className="text-xs text-zinc-500">Split-PO clusters and vendor/payroll collisions found in master data (not invoice amounts; excluded from totals).</p>
              <DecisionTable rows={patterns} onOpen={setOpen} selected={sel} />
            </div>
          )}
        </>
      )}
      <EvidenceDrawer decision={open} onClose={() => setOpen(null)} />
    </div>
  );
}
