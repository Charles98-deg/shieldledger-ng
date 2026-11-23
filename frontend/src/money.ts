// Naira formatting from decimal strings using BigInt kobo. No float math anywhere.

export function toKobo(s: string): bigint {
  const t = s.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) throw new Error(`not a money string: ${s}`);
  const kobo = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -kobo : kobo;
}

export function fromKobo(k: bigint): string {
  const neg = k < 0n;
  const a = neg ? -k : k;
  const naira = (a / 100n).toString();
  const kobo = (a % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${naira}.${kobo}`;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function naira(s: string | null | undefined, opts: { compact?: boolean } = {}): string {
  if (s === null || s === undefined || s === "") return "—";
  const plain = fromKobo(toKobo(s));
  const neg = plain.startsWith("-");
  const [n, k] = (neg ? plain.slice(1) : plain).split(".");
  if (opts.compact) {
    const kb = toKobo(s);
    const abs = kb < 0n ? -kb : kb;
    const million = 100_000_000n; // ₦1,000,000 in kobo
    if (abs >= million) {
      const tenths = (abs * 10n) / million; // one decimal, truncated
      const str = `${tenths / 10n}.${tenths % 10n}`;
      return `${neg ? "-" : ""}₦${str}M`;
    }
  }
  return `${neg ? "-" : ""}₦${group(n)}.${k}`;
}

export function addMoney(...xs: string[]): string {
  return fromKobo(xs.reduce((acc, x) => acc + toKobo(x), 0n));
}

export function isZero(s: string): boolean {
  return toKobo(s) === 0n;
}

/** Share of a in total as a percentage string with 1 dp, computed in integers. */
export function shareOf(a: string, total: string): string {
  const t = toKobo(total);
  if (t === 0n) return "0.0";
  const permille = (toKobo(a) * 1000n) / t;
  return `${permille / 10n}.${permille % 10n}`;
}

/** Parse user input like "₦25,000,000" or "25000000.00" to a canonical money string, or null. */
export function parseInput(raw: string): string | null {
  const s = raw.replace(/[₦\s]/g, "").replace(/^NGN/i, "");
  if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) return null;
  return fromKobo(toKobo(s.replace(/,/g, "")));
}
