"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  code: string;
  title: string;
  className?: string;
  size?: number;
  showInstructions?: boolean;
  presentationHref?: string;
};

export function QRCodePanel({
  value,
  code,
  title,
  className,
  size = 220,
  showInstructions = true,
  presentationHref,
}: Props) {
  const { t } = useI18n();
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      push({ title: t("common.copied"), tone: "success" });
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      push({
        title: t("common.copy"),
        description: value,
        tone: "info",
      });
    }
  }

  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className="rounded-3xl border border-border bg-white p-5 shadow-lift">
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          bgColor="#FFFFFF"
          fgColor="#26233A"
          marginSize={2}
          aria-label={`QR code joining ${title}`}
          role="img"
        />
      </div>
      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-muted">
        {t("prof.live.code")}
      </p>
      <p
        data-testid="join-code"
        className="mt-1 font-mono text-[clamp(2rem,7vw,3rem)] font-extrabold tracking-[0.18em] text-foreground"
      >
        {code}
      </p>
      {showInstructions ? (
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
          {t("prof.live.joinBody")}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={copyCode}>
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
        {presentationHref ? (
          <a
            href={presentationHref}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-primary-soft/60"
          >
            <ExternalLink aria-hidden className="size-4" />
            {t("prof.live.present")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
