export function EngineBadge({ engine }: { engine?: string | null }) {
  if (!engine) return <span className="text-xs text-zinc-500">—</span>;
  const gem = engine.startsWith("gemini:");
  const none = engine === "none";
  return (
    <span
      title={gem ? "Fields transcribed by Gemini; all decisions computed in Python" : none ? "No extraction engine available" : "Offline regex parser over PDF text (no LLM)"}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-inset ${
        gem ? "bg-indigo-500/15 text-indigo-200 ring-indigo-400/40" : none ? "bg-red-500/10 text-red-300 ring-red-500/40" : "bg-zinc-800 text-zinc-300 ring-zinc-600"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${gem ? "bg-indigo-300" : none ? "bg-red-400" : "bg-zinc-400"}`} />
      {engine}
    </span>
  );
}
