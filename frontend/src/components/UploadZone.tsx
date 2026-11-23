import { useRef, useState } from "react";
import { api, type UploadResult } from "../api";

export function UploadZone({ onDone, devMode }: { onDone: () => void; devMode: boolean }) {
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
        className={`flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between ${
          drag ? "border-adire-600 bg-adire-50" : "border-zinc-600 bg-zinc-900"
        }`}
      >
        <div className="text-sm text-zinc-300">
          <p className="font-medium">Drop invoices here (PDF, PNG, JPEG · ≤ 10 MB each)</p>
          <p className="text-xs text-zinc-500">Duplicate files are detected by SHA-256 and replayed, never re-extracted.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            className="rounded border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-semibold hover:bg-zinc-950 disabled:opacity-50"
          >
            Choose files
          </button>
          {devMode && (
            <button
              disabled={!!busy}
              onClick={loadPack}
              className="rounded bg-adire-800 px-4 py-2 text-sm font-semibold text-white hover:bg-adire-700 active:bg-adire-900 disabled:opacity-50"
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
        <ul className="text-xs text-red-300">
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
