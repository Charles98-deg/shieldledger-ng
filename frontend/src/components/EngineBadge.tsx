export function EngineBadge({ engine }: { engine?: string | null }) {
  if (!engine) return <span className="text-xs text-zinc-500">—</span>;
  const gem = engine.startsWith("gemini:");
  const none = engine === "none";
  return (
    <span
      title={gem ? "Fields transcribed by Gemini; all decisions computed in Python" : none ? "No extraction engine available" : "Offline regex parser over PDF text (no LLM)"}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset ${
        gem ? "bg-adire-50 text-adire-800 ring-adire-300" : none ? "bg-[#f9e3e3] text-red-300 ring-red-400/60" : "bg-zinc-900 text-zinc-300 ring-zinc-700"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${gem ? "bg-adire-600" : none ? "bg-red-400" : "bg-zinc-500"}`} />
      {engine}
    </span>
  );
}
