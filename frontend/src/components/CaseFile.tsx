import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { plainCase, plainFlag, rankedFlags } from "../copy/plain";
import { STATUS_LABEL, actionLine } from "../decisionText";
import { Working } from "./RunList";
import { isZero, naira, shareOf, toKobo } from "../money";
import type { Decision, EvidenceStep } from "../types";
import { ErrorBox, Loading } from "./Drawer";
import { EngineBadge } from "./EngineBadge";
import { CloseIcon, StatusIcon } from "./Icons";
import { FlagChip, STATUS_TONE } from "./StatusChip";
import { StatusLabel } from "./StatusLabel";

/** The invoice's gross as one bar: navy = net payable, light navy = WHT, orange = held. */
function SplitBar({ d }: { d: Decision }) {
  if (toKobo(d.gross) === 0n) return null;
  return (
    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {d.excluded_from_totals ? (
        <div className="dye-held-review h-full w-full" />
      ) : (
        <>
          {toKobo(d.net_safe_payable) > 0n && <div className="dye-net h-full" style={{ width: `${shareOf(d.net_safe_payable, d.gross)}%` }} />}
          {toKobo(d.wht_to_remit) > 0n && <div className="dye-wht h-full min-w-[3px]" style={{ width: `${shareOf(d.wht_to_remit, d.gross)}%` }} />}
          {toKobo(d.blocked_or_hold) > 0n && <div className="dye-held h-full min-w-[3px]" style={{ width: `${shareOf(d.blocked_or_hold, d.gross)}%` }} />}
        </>
      )}
    </div>
  );
}

