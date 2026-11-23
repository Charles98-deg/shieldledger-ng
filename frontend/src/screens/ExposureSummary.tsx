import { useEffect, useState } from "react";
import { api } from "../api";
import { ConservationBar } from "../components/ConservationBar";
import { ErrorBox, Loading } from "../components/Drawer";
import { MetricCard } from "../components/MetricCard";
import { StatusLabel } from "../components/StatusLabel";
import { CheckMark } from "../components/Icons";
import { naira } from "../money";
import type { AuditVerify, Summary } from "../types";

type FV = Awaited<ReturnType<typeof api.fieldValidation>>;

export function ExposureSummary({ refreshKey }: { refreshKey: number }) {
  const [s, setS] = useState<Summary | null>(null);
  const [audit, setAudit] = useState<AuditVerify | null>(null);
  const [fv, setFv] = useState<FV | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    Promise.all([api.summary(), api.auditVerify(), api.fieldValidation()])
      .then(([a, b, c]) => {
        setS(a);
        setAudit(b);
        setFv(c);
      })
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(load, [refreshKey]);

  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!s) return <Loading />;
  if (s.invoice_count === 0)
    return <div className="rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-400">No run evaluated yet — load invoices on the Payment Run tab.</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Exposure summary</h1>
        <p className="text-sm text-zinc-400">
          Two separate measures — <strong className="text-zinc-200">never added together</strong>. Invoices needing human review are excluded from every figure.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricCard
          tone="emerald"
          title="Direct cash recovered & saved"
          total={s.direct_cash.total}
          lines={[
            { label: "Input VAT identified for offset (NTA s.156)", value: s.direct_cash.input_vat_identified },
            { label: "Overpayments blocked (duplicate, short delivery, price)", value: s.direct_cash.overpayments_blocked },
          ]}
          footnote={
            <>
              “Input VAT identified” is an <em>offset entitlement</em> the buyer would otherwise risk by paying invalid or over-invoiced amounts — it is not cash received.
            </>
          }
        />
        <MetricCard
          tone="amber"
          title="Contingent statutory fines blocked"
          caption="if the batch had been paid as invoiced"
          total={s.contingent_fines_blocked.total}
          lines={[
            {
              label: (
                <>
                  Unregistered contractor fine, NTAA s.100(2) <StatusLabel status="SECONDARY_VERIFIED" />
                </>
              ),
              value: s.contingent_fines_blocked.unregistered_contractor_s100_2,
            },
            {
              label: (
                <>
                  Failure to deduct WHT (40%), NTAA s.105 <StatusLabel status="SECONDARY_VERIFIED" />
                </>
              ),
              value: s.contingent_fines_blocked.failure_to_deduct_s105,
            },
          ]}
          footnote="What the buyer would have been exposed to had the batch been paid as invoiced without deduction or vendor checks. Not a saving in cash."
        />
      </div>

      <ConservationBar
        total={s.conservation.gross}
        totalLabel="Gross invoiced"
        ok={s.conservation.ok}
        parts={[
          { label: "Net safe payable", value: s.conservation.net_safe_payable, color: "dye-net" },
          { label: "WHT to remit", value: s.conservation.wht_to_remit, color: "dye-wht" },
          { label: "Blocked / hold", value: s.conservation.blocked_or_hold, color: "dye-held" },
        ]}
      />

      <section aria-label="Also in this batch" className="divide-y divide-zinc-800 rounded-lg border border-zinc-700 bg-zinc-900">
        <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[16rem_12rem_1fr] sm:items-baseline">
          <h2 className="font-bold text-zinc-100">Pending verification holds</h2>
          <p className="tnum text-lg font-bold text-zinc-100 sm:text-right">{naira(s.pending_verification_holds)}</p>
          <p className="text-sm text-zinc-400">Held until registration or VAT registration is proven. Not counted as saved.</p>
        </div>
        <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[16rem_12rem_1fr] sm:items-baseline">
          <h2 className="font-bold text-zinc-100">Advisories (not counted)</h2>
          <p className="tnum text-lg font-bold text-sky-300 sm:text-right">{naira(s.advisories.vat_self_account)}</p>
          <p className="text-sm text-zinc-400">
            VAT self-account exposure where VAT was omitted; the Service <em>may</em> direct this (NTA s.155(2)).
          </p>
        </div>
        {s.needs_review_count > 0 && (
          <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[16rem_12rem_1fr] sm:items-baseline">
            <h2 className="font-bold text-zinc-100">Needs a person</h2>
            <p className="tnum text-lg font-bold text-zinc-100 sm:text-right">{s.needs_review_count} invoice{s.needs_review_count === 1 ? "" : "s"}</p>
            <p className="text-sm text-zinc-400">Excluded from every figure on this page until a person has reviewed it.</p>
          </div>
        )}
        <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[16rem_12rem_1fr] sm:items-baseline">
          <h2 className="font-bold text-zinc-100">Audit chain</h2>
          {audit ? (
            <p className={`inline-flex items-center gap-1.5 font-bold sm:justify-end ${audit.ok ? "text-emerald-300" : "text-red-300"}`} role="status">
              <CheckMark ok={audit.ok} />
              {audit.ok ? `Intact: ${audit.checked} events` : `Broken at event #${audit.first_bad_id}`}
            </p>
          ) : (
            <p className="text-sm text-zinc-400 sm:text-right">Checking…</p>
          )}
          <p className="text-sm text-zinc-400">SHA-256 hash chain, append-only (UPDATE/DELETE blocked by DB triggers).</p>
        </div>
      </section>

      {fv && (fv.quotes.length > 0 || fv.company_examples.length > 0) && (
        <section className="rounded-lg border border-zinc-800 p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{fv.label}</h2>
          <ul className="mt-2 space-y-2">
            {fv.quotes.map((q, i) => (
              <li key={`q${i}`} className="text-zinc-300">
                “{q.text}” <span className="text-xs text-zinc-500">— {q.who}, {q.date} ({q.channel})</span>
              </li>
            ))}
            {fv.company_examples.map((c, i) => (
              <li key={`c${i}`} className="text-zinc-300">
                {c.description} <span className="text-xs text-zinc-500">— {c.who}, {c.date}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">Anecdotes reported by the builder, not statistics.</p>
        </section>
      )}
    </div>
  );
}
