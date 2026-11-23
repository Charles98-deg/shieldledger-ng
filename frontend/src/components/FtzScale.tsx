// Threshold scale for the domestic-sales share. Geometry uses JS numbers (percent positions), never money.
const MAX = 0.3; // scale spans 0–30% so the 25% line sits clearly inside it

const BANDS: { from: number; to: number; cls: string; label: string }[] = [
  { from: 0, to: 0.18, cls: "bg-[#cfe6d8]", label: "Safe" },
  { from: 0.18, to: 0.22, cls: "bg-[#f1dfb3]", label: "Watch" },
  { from: 0.22, to: 0.25, cls: "bg-[#f1c9ad]", label: "Critical" },
  { from: 0.25, to: MAX, cls: "bg-[#eec0c0]", label: "Breach" },
];

export const BAND_TONE: Record<string, { text: string; badge: string; fill: string }> = {
  SAFE: { text: "text-emerald-300", badge: "bg-emerald-50 text-emerald-300", fill: "bg-emerald-500" },
  WATCH: { text: "text-amber-300", badge: "bg-amber-50 text-amber-300", fill: "bg-amber-400" },
  CRITICAL: { text: "text-orange-300", badge: "bg-orange-50 text-orange-300", fill: "bg-orange-400" },
  BREACHED: { text: "text-red-300", badge: "bg-red-400 text-white", fill: "bg-red-400" },
};

const pos = (v: number) => `${(Math.min(Math.max(v, 0), MAX) / MAX) * 100}%`;

/** shareStr: decimal string like "0.234000" (geometry only). */
export function FtzScale({ shareStr, sharePct, band }: { shareStr: string; sharePct: string; band: string }) {
  const s = Number(shareStr);
  return (
    <figure aria-label={`Domestic share ${sharePct} on a 0 to 30 percent scale; band ${band}; the line is 25 percent`} className="select-none">
      <div className="relative pt-7">
        {/* current share marker */}
        <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-zinc-100" style={{ left: pos(s) }}>
          {sharePct}
        </div>
        <div className="relative h-3 overflow-hidden rounded-full">
          {BANDS.map((b) => (
            <div key={b.label} className={`absolute inset-y-0 ${b.cls}`} style={{ left: pos(b.from), width: `calc(${pos(b.to)} - ${pos(b.from)})` }} />
          ))}
        </div>
        <div className={`absolute top-[1.125rem] h-7 w-1.5 -translate-x-1/2 rounded-full bg-adire-900 ring-2 ring-white`} style={{ left: pos(s) }} aria-hidden />
        {/* the 25% line */}
        <div className="absolute top-[1.125rem] h-7 w-0.5 -translate-x-1/2 bg-red-400" style={{ left: pos(0.25) }} aria-hidden />
      </div>
      <div className="relative mt-2 h-10 text-xs text-zinc-500" aria-hidden>
        {[0, 0.18, 0.22, 0.25, MAX].map((t) => (
          <span
            key={t}
            className={`tnum absolute ${t === 0 ? "" : t === MAX ? "-translate-x-full" : "-translate-x-1/2"} ${t === 0.25 ? "font-bold text-red-300" : ""} ${t === 0.18 || t === 0.22 ? "max-sm:hidden" : ""}`}
            style={{ left: pos(t) }}
          >
            {Math.round(t * 100)}%{t === 0.25 && <span className="block font-semibold">line</span>}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {BANDS.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${b.cls}`} />
            {b.label}
            <span className="tnum">
              {b.label === "Breach" ? "at the line, per the boundary reading" : `< ${Math.round(b.to * 100)}%`}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
