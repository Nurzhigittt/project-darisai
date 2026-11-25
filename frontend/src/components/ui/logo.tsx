import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  light = false,
  className,
}: {
  href?: string | null;
  light?: boolean;
  className?: string;
}) {
  const mark = (
    <span className="inline-flex items-center gap-3">
      <span
        aria-hidden
        className={cn(
          "relative grid size-9 place-items-center rounded-full border",
          light ? "border-white/25 bg-white/10" : "border-primary/20 bg-primary-soft",
        )}
      >
        <span
          className={cn(
            "absolute size-6 rounded-full border",
            light ? "border-white/45" : "border-primary/45",
          )}
        />
        <span
          className={cn(
            "absolute size-3.5 rounded-full",
            light ? "bg-accent" : "bg-primary",
          )}
        />
      </span>
      <span
        className={cn(
          "text-lg font-extrabold tracking-[-0.04em]",
          light ? "text-white" : "text-foreground",
        )}
      >
        DärisAI
      </span>
    </span>
  );
  if (!href) return <span className={className}>{mark}</span>;
  return (
    <Link href={href} className={cn("rounded-lg", className)} aria-label="DärisAI home">
      {mark}
    </Link>
  );
}
