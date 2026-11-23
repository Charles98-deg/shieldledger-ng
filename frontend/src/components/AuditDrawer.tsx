import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditEvent, AuditVerify } from "../types";
import { Drawer, ErrorBox, Loading } from "./Drawer";
import { CheckMark } from "./Icons";

/** Read-only view of the append-only audit log and its hash-chain check (existing /api/audit endpoints). */
export function AuditDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [verify, setVerify] = useState<AuditVerify | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    Promise.all([api.audit(200), api.auditVerify()])
      .then(([e, v]) => {
        setEvents(e);
        setVerify(v);
      })
      .catch((e) => setErr((e as Error).message));
  }, [open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={
        <div>
          <h2 className="text-lg font-semibold">Audit log</h2>
          <p className="text-sm text-zinc-500">SHA-256 hash chain, append-only (UPDATE/DELETE blocked by DB triggers). Latest 200 events.</p>
        </div>
      }
    >
      {err && <ErrorBox error={err} />}
      {!events && !err && <Loading />}
      {verify && (
        <p className={`badge mb-4 ${verify.ok ? "bg-emerald-50 text-emerald-300" : "bg-red-400 text-white"}`} role="status">
          <CheckMark ok={verify.ok} />
          {verify.ok ? `Chain intact · ${verify.checked} events checked` : `Chain broken at event #${verify.first_bad_id}`}
        </p>
      )}
      {events && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Time (UTC)</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="tnum px-3 py-1.5 text-zinc-500">{e.id}</td>
                  <td className="tnum whitespace-nowrap px-3 py-1.5 text-zinc-400">{e.ts.slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-zinc-200">{e.event_type}</td>
                  <td className="px-3 py-1.5 text-zinc-300">
                    {e.entity_type} <span className="font-mono text-xs">{e.entity_id}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-zinc-500" title={e.hash}>
                    {e.hash.slice(0, 10)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
