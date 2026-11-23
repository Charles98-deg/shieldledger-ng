import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { STATUS_LABEL, actionLine, reasonLine } from "../decisionText";
import { isZero, naira, shareOf, toKobo } from "../money";
import type { Decision, DecisionStatus, EvidenceStep } from "../types";
import { ErrorBox, Loading } from "./Drawer";
import { EngineBadge } from "./EngineBadge";
import { CloseIcon, StatusIcon } from "./Icons";
import { FlagChip } from "./StatusChip";
import { StatusLabel } from "./StatusLabel";

const STAMP: Record<DecisionStatus, string> = {
  RELEASE: "border-emerald-500 text-emerald-300",
  RELEASE_PARTIAL: "border-amber-400 text-amber-300",
  HOLD: "border-orange-400 text-orange-300",
  BLOCKED: "border-red-400 text-red-300",
  NEEDS_HUMAN_REVIEW: "border-zinc-500 text-zinc-200",
};

/** Decision stamp: the verdict, set like a pay-desk stamp, with its one plain-English reason. */
function DecisionStamp({ d }: { d: Decision }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className={`stamp inline-flex shrink-0 items-center gap-2 border-[3px] px-3 py-1.5 ${STAMP[d.status]}`}>
        <span className="scale-[1.35]">
          <StatusIcon status={d.status} />
        </span>
        <span className="text-lg font-extrabold uppercase tracking-[0.06em]">{STATUS_LABEL[d.status]}</span>
      </div>
      <div className="min-w-[14rem] flex-1">
        <p className="tnum text-lg font-bold leading-snug text-zinc-100">{actionLine(d)}</p>
        <p className="mt-0.5 text-base leading-snug text-zinc-300">{reasonLine(d)}</p>
      </div>
    </div>
  );
}

/** The invoice's gross as one bar: dyed = net payable, half-dyed = WHT, undyed = held. */
function SplitBar({ d }: { d: Decision }) {
  if (toKobo(d.gross) === 0n) return null;
  return (
    <div className="flex h-2.5 w-full gap-px" aria-hidden>
      {d.excluded_from_totals ? (
        <div className="dye-held-review h-full w-full" />
      ) : (
        <>
          {toKobo(d.net_safe_payable) > 0n && <div className="dye-net h-full" style={{ width: `${shareOf(d.net_safe_payable, d.gross)}%` }} />}
          {toKobo(d.wht_to_remit) > 0n && <div className="dye-wht h-full min-w-[2px]" style={{ width: `${shareOf(d.wht_to_remit, d.gross)}%` }} />}
          {toKobo(d.blocked_or_hold) > 0n && <div className="dye-held h-full min-w-[3px]" style={{ width: `${shareOf(d.blocked_or_hold, d.gross)}%` }} />}
        </>
      )}
    </div>
  );
}

function TapeRow({ op, label, value, strong, sub, swatch }: { op?: string; label: string; value: string; strong?: boolean; sub?: boolean; swatch?: string }) {
  return (
    <div className={`grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-2 ${sub ? "py-0.5 text-sm text-zinc-400" : "py-1"} ${strong ? "font-bold text-zinc-100" : ""}`}>
      <span aria-hidden className="text-center text-zinc-500">{op}</span>
      <span className={`flex min-w-0 items-center gap-2 ${sub ? "pl-3" : ""}`}>
        {swatch && <span aria-hidden className={`inline-block h-3 w-3 shrink-0 ${swatch}`} />}
        {op === "−" && <span className="sr-only">minus </span>}
        {op === "=" && <span className="sr-only">equals </span>}
        {label}
      </span>
      <span className={`whitespace-nowrap text-right ${strong ? "text-xl" : ""}`}>{value}</span>
    </div>
  );
}

/** Settlement tape: Gross − WHT − Held = Net safe payable, as the engine computed it (kobo-exact strings). */
function SettlementTape({ d }: { d: Decision }) {
  return (
    <section aria-labelledby="cf-tape" className="rounded border border-zinc-700 bg-zinc-900">
      <div className="flex items-baseline justify-between gap-2 border-b border-zinc-800 px-4 py-2">
        <h3 id="cf-tape" className="text-sm font-bold text-zinc-100">
          Settlement
        </h3>
        {d.excluded_from_totals && <span className="text-sm font-semibold text-amber-300">Excluded from every total</span>}
      </div>
      <div className="tape px-4 py-2">
        <TapeRow label="Gross (as invoiced)" value={naira(d.gross)} />
        <TapeRow op="−" label="WHT to remit" value={naira(d.wht_to_remit)} swatch="dye-wht" />
        <TapeRow op="−" label="Held / blocked" value={naira(d.blocked_or_hold)} swatch="dye-held" />
        <TapeRow sub label="overpayment blocked" value={naira(d.overpayment_blocked)} />
        <TapeRow sub label="pending verification" value={naira(d.pending_verification)} />
        <div className="my-1 border-t-2 border-double border-zinc-500" />
        <TapeRow op="=" label="Net safe payable" value={naira(d.net_safe_payable)} strong swatch="dye-net" />
        <div className="mt-2">
          <SplitBar d={d} />
        </div>
      </div>
      <div className="space-y-1 border-t border-zinc-800 px-4 py-2.5 text-sm">
        {d.remittance_due && !isZero(d.wht_to_remit) && (
          <p className="font-semibold text-zinc-100">
            Remit WHT {naira(d.wht_to_remit)} by <span className="tnum">{d.remittance_due}</span> <span className="font-normal text-zinc-400">(NTAA s.107(1))</span>
          </p>
        )}
        <dl className="tnum grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-zinc-400">
          <dt>Approved gross</dt>
          <dd className="text-right text-zinc-200">{naira(d.approved_gross)}</dd>
          <dt>Input VAT identified (offset, not cash)</dt>
          <dd className="text-right text-zinc-200">{naira(d.recoverable_input_vat)}</dd>
          {d.advisory_self_account !== "0.00" && (
            <>
              <dt>Advisory: VAT self-account (not counted)</dt>
              <dd className="text-right text-zinc-200">{naira(d.advisory_self_account)}</dd>
            </>
          )}
        </dl>
      </div>
    </section>
  );
}

