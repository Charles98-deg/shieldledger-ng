// One stroke family (1.75px, round caps) for every status mark. Status is never colour alone.
const base = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function CheckMark({ ok }: { ok: boolean }) {
  return ok ? (
    <svg {...base}>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  ) : (
    <svg {...base}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "RELEASE":
      return (
        <svg {...base}>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      );
    case "RELEASE_PARTIAL":
      return (
        <svg {...base}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 2.5v11" />
          <path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor" />
        </svg>
      );
    case "HOLD":
      return (
        <svg {...base}>
          <path d="M6 4v8M10 4v8" />
        </svg>
      );
    case "BLOCKED":
      return (
        <svg {...base}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M4.2 11.8l7.6-7.6" />
        </svg>
      );
    default:
      return (
        <svg {...base}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 7.5v3.5M8 5h.01" />
        </svg>
      );
  }
}

export function CloseIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
