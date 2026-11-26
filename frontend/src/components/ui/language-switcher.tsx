"use client";

import { ChevronDown } from "lucide-react";

import { locales, type Locale } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const labels: Record<Locale, string> = { en: "EN", ru: "RU", kk: "KK" };

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="min-h-11 w-16 cursor-pointer appearance-none rounded-xl border border-transparent bg-transparent py-2 pl-2 pr-6 text-sm font-medium text-foreground"
      >
        {locales.map((item) => (
          <option key={item} value={item} className="bg-surface text-foreground">
            {labels[item]}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-muted" />
    </label>
  );
}
