import { useEffect, useState } from "react";
import { api } from "../api";
import { actionLine, reasonLine } from "../decisionText";
import { isZero, naira } from "../money";
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
    <li className="rounded border border-zinc-800 bg-zinc-900 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">#{i + 1}</span>
        <span className="font-mono text-sm font-semibold text-zinc-100">
          {s.rule_id}
          <span className="text-zinc-500"> v{s.rule_version}</span>
        </span>
        <StatusLabel status={s.status} />
        {s.field && <span className="font-mono text-xs text-zinc-500">field: {s.field}</span>}
      </div>
      <div className="mt-1 text-sm text-zinc-400">{s.cite}</div>
      {s.raw_snippet && (
        <blockquote className="mt-2 rounded border border-adire-200 bg-adire-50 px-2.5 py-1.5 font-mono text-sm text-adire-900">
          <span className="mr-2 font-sans text-xs font-semibold uppercase tracking-wide text-adire-600">From document</span>“{s.raw_snippet}”
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
      {s.computation && <p className="tnum mt-2 text-sm text-zinc-300">{s.computation}</p>}
      {s.result && <p className="mt-1 text-sm font-medium text-zinc-100">→ {s.result}</p>}
      {s.policy_applied && <p className="mt-1 font-mono text-xs text-sky-300">policy: {s.policy_applied}</p>}
    </li>
  );
}

export function EvidenceDrawer({ decision, onClose }: { decision: Decision | null; onClose: () => void }) {
  const [steps, setSteps] = useState<EvidenceStep[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Keep the last decision rendered while the drawer slides out.
  const [last, setLast] = useState<Decision | null>(decision);
  useEffect(() => {
    if (!decision) return;
    setLast(decision);
    setSteps(null);
    setErr(null);
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

  const d = decision ?? last;
  return (
    <Drawer
      open={!!decision}
      onClose={onClose}
      title={
        d && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-400">{d.doc_label}</span>
              <StatusChip status={d.status} />
              {d.kind === "INVOICE" && <EngineBadge engine={d.engine} />}
            </div>
            <h2 className="mt-1 truncate text-xl font-bold tracking-[-0.01em]">{d.vendor_name}</h2>
            {d.invoice_number && <p className="font-mono text-xs text-zinc-500">Invoice {d.invoice_number}</p>}
          </div>
        )
      }
    >
      {d && (
        <div className="space-y-6">
          <section aria-labelledby="ev-what">
            <h3 id="ev-what" className="text-xs font-semibold uppercase tracking-wide text-zinc-400">What to do</h3>
            <p className="tnum mt-1 text-xl font-bold tracking-[-0.01em] text-zinc-100">{actionLine(d)}</p>
            {d.kind === "INVOICE" && d.remittance_due && !isZero(d.wht_to_remit) && (
              <p className="tnum mt-0.5 text-sm text-zinc-300">
                Withhold {naira(d.wht_to_remit)} WHT and remit it by {d.remittance_due} (NTAA s.107(1)).
              </p>
            )}
            {d.kind === "INVOICE" && (
              <dl className="mt-3 space-y-1 rounded border border-zinc-800 bg-zinc-900 p-3.5 text-sm">
                <Kv k="Net safe payable" v={naira(d.net_safe_payable)} strong />
                <Kv k="WHT to remit" v={naira(d.wht_to_remit)} />
                <Kv k="Blocked / hold" v={naira(d.blocked_or_hold)} />
                <div className="ml-3 space-y-0.5 text-sm">
                  <Kv k="of which overpayment blocked" v={naira(d.overpayment_blocked)} />
                  <Kv k="of which pending verification" v={naira(d.pending_verification)} />
                </div>
                <div className="border-t border-zinc-800 pt-1">
                  <Kv k="Gross (as invoiced)" v={naira(d.gross)} />
                  <Kv k="Approved gross" v={naira(d.approved_gross)} />
                  <Kv k="Input VAT identified (offset, not cash)" v={naira(d.recoverable_input_vat)} />
                  {d.advisory_self_account !== "0.00" && <Kv k="Advisory: VAT self-account (not counted)" v={naira(d.advisory_self_account)} />}
                  {d.remittance_due && <Kv k="WHT remit by (NTAA s.107(1))" v={d.remittance_due} />}
                </div>
                {d.excluded_from_totals && <p className="pt-1 text-sm font-semibold text-amber-300">Needs a person: excluded from every total.</p>}
              </dl>
            )}
          </section>

          <section aria-labelledby="ev-why">
            <h3 id="ev-why" className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Why</h3>
            <p className="mt-1 text-base text-zinc-100">{reasonLine(d)}</p>
            {d.flags.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {d.flags.map((f) => (
                  <li key={f.code} className="text-sm">
                    <FlagChip code={f.code} /> <span className="text-zinc-300">{f.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {d.vendor_candidate_id && (
              <p className="mt-2 rounded border border-sky-400/50 bg-[#e6f0f7] p-2 text-sm text-sky-300">
                Vendor-master candidate {d.vendor_candidate_id} (similarity 85–91): shown for review, not auto-merged.
              </p>
            )}
            {d.contingent_exposures.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold text-zinc-200">Contingent exposure avoided</h4>
                <ul className="mt-1 space-y-1 text-sm">
                  {d.contingent_exposures.map((e) => (
                    <li key={e.rule_id} className="flex justify-between gap-3">
                      <span className="text-zinc-300">{e.label}</span>
                      <span className="tnum font-medium">{naira(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section aria-labelledby="ev-trail">
            <h3 id="ev-trail" className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Evidence ({steps?.length ?? d.evidence_count} steps, in evaluation order)
            </h3>
            {err && <ErrorBox error={err} />}
            {!err && !steps && <Loading />}
            {steps && (
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <Step key={i} s={s} i={i} />
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
