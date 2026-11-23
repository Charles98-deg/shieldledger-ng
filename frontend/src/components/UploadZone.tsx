import { useRef, useState } from "react";
import { api, type UploadResult } from "../api";

export function UploadZone({ onDone, devMode, compact }: { onDone: () => void; devMode: boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(`Uploading ${files.length} file(s)…`);
    setMsg(null);
    try {
      const r = await api.upload(files);
      setResults(r.results);
      setBusy("Evaluating…");
      await api.evaluate();
      const errs = r.results.filter((x) => x.error).length;
      const replays = r.results.filter((x) => x.idempotent_replay).length;
      setMsg({ tone: errs ? "err" : "ok", text: `${r.results.length - errs} accepted${replays ? ` (${replays} idempotent replay)` : ""}${errs ? `, ${errs} rejected` : ""}.` });
      onDone();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function loadPack() {
    setBusy("Resetting and ingesting demo pack…");
    setMsg(null);
    setResults([]);
    try {
      const r = await api.resetDemo();
      setMsg({ tone: "ok", text: `Demo pack loaded: ${r.ingested} PDFs in ${r.seconds}s via ${r.engines.join(", ")}.` });
      onDone();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-start gap-3 rounded-lg border border-dashed transition-colors duration-150 sm:flex-row sm:items-center sm:justify-between ${compact ? "px-4 py-3" : "p-5"} ${
          drag ? "border-action-600 bg-action-50" : "border-zinc-700 bg-zinc-900"
        }`}
      >
        <div className="flex items-start gap-3 text-sm text-zinc-300">
          <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-zinc-500">
            <path d="M10 13V3.5M6.5 7 10 3.5 13.5 7M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
          </svg>
          <div>
          <p className="font-semibold text-zinc-100">Drop invoices here</p>
          <p className="text-xs text-zinc-500">PDF, PNG or JPEG, up to 10 MB each. Re-uploads are matched by SHA-256, never re-read.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            disabled={!!busy}
            onClick={() => input.current?.click()}
            className="btn btn-secondary"
          >
            Choose files
          </button>
          {devMode && (
            <button
              disabled={!!busy}
              onClick={loadPack}
              className="btn btn-primary"
            >
              Load demo pack
            </button>
          )}
        </div>
      </div>
      {busy && (
        <p className="text-sm text-zinc-400" role="status">
          {busy}
        </p>
      )}
      {msg && (
        <p className={`text-sm ${msg.tone === "ok" ? "text-emerald-300" : "text-red-300"}`} role="status">
          {msg.text}
        </p>
      )}
      {results.some((r) => r.error) && (
        <ul className="text-sm text-red-300">
          {results
            .filter((r) => r.error)
            .map((r) => (
              <li key={r.filename}>
                {r.filename}: {r.error!.code} — {r.error!.message}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
