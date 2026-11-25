import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-surface shadow-lift hover:bg-primary-strong active:translate-y-px",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-primary-soft/60 active:translate-y-px",
  ghost: "text-foreground hover:bg-primary-soft/60",
  danger:
    "bg-ripple-warm text-white hover:brightness-95 active:translate-y-px",
  quiet: "bg-primary-soft text-foreground hover:bg-primary-soft/80",
};

const sizes: Record<Size, string> = {
  sm: "min-h-10 px-3.5 py-2 text-sm rounded-xl gap-2",
  md: "min-h-11 px-5 py-2.5 text-[15px] rounded-xl gap-2",
  lg: "min-h-12 px-6 py-3 text-base rounded-2xl gap-2.5",
  xl: "min-h-14 px-7 py-4 text-lg rounded-2xl gap-3",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : null}
      {children}
    </button>
  );
});
