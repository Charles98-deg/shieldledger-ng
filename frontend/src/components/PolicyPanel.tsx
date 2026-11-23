import { useEffect, useState } from "react";
import { api } from "../api";
import type { Policy } from "../types";
import { Drawer, ErrorBox, Loading } from "./Drawer";
import { StatusLabel } from "./StatusLabel";

export function PolicyPanel({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Policy[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSaved(null);
    api
      .policies()
      .then((r) => {
        setItems(r.policies);
        setDraft(Object.fromEntries(r.policies.map((p) => [p.key, p.value])));
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
            <div className="rounded border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-100">
              POLICY_REQUIRED: {items.filter((p) => p.policy_required).map((p) => p.key).join(", ")} — invoices needing these route to human review.
            </div>
          )}
          {items.map((p) => (
            <div key={p.key} className="rounded border border-zinc-800 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`pol-${p.key}`} className="text-sm font-medium">
                  {p.label}
                </label>
                <div className="flex gap-1">
                  <StatusLabel status="BUYER_POLICY" />
                  {p.rule_status && <StatusLabel status={p.rule_status} />}
                </div>
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                {p.key}
                {p.rule_cite && ` · ${p.rule_cite}`} · default “{p.default || "unset"}”
              </div>
              <div className="mt-2">
                {p.type === "toggle" ? (
                  <button
                    id={`pol-${p.key}`}
                    role="switch"
                    aria-checked={draft[p.key] === "ON"}
                    onClick={() => setDraft({ ...draft, [p.key]: draft[p.key] === "ON" ? "OFF" : "ON" })}
                    className={`rounded px-3 py-1 text-xs font-semibold ${draft[p.key] === "ON" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
                  >
                    {draft[p.key]}
                  </button>
                ) : p.type.startsWith("enum:") || p.type === "confidence" ? (
                  <select
                    id={`pol-${p.key}`}
                    value={draft[p.key]}
                    onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value })}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  >
                    {(p.type === "confidence" ? ["HIGH", "MEDIUM", "LOW"] : p.type.slice(5).split(",")).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`pol-${p.key}`}
                    value={draft[p.key]}
                    placeholder={p.policy_required ? "POLICY_REQUIRED — enter a value" : ""}
                    onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value })}
                    className={`tnum w-full rounded border bg-zinc-900 px-2 py-1 font-mono text-sm ${p.policy_required ? "border-amber-400/60" : "border-zinc-700"}`}
                    inputMode="decimal"
                  />
                )}
              </div>
            </div>
          ))}
          <div className="sticky bottom-0 flex items-center gap-3 bg-zinc-950 py-3">
            <button
              disabled={!dirty || saving}
              onClick={save}
              className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {saving ? "Saving…" : `Save & re-evaluate${dirty ? ` (${Object.keys(changes).length})` : ""}`}
            </button>
            {saved && <span className="text-xs text-emerald-300">{saved}</span>}
          </div>
        </div>
      )}
    </Drawer>
  );
}
