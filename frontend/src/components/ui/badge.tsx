import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "positive" | "attention" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-primary-soft/70 text-foreground",
  primary: "bg-primary-soft text-primary-strong",
  positive: "bg-positive/15 text-foreground",
  attention: "bg-ripple-attention/25 text-foreground",
  danger: "bg-ripple-warm/15 text-foreground",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
