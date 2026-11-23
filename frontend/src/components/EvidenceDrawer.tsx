import { useEffect, useState } from "react";
import { api } from "../api";
import { naira } from "../money";
import type { Decision, EvidenceStep } from "../types";
import { Drawer, ErrorBox, Loading } from "./Drawer";
import { EngineBadge } from "./EngineBadge";
import { FlagChip, StatusChip } from "./StatusChip";
import { StatusLabel } from "./StatusLabel";

function Kv({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-400">{k}</dt>
      <dd className={`tnum ${strong ? "font-semibold" : ""}`}>{v}</dd>
    </div>
  );
}

function Step({ s, i }: { s: EvidenceStep; i: number }) {
  return (
    <li className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-500">#{i + 1}</span>
        <span className="font-mono text-xs font-semibold text-zinc-100">
          {s.rule_id}
          <span className="text-zinc-500"> v{s.rule_version}</span>
        </span>
        <StatusLabel status={s.status} />
        {s.field && <span className="font-mono text-[10px] text-zinc-500">field: {s.field}</span>}
      </div>
      <div className="mt-1 text-xs text-zinc-400">{s.cite}</div>
      {s.raw_snippet && (
        <blockquote className="mt-2 border-l-2 border-indigo-400/60 bg-indigo-500/5 px-2 py-1 font-mono text-xs text-indigo-100">
          <span className="mr-1 text-[10px] uppercase text-indigo-300/80">from document</span>“{s.raw_snippet}”
        </blockquote>
      )}
      {Object.keys(s.inputs).length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
          {Object.entries(s.inputs).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-zinc-800/60 py-0.5">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="tnum text-right text-zinc-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.computation && <p className="tnum mt-2 font-mono text-xs text-zinc-300">{s.computation}</p>}
      {s.result && <p className="mt-1 text-sm font-medium text-zinc-100">→ {s.result}</p>}
      {s.policy_applied && <p className="mt-1 font-mono text-[10px] text-sky-300">policy: {s.policy_applied}</p>}
    </li>
  );
}

export function EvidenceDrawer({ decision, onClose }: { decision: Decision | null; onClose: () => void }) {
  const [steps, setSteps] = useState<EvidenceStep[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSteps(null);
    setErr(null);
    if (!decision) return;
    if (decision.evidence) {
      setSteps(decision.evidence);
      return;
    }
    if (decision.invoice_id != null) {
      api
        .evidence(decision.invoice_id)
        .then((r) => setSteps(r.evidence))
        .catch((e) => setErr((e as Error).message));
    }
  }, [decision]);

  const d = decision;
  return (
    <Drawer
      open={!!d}
      onClose={onClose}
      title={
        d && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-400">{d.doc_label}</span>
              <StatusChip status={d.status} />
              {d.kind === "INVOICE" && <EngineBadge engine={d.engine} />}
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold">{d.vendor_name}</h2>
            {d.invoice_number && <p className="font-mono text-xs text-zinc-500">Invoice {d.invoice_number}</p>}
          </div>
        )
      }
    >
      {d && (
        <div className="space-y-4">
          {d.kind === "INVOICE" && (
            <dl className="space-y-1 rounded border border-zinc-800 p-3 text-sm">
              <Kv k="Gross (as invoiced)" v={naira(d.gross)} />
              <Kv k="Approved gross" v={naira(d.approved_gross)} />
              <Kv k="WHT to remit" v={naira(d.wht_to_remit)} />
              <Kv k="Net safe payable" v={naira(d.net_safe_payable)} strong />
              <Kv k="Blocked / hold" v={naira(d.blocked_or_hold)} />
              <div className="ml-3 space-y-0.5 text-xs">
                <Kv k="of which overpayment blocked" v={naira(d.overpayment_blocked)} />
                <Kv k="of which pending verification" v={naira(d.pending_verification)} />
              </div>
              <Kv k="Input VAT identified (offset, not cash)" v={naira(d.recoverable_input_vat)} />
              {d.advisory_self_account !== "0.00" && <Kv k="Advisory: VAT self-account (not counted)" v={naira(d.advisory_self_account)} />}
              {d.remittance_due && <Kv k="WHT remit by (NTAA s.107(1))" v={d.remittance_due} />}
              {d.excluded_from_totals && <p className="pt-1 text-xs text-amber-200">Needs human review — excluded from every total.</p>}
            </dl>
          )}
          {d.vendor_candidate_id && (
            <p className="rounded border border-sky-500/30 bg-sky-500/5 p-2 text-xs text-sky-200">
              Vendor-master candidate {d.vendor_candidate_id} (similarity 85–91): shown for review, not auto-merged.
            </p>
          )}
          {d.flags.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Flags</h3>
              <ul className="space-y-1">
                {d.flags.map((f) => (
                  <li key={f.code} className="text-sm">
                    <FlagChip code={f.code} /> <span className="text-zinc-300">{f.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.contingent_exposures.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Contingent exposure avoided</h3>
              <ul className="space-y-1 text-sm">
                {d.contingent_exposures.map((e) => (
                  <li key={e.rule_id} className="flex justify-between gap-3">
                    <span className="text-zinc-300">{e.label}</span>
                    <span className="tnum font-medium">{naira(e.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Evidence trail ({steps?.length ?? d.evidence_count} steps, in evaluation order)</h3>
            {err && <ErrorBox error={err} />}
            {!err && !steps && <Loading />}
            {steps && (
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <Step key={i} s={s} i={i} />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
