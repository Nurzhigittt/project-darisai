"use client";

import { Languages } from "lucide-react";

import { locales, type Locale } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const labels: Record<Locale, string> = { en: "English", ru: "Русский", kk: "Қазақша" };

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("language.label")}</span>
      <Languages aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-muted" />
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="min-h-10 cursor-pointer appearance-none rounded-full border border-border bg-surface py-1.5 pl-8 pr-7 text-xs font-semibold text-foreground"
      >
        {locales.map((item) => (
          <option key={item} value={item}>
            {labels[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
