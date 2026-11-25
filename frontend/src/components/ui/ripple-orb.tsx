"use client";

import { useId } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type RippleState = "connected" | "rising" | "cluster" | "recovering";
export type RippleAvailability =
  | "ok"
  | "insufficient_participation"
  | "connection_unavailable";

type Props = {
  state: RippleState;
  availability: RippleAvailability;
  intensity: number;
  statusLabel: string;
  size?: "md" | "lg";
};

const colorByState: Record<RippleState, string> = {
  connected: "var(--ripple-low)",
  rising: "var(--ripple-attention)",
  cluster: "var(--ripple-warm)",
  recovering: "var(--ripple-low)",
};

export function RippleOrb({
  state,
  availability,
  intensity,
  statusLabel,
  size = "lg",
}: Props) {
  const { t } = useI18n();
  const gradientId = useId().replace(/:/g, "");
  const unavailable = availability === "connection_unavailable";
  const color = unavailable ? "var(--muted)" : colorByState[state];
  const label = unavailable
    ? t("ripple.connection_unavailable")
    : t(`ripple.${statusLabel}`);
  const scale = 0.88 + Math.min(1, Math.max(0, intensity)) * 0.14;
  const dimension = size === "lg" ? "size-[min(70vw,380px)]" : "size-48";

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className={cn("relative grid place-items-center", dimension)}
        style={{ ["--ripple-color" as string]: color }}
        role="img"
        aria-label={t("ripple.aria", { label })}
      >
        <span
          aria-hidden
          className="absolute inset-[6%] rounded-full blur-3xl transition-opacity duration-700"
          style={{
            background: color,
            opacity: unavailable ? 0.08 : 0.18 + intensity * 0.32,
          }}
        />
        {!unavailable ? (
          <>
            <span
              aria-hidden
              className="absolute inset-[12%] rounded-full border motion-safe:animate-ripple"
              style={{ borderColor: color, opacity: 0.28 }}
            />
            <span
              aria-hidden
              className="absolute inset-[22%] rounded-full border motion-safe:animate-ripple [animation-delay:1.2s]"
              style={{ borderColor: color, opacity: 0.2 }}
            />
          </>
        ) : null}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 size-full transition-transform duration-700 ease-out"
          style={{ transform: `scale(${unavailable ? 0.92 : scale})` }}
          aria-hidden
        >
          <defs>
            <radialGradient id={gradientId} cx="46%" cy="40%" r="62%">
              <stop offset="0%" stopColor="var(--surface)" stopOpacity="0.9" />
              <stop offset="58%" stopColor={color} stopOpacity="0.34" />
              <stop offset="100%" stopColor={color} stopOpacity="0.08" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="92" fill={`url(#${gradientId})`} />
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke={color}
            strokeOpacity={unavailable ? 0.35 : 0.55}
            strokeWidth="1.5"
          />
          <circle
            cx="100"
            cy="100"
            r="58"
            fill="none"
            stroke={color}
            strokeOpacity="0.4"
            strokeWidth="1.2"
          />
          <circle
            cx="100"
            cy="100"
            r="34"
            fill={color}
            fillOpacity={unavailable ? 0.22 : 0.72 + intensity * 0.22}
          />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-[clamp(1.35rem,4vw,2rem)] font-extrabold tracking-tight">
          {label}
        </p>
        <p className="mt-1 text-sm text-muted">{t("prof.live.updated")}</p>
      </div>
    </div>
  );
}