function TapeRow({ op, label, value, strong, sub, swatch }: { op?: string; label: string; value: string; strong?: boolean; sub?: boolean; swatch?: string }) {
  return (
    <div className={`grid grid-cols-[1rem_minmax(0,1fr)_auto] items-baseline gap-x-2 ${sub ? "py-0.5 text-sm text-zinc-500" : "py-1.5"} ${strong ? "font-bold text-zinc-100" : "text-zinc-300"}`}>
      <span aria-hidden className="text-center text-zinc-500">{op}</span>
      <span className={`flex min-w-0 items-center gap-2 ${sub ? "pl-5" : ""}`}>
        {swatch && <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${swatch}`} />}
        {op === "−" && <span className="sr-only">minus </span>}
        {op === "=" && <span className="sr-only">equals </span>}
        {label}
      </span>
      <span className={`whitespace-nowrap text-right ${strong ? "text-2xl tracking-[-0.01em]" : sub ? "" : "font-semibold text-zinc-100"}`}>{value}</span>
    </div>
  );
}

/** Settlement tape: Gross − WHT − Held = Net safe payable, as the engine computed it (kobo-exact strings). */
function SettlementTape({ d }: { d: Decision }) {
  return (
    <section aria-labelledby="cf-tape" className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="cf-tape" className="panel-head">
          Settlement
        </h3>
        {d.excluded_from_totals && <span className="text-sm font-semibold text-amber-300">Excluded from every total</span>}
      </div>
      <div className="tape mt-2">
        <TapeRow label="Gross (as invoiced)" value={naira(d.gross)} />
        <TapeRow op="−" label="WHT to remit" value={naira(d.wht_to_remit)} swatch="dye-wht" />
        <TapeRow op="−" label="Held or blocked" value={naira(d.blocked_or_hold)} swatch="dye-held" />
        <TapeRow sub label="Overpayment blocked" value={naira(d.overpayment_blocked)} />
        <TapeRow sub label="Pending verification" value={naira(d.pending_verification)} />
        <div className="my-1.5 border-t border-zinc-600" />
        <TapeRow op="=" label="Net safe payable" value={naira(d.net_safe_payable)} strong swatch="dye-net" />
        <div className="mt-3">
          <SplitBar d={d} />
        </div>
      </div>
      {d.remittance_due && !isZero(d.wht_to_remit) && (
        <p className="tnum mt-4 rounded bg-adire-50 px-3 py-2 text-sm font-semibold text-zinc-100">
          Remit WHT {naira(d.wht_to_remit)} by {d.remittance_due} <span className="font-normal text-zinc-500">(NTAA s.107(1))</span>
        </p>
      )}
      <dl className="tnum mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm text-zinc-500">
        <dt>Approved gross</dt>
        <dd className="text-right text-zinc-300">{naira(d.approved_gross)}</dd>
        <dt>Input VAT identified (offset, not cash)</dt>
        <dd className="text-right text-zinc-300">{naira(d.recoverable_input_vat)}</dd>
        {d.advisory_self_account !== "0.00" && (
          <>
            <dt>Advisory: VAT self-account (not counted)</dt>
            <dd className="text-right text-zinc-300">{naira(d.advisory_self_account)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function Step({ s, i }: { s: EvidenceStep; i: number }) {
  return (
    <li className="border-t border-zinc-800 py-3.5 first:border-t-0 first:pt-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tnum w-5 text-xs text-zinc-500">{i + 1}.</span>
        <span className="font-mono text-sm font-semibold text-zinc-100">
          {s.rule_id}
          <span className="font-normal text-zinc-500"> v{s.rule_version}</span>
        </span>
        <StatusLabel status={s.status} />
      </div>
      <div className="mt-0.5 pl-7 text-sm text-zinc-500">
        {s.cite}
        {s.field && <span className="code"> · field: {s.field}</span>}
      </div>
      {s.raw_snippet && (
        <blockquote className="ml-7 mt-2 rounded bg-adire-50 px-3 py-2 text-sm text-zinc-200">
          <span className="block text-xs font-semibold text-adire-600">From document</span>
          <span className="font-mono">“{s.raw_snippet}”</span>
        </blockquote>
      )}
      {Object.keys(s.inputs).length > 0 && (
        <dl className="ml-7 mt-2 grid grid-cols-1 gap-x-5 text-sm sm:grid-cols-2">
          {Object.entries(s.inputs).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-zinc-800 py-1">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="tnum text-right text-zinc-200 [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.computation && <p className="tnum ml-7 mt-2 text-sm text-zinc-300">{s.computation}</p>}
      {s.result && <p className="ml-7 mt-1 text-sm font-semibold text-zinc-100">Result: {s.result}</p>}
      {s.policy_applied && <p className="ml-7 mt-1 font-mono text-xs text-sky-300">policy: {s.policy_applied}</p>}
    </li>
  );
}

export function CaseFile({ d, onClose }: { d: Decision | null; onClose: () => void }) {
  const [steps, setSteps] = useState<EvidenceStep[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setSteps(null);
    setErr(null);
    if (!d) return;
    if (d.evidence) return setSteps(d.evidence);
    if (d.invoice_id != null) {
      let live = true;
      api
        .evidence(d.invoice_id)
        .then((r) => live && setSteps(r.evidence))
        .catch((e) => live && setErr((e as Error).message));
      return () => {
        live = false;
      };
    }
  }, [d]);

  if (!d)
    return (
      <div className="panel p-6 text-sm text-zinc-500">
        Select an invoice to see what happened, what to do, and what to pay versus hold.
      </div>
    );

  const isInvoice = d.kind === "INVOICE";
  const ranked = rankedFlags(d);
  return (
    <article key={`${d.kind}-${d.subject_id}`} className="casefile-in panel overflow-hidden" aria-labelledby="cf-title">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-zinc-400">{d.doc_label}</span>
            {d.invoice_number && (
              <span className="text-zinc-500">
                Invoice <span className="font-mono">{d.invoice_number}</span>
              </span>
            )}
          </div>
          <h2 id="cf-title" ref={head} tabIndex={-1} className="mt-1 text-xl font-bold tracking-[-0.01em] text-zinc-100 outline-none [overflow-wrap:anywhere]">
            {d.vendor_name}
          </h2>
        </div>
        <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden" aria-label="Back to the list">
          <CloseIcon />
        </button>
      </header>

      <div className={`px-5 py-4 ${STATUS_TONE[d.status].tint}`}>
        <p className={`inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.06em] ${STATUS_TONE[d.status].text}`}>
          <span className="scale-125">
            <StatusIcon status={d.status} />
          </span>
          {STATUS_LABEL[d.status]}
        </p>
      </div>

      <div className="divide-y divide-zinc-800">
        <section aria-labelledby="cf-what" className="px-5 py-4">
          <h3 id="cf-what" className="panel-head">
            What happened
          </h3>
          {ranked.length === 0 ? (
            <p className="mt-1 text-base text-zinc-200">{plainCase(d).sentence}</p>
          ) : (
            <ul className="mt-1 space-y-1.5 text-base text-zinc-200">
              {ranked.map((f) => (
                <li key={f.code}>{plainFlag(d, f).sentence}</li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="cf-do" className="px-5 py-4">
          <h3 id="cf-do" className="panel-head">
            What to do
          </h3>
          <p className={`mt-1 text-xl font-bold ${STATUS_TONE[d.status].text}`}>{plainCase(d).action}</p>
          <p className="tnum mt-0.5 text-base text-zinc-300">{actionLine(d)}</p>
          {isInvoice && (
            <dl className="tnum mt-4 grid grid-cols-2 gap-3">
              {d.excluded_from_totals ? (
                <div className="col-span-2 rounded bg-zinc-950 px-4 py-3">
                  <dt className="label">Not counted until checked</dt>
                  <dd className="mt-0.5 text-2xl font-bold text-zinc-400 line-through decoration-zinc-500">{naira(d.gross)}</dd>
                </div>
              ) : (
                <>
                  <div className="rounded bg-emerald-50 px-4 py-3">
                    <dt className="text-xs font-semibold text-emerald-300">Pay</dt>
                    <dd className="mt-0.5 text-2xl font-bold text-zinc-100">{naira(d.net_safe_payable)}</dd>
                  </div>
                  <div className={`rounded px-4 py-3 ${isZero(d.blocked_or_hold) ? "bg-zinc-950" : "bg-orange-50"}`}>
                    <dt className={`text-xs font-semibold ${isZero(d.blocked_or_hold) ? "text-zinc-500" : "text-orange-300"}`}>Hold</dt>
                    <dd className="mt-0.5 text-2xl font-bold text-zinc-100">{naira(d.blocked_or_hold)}</dd>
                  </div>
                </>
              )}
            </dl>
          )}
          {d.remittance_due && !isZero(d.wht_to_remit) && (
            <p className="tnum mt-3 text-sm text-zinc-500">
              Also withhold WHT {naira(d.wht_to_remit)} and remit it by {d.remittance_due}.
            </p>
          )}
        </section>

        <div className="px-5 py-4">
          <Working>
            <div className="-mx-5 divide-y divide-zinc-800 border-t border-zinc-800">
              <p className="flex flex-wrap items-center gap-2 px-5 pt-4 text-sm text-zinc-500">
                Read by {isInvoice ? <EngineBadge engine={d.engine} /> : <span>{d.kind === "PO_PATTERN" ? "PO pattern · master data" : "vendor pattern · master data"}</span>}
              </p>
        {isInvoice && <SettlementTape d={d} />}

        <section aria-labelledby="cf-why" className="px-5 py-4">
          <h3 id="cf-why" className="panel-head">
            Flags
          </h3>
          {d.flags.length === 0 && <p className="mt-1 text-sm text-zinc-500">No exceptions raised. Every check is in the evidence below.</p>}
          {d.flags.length > 0 && (
            <ul className="mt-2 space-y-2.5">
              {d.flags.map((f) => (
                <li key={f.code} className="text-sm text-zinc-300">
                  <span className="block">{f.detail}</span>
                  <span className="mt-1 inline-block">
                    <FlagChip code={f.code} quiet />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.vendor_candidate_id && (
            <p className="mt-3 rounded bg-sky-50 px-3 py-2 text-sm text-sky-300">
              Vendor-master candidate {d.vendor_candidate_id} (similarity 85–91): shown for review, not auto-merged.
            </p>
          )}
          {d.contingent_exposures.length > 0 && (
            <div className="mt-4">
              <h4 className="label">Contingent exposure avoided</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {d.contingent_exposures.map((e) => (
                  <li key={e.rule_id} className="flex justify-between gap-3">
                    <span className="text-zinc-300">{e.label}</span>
                    <span className="tnum font-semibold text-zinc-100">{naira(e.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="cf-ev" className="px-5 py-4">
          <h3 id="cf-ev" className="panel-head">
            Evidence <span className="text-sm font-normal text-zinc-500">· {steps?.length ?? d.evidence_count} steps</span>
          </h3>
          <p className="text-sm text-zinc-500">In evaluation order, each with its rule, citation and honesty label.</p>
          {err && <ErrorBox error={err} />}
          {!err && !steps && <Loading label="Loading evidence…" />}
          {steps && (
            <ol className="mt-2">
              {steps.map((s, i) => (
                <Step key={i} s={s} i={i} />
              ))}
            </ol>
          )}
        </section>
            </div>
          </Working>
        </div>
      </div>
    </article>
  );
}

export function focusCaseFile() {
  document.getElementById("cf-title")?.focus();
}
