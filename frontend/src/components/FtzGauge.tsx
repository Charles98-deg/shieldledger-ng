// Hand-rolled SVG semicircle. Geometry uses JS numbers (pixels/angles), never money.
const MAX = 0.4; // gauge spans 0–40% domestic share
const CX = 110;
const CY = 128;
const R = 88;

function pt(share: number, r = R): [number, number] {
  const a = Math.PI - (Math.min(Math.max(share, 0), MAX) / MAX) * Math.PI;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = pt(from);
  const [x2, y2] = pt(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const BAND_COLOR: Record<string, string> = { SAFE: "#34d399", WATCH: "#facc15", CRITICAL: "#fb923c", BREACHED: "#f87171" };

/** shareStr: decimal string like "0.234000" (geometry only). */
export function FtzGauge({ shareStr, sharePct, band }: { shareStr: string; sharePct: string; band: string }) {
  const s = Number(shareStr);
  const [nx, ny] = pt(s, R - 14);
  const segs: [number, number, string][] = [
    [0, 0.18, "#065f46"],
    [0.18, 0.22, "#713f12"],
    [0.22, 0.25, "#7c2d12"],
    [0.25, MAX, "#7f1d1d"],
  ];
  return (
    <figure className="flex flex-col items-center" aria-label={`Domestic share ${sharePct}, band ${band}`}>
      <svg viewBox="0 0 220 140" className="w-full max-w-xs" role="img">
        {segs.map(([a, b, c]) => (
          <path key={a} d={arc(a, b)} stroke={c} strokeWidth="18" fill="none" />
        ))}
        <path d={arc(0, Math.min(s, MAX))} stroke={BAND_COLOR[band] ?? "#a1a1aa"} strokeWidth="6" fill="none" strokeLinecap="round" />
        {[0.18, 0.22, 0.25].map((t) => {
          const [x1, y1] = pt(t, R + 12);
          const [x2, y2] = pt(t, R - 12);
          const [lx, ly] = pt(t, R + 22);
          return (
            <g key={t}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={t === 0.25 ? "#fca5a5" : "#a1a1aa"} strokeWidth={t === 0.25 ? 2 : 1} />
              <text x={lx} y={ly} fontSize="9" fill="#a1a1aa" textAnchor="middle">
                {Math.round(t * 100)}%
              </text>
            </g>
          );
        })}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#f4f4f5" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="5" fill="#f4f4f5" />
      </svg>
      <figcaption className="mt-1 text-center">
        <div className="tnum text-2xl font-bold text-zinc-100">{sharePct}</div>
        <div className="text-sm font-semibold" style={{ color: BAND_COLOR[band] }}>
          {band}
        </div>
      </figcaption>
    </figure>
  );
}
