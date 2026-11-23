import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { DecisionTable } from "../components/DecisionTable";
import { ErrorBox, Loading } from "../components/Drawer";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { UploadZone } from "../components/UploadZone";
import type { Decision, DecisionStatus } from "../types";

const ORDER: DecisionStatus[] = ["RELEASE", "RELEASE_PARTIAL", "HOLD", "BLOCKED", "NEEDS_HUMAN_REVIEW"];

export function PaymentRun({ refreshKey, onChanged, devMode }: { refreshKey: number; onChanged: () => void; devMode: boolean }) {
  const [rows, setRows] = useState<Decision[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Decision | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api
      .decisions()
      .then(setRows)
      .catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(load, [load, refreshKey]);

  const invoices = rows?.filter((r) => r.kind === "INVOICE") ?? [];
  const patterns = rows?.filter((r) => r.kind !== "INVOICE") ?? [];
  const counts = ORDER.map((s) => [s, invoices.filter((r) => r.status === s).length] as const);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Payment run</h1>
        <p className="text-sm text-zinc-400">
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span>{invoices.length} invoices</span>
            {counts
              .filter(([, n]) => n > 0)
              .map(([s, n]) => (
                <span key={s}>
                  {s.replace(/_/g, " ").toLowerCase()}: <span className="font-semibold text-zinc-200">{n}</span>
                </span>
              ))}
            {patterns.length > 0 && <span>{patterns.length} master-data pattern flags</span>}
            <span className="text-zinc-500">Click a row for the evidence trail.</span>
          </div>
          <DecisionTable rows={invoices} onOpen={setOpen} />
          {patterns.length > 0 && (
            <div className="space-y-2">
              <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">PO &amp; vendor-master patterns</h2>
              <p className="text-xs text-zinc-500">Split-PO clusters and vendor/payroll collisions found in master data (not invoice amounts; excluded from totals).</p>
              <DecisionTable rows={patterns} onOpen={setOpen} />
            </div>
          )}
        </>
      )}
      <EvidenceDrawer decision={open} onClose={() => setOpen(null)} />
    </div>
  );
}
