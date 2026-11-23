export function EngineBadge({ engine }: { engine?: string | null }) {
  if (!engine) return <span className="text-xs text-zinc-500">—</span>;
  const gem = engine.startsWith("gemini:");
  const none = engine === "none";
  return (
    <span
      title={gem ? "Fields transcribed by Gemini; all decisions computed in Python" : none ? "No extraction engine available" : "Offline regex parser over PDF text (no LLM)"}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-px font-mono text-2xs ${
        gem ? "bg-adire-100 text-adire-800" : none ? "bg-red-50 text-red-300" : "bg-zinc-950 text-zinc-400"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${gem ? "bg-adire-600" : none ? "bg-red-400" : "bg-zinc-500"}`} />
      {engine}
    </span>
  );
}
