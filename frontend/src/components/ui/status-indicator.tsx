import { cn } from "@/lib/utils";

type State = "ready" | "connecting" | "offline" | "error" | "neutral";

const dot: Record<State, string> = {
  ready: "bg-ripple-low",
  connecting: "bg-ripple-attention animate-pulse",
  offline: "bg-muted",
  error: "bg-ripple-warm",
  neutral: "bg-muted/60",
};

export function StatusIndicator({
  state,
  label,
  className,
}: {
  state: State;
  label: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs font-semibold text-muted",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", dot[state])} />
      {label}
    </span>
  );
}
