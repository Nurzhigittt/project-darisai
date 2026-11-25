"use client";

import { Check, LoaderCircle, Pause, WifiOff, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SignalVisualState =
  | "connecting"
  | "ready"
  | "sending"
  | "accepted"
  | "cooldown"
  | "offline"
  | "paused"
  | "ended"
  | "error";

type Props = {
  state: SignalVisualState;
  cooldownRemainingMs?: number;
  cooldownTotalMs?: number;
  onClick: () => void;
  disabled?: boolean;
};

const stateClasses: Record<SignalVisualState, string> = {
  connecting: "border-border bg-surface text-muted",
  ready:
    "border-ripple-low/35 bg-ripple-low text-[#0d2b1d] shadow-[0_0_70px_-18px_var(--ripple-low)] hover:brightness-105",
  sending: "border-primary/30 bg-primary text-primary-foreground",
  accepted: "border-positive/40 bg-positive text-[#102a1e]",
  cooldown: "border-border bg-surface-raised text-foreground",
  offline: "border-border bg-surface text-muted",
  paused: "border-ripple-attention/40 bg-ripple-attention/20 text-foreground",
  ended: "border-border bg-surface text-muted",
  error: "border-ripple-warm/40 bg-ripple-warm/10 text-foreground",
};

export function SignalButton({
  state,
  cooldownRemainingMs = 0,
  cooldownTotalMs = 15_000,
  onClick,
  disabled,
}: Props) {
  const { t } = useI18n();
  const label =
    state === "sending"
      ? t("student.sending")
      : state === "accepted"
        ? t("student.accepted")
        : state === "cooldown"
          ? t("student.cooldownShort")
          : state === "offline"
            ? t("student.offline")
            : state === "paused"
              ? t("student.paused")
              : state === "ended"
                ? t("student.ended")
                : state === "error"
                  ? t("errors.generic")
                  : state === "connecting"
                    ? t("common.connecting")
                    : t("student.signal");
  const interactive = state === "ready" && !disabled;
  const progress =
    state === "cooldown"
      ? Math.max(0, Math.min(1, cooldownRemainingMs / Math.max(1, cooldownTotalMs)))
      : 0;
  const circumference = 2 * Math.PI * 47;
  const icon =
    state === "sending" || state === "connecting" ? (
      <LoaderCircle aria-hidden className="size-9 animate-spin" />
    ) : state === "accepted" ? (
      <Check aria-hidden className="size-10" />
    ) : state === "offline" ? (
      <WifiOff aria-hidden className="size-9" />
    ) : state === "paused" ? (
      <Pause aria-hidden className="size-9" />
    ) : state === "ended" || state === "error" ? (
      <X aria-hidden className="size-9" />
    ) : (
      <span
        aria-hidden
        className="relative flex size-16 items-center justify-center rounded-full border-2 border-current/25"
      >
        <span className="size-9 rounded-full border-2 border-current/40" />
        <span className="absolute size-4 rounded-full bg-current" />
      </span>
    );

  return (
    <div className="relative flex flex-col items-center">
      {state === "ready" ? (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-ripple-low/20 blur-2xl motion-safe:animate-breathe"
        />
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!interactive) return;
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try {
              navigator.vibrate?.(25);
            } catch {
              // Haptics are opportunistic; visual feedback is authoritative.
            }
          }
          onClick();
        }}
        disabled={!interactive}
        aria-disabled={!interactive}
        aria-label={label}
        data-testid="signal-button"
        data-state={state}
        className={cn(
          "relative grid size-[min(76vw,300px)] touch-manipulation place-items-center rounded-full border-2",
          "transition-[transform,background-color,box-shadow] duration-200",
          interactive ? "active:scale-[0.97]" : "cursor-default",
          stateClasses[state],
        )}
      >
        {state === "cooldown" ? (
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            className="absolute inset-2 size-[calc(100%-1rem)] -rotate-90"
          >
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="var(--border)"
              strokeWidth="2.5"
            />
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
        ) : null}
        <span className="flex flex-col items-center gap-3 px-8 text-center">
          {icon}
          <span className="text-balance text-[clamp(1.25rem,5vw,1.75rem)] font-extrabold leading-tight tracking-tight">
            {label}
          </span>
          {state === "cooldown" && cooldownRemainingMs > 0 ? (
            <span className="text-sm font-semibold tabular-nums opacity-80">
              {Math.ceil(cooldownRemainingMs / 1000)}
              {t("common.secondShort")}
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