function Step({ s, i }: { s: EvidenceStep; i: number }) {
  return (
    <li className="border-t border-zinc-800 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
        <span className="font-mono text-sm font-semibold text-zinc-100">
          {s.rule_id}
          <span className="font-normal text-zinc-500"> v{s.rule_version}</span>
        </span>
        <StatusLabel status={s.status} />
      </div>
      <div className="mt-0.5 text-sm text-zinc-400">
        {s.cite}
        {s.field && <span className="font-mono text-xs text-zinc-500"> · field: {s.field}</span>}
      </div>
      {s.raw_snippet && (
        <blockquote className="mt-2 rounded-sm border border-adire-200 bg-adire-50 px-2.5 py-1.5 font-mono text-sm text-adire-900">
          <span className="mr-2 font-sans text-xs font-semibold uppercase tracking-wide text-adire-600">From document</span>“{s.raw_snippet}”
        </blockquote>
      )}
      {Object.keys(s.inputs).length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
          {Object.entries(s.inputs).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-zinc-800/70 py-0.5">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="tnum text-right text-zinc-200 [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.computation && <p className="tnum mt-2 text-sm text-zinc-300">{s.computation}</p>}
      {s.result && <p className="mt-1 text-sm font-semibold text-zinc-100">Result: {s.result}</p>}
      {s.policy_applied && <p className="mt-1 font-mono text-xs text-sky-300">policy: {s.policy_applied}</p>}
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
      <div className="rounded-lg border border-dashed border-zinc-600 p-6 text-sm text-zinc-400">
        Select an invoice to open its case file: the decision, the settlement and the evidence behind every number.
      </div>
    );

  const isInvoice = d.kind === "INVOICE";
  return (
    <article key={`${d.kind}-${d.subject_id}`} className="casefile-in overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-[0_1px_2px_rgba(17,26,63,0.06),0_8px_24px_-12px_rgba(17,26,63,0.18)]" aria-labelledby="cf-title">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-zinc-300">{d.doc_label}</span>
            {d.invoice_number && <span className="font-mono text-zinc-500">Invoice {d.invoice_number}</span>}
            {isInvoice ? <EngineBadge engine={d.engine} /> : <span className="text-zinc-500">{d.kind === "PO_PATTERN" ? "PO pattern · master data" : "vendor pattern · master data"}</span>}
          </div>
          <h2 id="cf-title" ref={head} tabIndex={-1} className="mt-0.5 text-xl font-bold tracking-[-0.01em] text-zinc-100 outline-none [overflow-wrap:anywhere]">
            {d.vendor_name}
          </h2>
        </div>
        <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden" aria-label="Back to the list">
          <CloseIcon />
        </button>
      </header>

      <div className="space-y-5 px-4 py-4">
        <DecisionStamp d={d} />
        {isInvoice && <SettlementTape d={d} />}

        <section aria-labelledby="cf-why">
          <h3 id="cf-why" className="text-sm font-bold text-zinc-100">
            Why
          </h3>
          {d.flags.length === 0 && <p className="mt-1 text-sm text-zinc-400">No exceptions raised. Every check is in the evidence below.</p>}
          {d.flags.length > 0 && (
            <ul className="mt-1.5 space-y-2">
              {d.flags.map((f) => (
                <li key={f.code} className="text-base text-zinc-200">
                  {f.detail}
                  <span className="ml-2 align-middle">
                    <FlagChip code={f.code} quiet />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.vendor_candidate_id && (
            <p className="mt-2 rounded-sm border border-sky-400/50 bg-[#e6f0f7] p-2 text-sm text-sky-300">
              Vendor-master candidate {d.vendor_candidate_id} (similarity 85–91): shown for review, not auto-merged.
            </p>
          )}
          {d.contingent_exposures.length > 0 && (
            <div className="mt-3 rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2">
              <h4 className="text-sm font-semibold text-zinc-300">Contingent exposure avoided</h4>
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

        <section aria-labelledby="cf-ev">
          <h3 id="cf-ev" className="text-sm font-bold text-zinc-100">
            Evidence <span className="font-normal text-zinc-400">· {steps?.length ?? d.evidence_count} steps in evaluation order, each with its rule, citation and honesty label</span>
          </h3>
          {err && <ErrorBox error={err} />}
          {!err && !steps && <Loading label="Loading evidence…" />}
          {steps && (
            <ol className="mt-1">
              {steps.map((s, i) => (
                <Step key={i} s={s} i={i} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </article>
  );
}

export function focusCaseFile() {
  document.getElementById("cf-title")?.focus();
}
