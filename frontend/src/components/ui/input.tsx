"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  hideLabel?: boolean;
};

export function Input({
  id,
  label,
  hint,
  error,
  leading,
  trailing,
  hideLabel,
  className,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className={cn(
          "block text-sm font-semibold text-foreground",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-xl border bg-surface px-4 transition-colors",
          error
            ? "border-ripple-warm"
            : "border-border focus-within:border-primary",
        )}
      >
        {leading ? <span className="text-muted">{leading}</span> : null}
        <input
          id={inputId}
          className={cn(
            "min-w-0 flex-1 bg-transparent py-3 text-base text-foreground outline-none",
            "placeholder:text-muted/75",
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...props}
        />
        {trailing ? <span className="text-muted">{trailing}</span> : null}
      </div>
      {hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-sm font-medium text-ripple-warm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
