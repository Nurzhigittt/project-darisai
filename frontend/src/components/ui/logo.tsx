import Image from "next/image";
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
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/icons/daris-192.png"
        alt=""
        width={36}
        height={36}
        className={cn(
          "size-9 rounded-[10px]",
          light && "ring-1 ring-white/25",
        )}
        priority
      />
      <span
        className={cn(
          "text-xl font-bold tracking-[-0.045em]",
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
