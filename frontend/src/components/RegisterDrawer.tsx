import { useEffect, useState } from "react";
import { api } from "../api";
import type { Rule, RuleStatus } from "../types";
import { Drawer, ErrorBox, Loading } from "./Drawer";
import { STATUS_HELP, StatusLabel } from "./StatusLabel";

function show(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => (x && typeof x === "object" ? `${k}: ${(x as { rate?: string }).rate ?? "—"} (${(x as { status?: string }).status ?? ""})` : `${k}: ${String(x)}`))
    .join(" · ");
}

export function RegisterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<{ pack: string; rules: Rule[]; disclaimer: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<RuleStatus | "ALL">("ALL");

  useEffect(() => {
    if (open && !data) api.rules().then(setData).catch((e) => setErr((e as Error).message));
  }, [open, data]);

  const rules = data?.rules.filter((r) => filter === "ALL" || r.status === filter) ?? [];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <div>
          <h2 className="text-lg font-semibold">Statutory Register {data && <span className="font-mono text-sm text-zinc-400">{data.pack}</span>}</h2>
          <p className="text-xs text-amber-200/90">{data?.disclaimer}</p>
        </div>
      }
    >
      {err && <ErrorBox error={err} />}
      {!data && !err && <Loading />}
      {data && (
        <>
          <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Filter by status">
            {(["ALL", "SECONDARY_VERIFIED", "CONFLICTING", "BRIEF_ONLY", "UNVERIFIED", "BUYER_POLICY"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                title={s === "ALL" ? "" : STATUS_HELP[s]}
                className={`rounded px-2 py-0.5 font-mono text-xs ${filter === s ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
              >
                {s} ({s === "ALL" ? data.rules.length : data.rules.filter((r) => r.status === s).length})
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="rounded border border-zinc-800 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{r.id}</span>
                  <span className="font-mono text-xs text-zinc-500">v{r.version}</span>
                  <StatusLabel status={r.status} />
                  {r.kind === "control" && <span className="text-xs text-zinc-500">buyer control (not law)</span>}
                </div>
                <div className="mt-1 text-xs text-zinc-300">{r.cite}</div>
                <div className="tnum mt-1 text-sm text-zinc-400">{show(r.value)}</div>
                {r.note && <p className="mt-1 text-xs text-zinc-500">{r.note}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
}
