import { AlertTriangle, Info, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "offline";

const tones: Record<Tone, string> = {
  info: "border-primary/25 bg-primary-soft/55 text-foreground",
  warning:
    "border-accent/50 bg-accent/15 text-[#6b4216] dark:text-[#f3c99d]",
  offline:
    "border-ripple-warm/35 bg-ripple-warm/10 text-[#7c3013] dark:text-[#f0b69d]",
};

const icons = {
  info: Info,
  warning: AlertTriangle,
  offline: WifiOff,
};

export function Banner({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6",
        tones[tone],
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
