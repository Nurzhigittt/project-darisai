"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { dictionaries, locales, type Dictionary, type Locale } from "./dictionaries";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function detectLocale(): Locale {
  const stored = window.localStorage.getItem("daris.locale");
  if (stored && (locales as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  const browser = window.navigator.language.toLowerCase();
  if (browser.startsWith("ru")) return "ru";
  if (browser.startsWith("kk") || browser.startsWith("kz")) return "kk";
  return "en";
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(vars[key] ?? `{${key}}`),
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const detected = detectLocale();
    setLocaleState(detected);
    document.documentElement.lang = detected;
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem("daris.locale", next);
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dictionary: Dictionary = dictionaries[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) =>
        interpolate(dictionary[key] ?? dictionaries.en[key] ?? key, vars),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
