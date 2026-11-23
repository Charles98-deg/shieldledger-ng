import { useEffect, useState, type ReactNode } from "react";
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
    return <div className="panel px-6 py-12 text-center text-sm text-zinc-500">No run evaluated yet — load invoices on the Payment Run tab.</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-zinc-100">Exposure summary</h1>
        <p className="mt-1 max-w-[68ch] text-sm text-zinc-400">
          Two separate measures — <strong className="text-zinc-200">never added together</strong>. Invoices needing human review are excluded from every figure.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <MetricCard
          tone="emerald"
          kind="Cash"
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
          kind="Contingent · not cash"
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

      <section aria-labelledby="also" className="panel">
        <h2 id="also" className="panel-head px-6 pt-5">
          Also in this batch
        </h2>
        <div className="mt-3 grid border-t border-zinc-800 sm:grid-cols-2">
          <Fact label="Pending verification holds" value={naira(s.pending_verification_holds)}>
            Held until registration or VAT registration is proven. Not counted as saved.
          </Fact>
          <Fact label="Advisories (not counted)" value={naira(s.advisories.vat_self_account)} tone="text-sky-300">
            VAT self-account exposure where VAT was omitted; the Service <em>may</em> direct this (NTA s.155(2)).
          </Fact>
          <Fact label="Needs a person" value={`${s.needs_review_count} invoice${s.needs_review_count === 1 ? "" : "s"}`}>
            Excluded from every figure on this page until a person has reviewed it.
          </Fact>
          <Fact
            label="Audit chain"
            value={
              audit ? (
                <span className={`inline-flex items-center gap-1.5 ${audit.ok ? "text-emerald-300" : "text-red-300"}`} role="status">
                  <CheckMark ok={audit.ok} />
                  {audit.ok ? `Intact · ${audit.checked} events` : `Broken at event #${audit.first_bad_id}`}
                </span>
              ) : (
                <span className="text-zinc-500">Checking…</span>
              )
            }
          >
            SHA-256 hash chain, append-only (UPDATE/DELETE blocked by DB triggers).
          </Fact>
        </div>
      </section>

      {fv && (fv.quotes.length > 0 || fv.company_examples.length > 0) && (
        <section className="panel p-6 text-sm">
          <h2 className="panel-head">{fv.label}</h2>
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

function Fact({ label, value, tone, children }: { label: string; value: ReactNode; tone?: string; children: ReactNode }) {
  return (
    <div className="border-zinc-800 px-6 py-4 max-sm:border-b sm:[&:nth-child(-n+2)]:border-b sm:odd:border-r">
      <p className="label">{label}</p>
      <p className={`tnum mt-1 text-xl font-bold ${tone ?? "text-zinc-100"}`}>{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{children}</p>
    </div>
  );
}
