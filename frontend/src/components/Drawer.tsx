import { useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "./Icons";

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
  // Stay mounted through the exit so the panel can slide out the way it came in.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(t);
  }, [open]);
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
  if (!mounted) return null;
  const state = shown ? "open" : "closed";
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button aria-label="Close" data-state={state} className="drawer-scrim absolute inset-0 cursor-default bg-adire-950/40" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        data-state={state}
        className={`drawer-panel relative flex h-full w-full ${width} flex-col bg-zinc-950 shadow-[-12px_0_32px_-8px_rgba(17,26,63,0.28)] outline-none`}
      >
        <div aria-hidden className="h-1.5 shrink-0 bg-adire-800" />
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close panel">
            <CloseIcon />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="py-10 text-center text-sm text-zinc-400" role="status">
      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-adire-400" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded border border-red-400 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
      {error}
      {onRetry && (
        <button onClick={onRetry} className="ml-3 underline">
          Retry
        </button>
      )}
    </div>
  );
}
