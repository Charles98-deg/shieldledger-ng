import type { ReactNode } from "react";

export function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="mt-10 border-t border-zinc-800 py-5 text-xs leading-relaxed text-zinc-500">
      {children}
      <p>
        <strong className="text-zinc-400">Demo data is fictional.</strong> Rule citations are from secondary summaries — see Statutory Register.
      </p>
      <p className="mt-1">
        Read-only decision support: ShieldLedger NG recommends and documents; it never executes payments or writes to an ERP. Not tax advice.
      </p>
    </footer>
  );
}
