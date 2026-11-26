"use client";

import { BookOpen, Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { InsightContentView } from "@/features/brief/insight-content";
import { api, ApiError, type HandoffPublic } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

type ErrorKind = "missing" | "invalid" | "unavailable" | "network" | "rateLimit" | "server";
type View =
  | { status: "loading" }
  | { status: "ready"; handoff: HandoffPublic }
  | { status: "error"; kind: ErrorKind };

function errorKind(error: unknown): ErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 404 || error.status === 410) return "unavailable";
    if (error.status === 400 || error.status === 422) return "invalid";
    if (error.status === 429) return "rateLimit";
    if (error.status === 0) return "network";
  }
  return "server";
}

export function HandoffScreen() {
  const { t, locale } = useI18n();
  const [view, setView] = useState<View>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const updateLink = () => setAttempt((value) => value + 1);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("hashchange", updateLink);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("hashchange", updateLink);
    };
  }, []);

  useEffect(() => {
    // Keep credentials in the fragment only. Never copy them into a query,
    // browser storage, rendered error text or an authenticated professor call.
    const tokens = new URLSearchParams(window.location.hash.slice(1)).getAll("token");
    const token = tokens[0];
    if (!token) {
      setView({ status: "error", kind: "missing" });
      return;
    }
    if (tokens.length !== 1 || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
      setView({ status: "error", kind: "invalid" });
      return;
    }
    if (!navigator.onLine) {
      setView({ status: "error", kind: "network" });
      return;
    }

    let active = true;
    const controller = new AbortController();
    setView({ status: "loading" });

    // React StrictMode runs setup/cleanup/setup before this microtask. Only
    // the still-active effect sends a request, and obsolete results stay hidden.
    queueMicrotask(() => {
      if (!active) return;
      void api.redeemHandoff(token, controller.signal).then(
        (handoff) => {
          if (active) setView({ status: "ready", handoff });
        },
        (error: unknown) => {
          if (active) setView({ status: "error", kind: errorKind(error) });
        },
      );
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const retryable = view.status === "error" &&
    (view.kind === "network" || view.kind === "rateLimit" || view.kind === "server");

  return (
    <div className="app-page">
      <header className="app-header safe-top">
        <div className="container-page flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main id="main" className="container-page max-w-5xl py-8 sm:py-12">
        <div className="app-hero">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/15 bg-surface/70 text-primary">
            <BookOpen aria-hidden className="size-7" />
          </div>
          <h1 className="mt-6 text-[clamp(2rem,5vw,3.75rem)] font-bold leading-tight tracking-tight">
            {t("handoff.title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
            {t("handoff.intro")}
          </p>
        </div>

        {!online ? <Banner tone="offline" className="mt-6">{t("handoff.offline")}</Banner> : null}

        <div className="mt-8">
          {view.status === "loading" ? (
            <div role="status" aria-live="polite" className="app-panel space-y-5 p-6 sm:p-8">
              <p className="text-sm text-muted">{t("handoff.loading")}</p>
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-64" />
            </div>
          ) : view.status === "error" ? (
            <ErrorState
              title={t(`handoff.error.${view.kind}.title`)}
              body={t(`handoff.error.${view.kind}.body`)}
              action={retryable ? (
                <Button disabled={!online} onClick={() => setAttempt((value) => value + 1)}>
                  <RefreshCw aria-hidden className="size-4" />
                  {t("common.retry")}
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-6">
              <div className="app-panel app-panel-mint p-5 sm:p-6">
                <p className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-semibold text-foreground">
                  <Check aria-hidden className="size-4 shrink-0" />
                  {t("handoff.published")}
                </p>
                <p lang={view.handoff.language} className="mt-4 break-words text-xl font-bold leading-snug tracking-tight">
                  {view.handoff.lecture_title}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {t("handoff.expires", {
                    time: new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium", timeStyle: "short",
                    }).format(new Date(view.handoff.expires_at)),
                  })}
                </p>
              </div>
              <Card lang={view.handoff.language} className="break-words p-5 sm:p-8 lg:p-10">
                <InsightContentView content={view.handoff} />
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
