import { useEffect, useRef, type ReactNode } from "react";

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 cursor-default bg-black/60" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={`relative flex h-full w-full ${width} flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl outline-none`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button onClick={onClose} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close panel">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="py-10 text-center text-sm text-zinc-400" role="status">
      <span className="mr-2 inline-block h-3 w-3 animate-pulse rounded-full bg-zinc-500" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
      {error}
      {onRetry && (
        <button onClick={onRetry} className="ml-3 underline">
          Retry
        </button>
      )}
    </div>
  );
}
