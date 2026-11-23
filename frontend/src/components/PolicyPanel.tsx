import { useEffect, useState } from "react";
import { api } from "../api";
import type { Policy } from "../types";
import { Drawer, ErrorBox, Loading } from "./Drawer";
import { StatusLabel } from "./StatusLabel";
import { naira } from "../money";
import { GROUPS, POLICY_TEXT, UNIT_SUFFIX, percentToRatio, ratioToPercent, type PolicyText } from "../policyText";

function textFor(p: Policy): PolicyText {
  return (
    POLICY_TEXT[p.key] ?? {
      label: p.label,
      unit: p.type === "toggle" ? "toggle" : p.type.startsWith("enum:") || p.type === "confidence" ? "choice" : p.type === "money" ? "naira" : p.type.startsWith("ratio") ? "percent" : "days",
      group: "Other",
    }
  );
}

function shownDefault(p: Policy, t: PolicyText): string {
  if (!p.default) return "no default";
  if (t.unit === "percent") return `${ratioToPercent(p.default)}%`;
  if (t.unit === "naira") return naira(p.default);
  if (t.unit === "toggle") return p.default === "ON" ? "On" : "Off";
  if (t.unit === "choice") return t.options?.[p.default] ?? p.default;
  return `${p.default}${UNIT_SUFFIX[t.unit] ? ` ${UNIT_SUFFIX[t.unit]}` : ""}`;
}

export function PolicyPanel({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Policy[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  // What the clerk typed in percent fields; the draft keeps the API's ratio form.
  const [pct, setPct] = useState<Record<string, string>>({});
  const syncPct = (ps: Policy[]) => setPct(Object.fromEntries(ps.map((p) => [p.key, ratioToPercent(p.value)])));

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSaved(null);
    api
      .policies()
      .then((r) => {
        setItems(r.policies);
        setDraft(Object.fromEntries(r.policies.map((p) => [p.key, p.value])));
        syncPct(r.policies);
      })
      .catch((e) => setErr((e as Error).message));
  }, [open]);

  const changes = items ? Object.fromEntries(items.filter((p) => draft[p.key] !== p.value).map((p) => [p.key, draft[p.key]])) : {};
  const dirty = Object.keys(changes).length > 0;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await api.putPolicies(changes);
      setItems(r.policies);
      setDraft(Object.fromEntries(r.policies.map((p) => [p.key, p.value])));
      syncPct(r.policies);
      setSaved(`Saved ${Object.keys(r.applied).length} change(s); run re-evaluated; change audited.`);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-xl"
      title={
        <div>
          <h2 className="text-lg font-semibold">Buyer policies &amp; interpretation toggles</h2>
          <p className="text-xs text-zinc-400">Every change is written to the hash-chained audit log and the run is re-evaluated.</p>
        </div>
      }
    >
      {err && <ErrorBox error={err} />}
      {!items && !err && <Loading />}
      {items && (
        <div className="space-y-3">
          {items.some((p) => p.policy_required) && (
            <div className="rounded bg-amber-50 px-3 py-2.5 text-sm text-amber-300">
              Needs a value: {items.filter((p) => p.policy_required).map((p) => textFor(p).label).join(", ")}. Invoices that depend on it go to a person.{" "}
              <span className="font-mono text-xs">(POLICY_REQUIRED: {items.filter((p) => p.policy_required).map((p) => p.key).join(", ")})</span>
            </div>
          )}
          {[...GROUPS, "Other"].map((g) => {
            const inGroup = items.filter((p) => textFor(p).group === g);
            if (!inGroup.length) return null;
            return (
              <section key={g} className="space-y-2">
                <h3 className="pt-2 text-sm font-bold text-zinc-100">{g}</h3>
                {inGroup.map((p) => {
                  const t = textFor(p);
                  const id = `pol-${p.key}`;
                  return (
                    <div key={p.key} className={`rounded-lg border bg-zinc-900 p-4 ${p.policy_required ? "border-amber-400" : "border-zinc-800"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label htmlFor={id} className="text-base font-semibold text-zinc-100">
                          {t.label}
                        </label>
                        <div className="flex gap-1">
                          <StatusLabel status="BUYER_POLICY" />
                          {p.rule_status && <StatusLabel status={p.rule_status} />}
                        </div>
                      </div>
                      {t.help && <p className="mt-0.5 text-sm text-zinc-400">{t.help}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {t.unit === "toggle" ? (
                          <button
                            id={id}
                            role="switch"
                            aria-checked={draft[p.key] === "ON"}
                            onClick={() => setDraft({ ...draft, [p.key]: draft[p.key] === "ON" ? "OFF" : "ON" })}
                            className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold ring-1 ring-inset ${
                              draft[p.key] === "ON" ? "bg-action-600 text-white ring-action-600" : "bg-zinc-900 text-zinc-300 ring-zinc-600"
                            }`}
                          >
                            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${draft[p.key] === "ON" ? "bg-white" : "bg-zinc-600"}`} />
                            {draft[p.key] === "ON" ? "On" : "Off"}
                          </button>
                        ) : t.unit === "choice" ? (
                          <select
                            id={id}
                            value={draft[p.key]}
                            onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value })}
                            className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm"
                          >
                            {(p.type === "confidence" ? ["HIGH", "MEDIUM", "LOW"] : p.type.slice(5).split(",")).map((o) => (
                              <option key={o} value={o}>
                                {t.options?.[o] ?? o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className={`flex items-center rounded border bg-zinc-900 focus-within:outline focus-within:outline-2 focus-within:outline-action-600 ${p.policy_required ? "border-amber-400" : "border-zinc-600"}`}>
                            {t.unit === "naira" && <span className="pl-2 text-zinc-400">₦</span>}
                            <input
                              id={id}
                              value={t.unit === "percent" ? (pct[p.key] ?? "") : draft[p.key]}
                              placeholder={p.policy_required ? "Required: enter a value" : ""}
                              onChange={(e) => {
                                if (t.unit === "percent") {
                                  const v = e.target.value;
                                  setPct({ ...pct, [p.key]: v });
                                  setDraft({ ...draft, [p.key]: v === ratioToPercent(p.value) ? p.value : percentToRatio(v) });
                                } else setDraft({ ...draft, [p.key]: e.target.value });
                              }}
                              className="tnum w-40 bg-transparent px-2 py-1.5 text-sm outline-none"
                              inputMode="decimal"
                            />
                            {UNIT_SUFFIX[t.unit] && <span className="pr-2 text-sm text-zinc-400">{UNIT_SUFFIX[t.unit]}</span>}
                          </div>
                        )}
                        {t.unit === "naira" && draft[p.key] && <span className="tnum text-sm text-zinc-400">= {(() => { try { return naira(draft[p.key]); } catch { return "not a valid amount"; } })()}</span>}
                      </div>
                      <div className="mt-2 font-mono text-xs text-zinc-500">
                        {p.key} = “{p.value || "unset"}”{p.rule_cite && ` · ${p.rule_cite}`}
                      </div>
                      <div className="text-xs text-zinc-500">Default: {shownDefault(p, t)}</div>
                    </div>
                  );
                })}
              </section>
            );
          })}
          <div className="sticky bottom-0 flex items-center gap-3 bg-zinc-950 py-3">
            <button
              disabled={!dirty || saving}
              onClick={save}
              className="btn btn-primary"
            >
              {saving ? "Saving…" : `Save & re-evaluate${dirty ? ` (${Object.keys(changes).length})` : ""}`}
            </button>
            {saved && <span className="text-sm text-emerald-300">{saved}</span>}
          </div>
        </div>
      )}
    </Drawer>
  );
}
