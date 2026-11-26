"use client";

import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { useI18n } from "@/lib/i18n";

export function OfflineContent() {
  const { t } = useI18n();
  return (
    <div className="app-page grid place-items-center px-4 py-10 sm:px-6">
      <div className="app-hero w-full max-w-xl text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div
          aria-hidden
          className="mx-auto mt-8 grid size-24 place-items-center rounded-3xl border border-primary/15 bg-surface/80 shadow-soft"
        >
          <span className="size-12 rounded-full border-4 border-dashed border-primary/60" />
        </div>
        <h1 className="mt-7 text-[clamp(1.9rem,5vw,2.6rem)] font-bold leading-tight">{t("pwa.offline")}</h1>
        <p className="mt-3 leading-7 text-muted">{t("pwa.offlineBody")}</p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center app-primary-button rounded-2xl px-6 font-semibold text-primary-foreground shadow-soft"
        >
          {t("common.back")}
        </Link>
      </div>
    </div>
  );
}
