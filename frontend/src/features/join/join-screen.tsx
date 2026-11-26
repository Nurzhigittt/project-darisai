"use client";

import { ArrowLeft, Check, Clock3, LockKeyhole, ShieldCheck, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError, type JoinPreview } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { saveSession } from "@/lib/storage/db";
import { normalizeJoinCode } from "@/lib/utils";

type ScreenState = "checking" | "ready" | "invalid" | "ended" | "offline";

export function JoinScreen({ code }: { code: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const normalized = normalizeJoinCode(code);
  const [state, setState] = useState<ScreenState>("checking");
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (normalized.length !== 6) {
        setState("invalid");
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setState("offline");
        return;
      }
      try {
        const result = await api.previewJoin(normalized);
        if (!active) return;
        setPreview(result);
        setState(result.joinable ? "ready" : "ended");
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 404) setState("invalid");
        else if (caught instanceof ApiError && caught.status === 409) setState("ended");
        else setState("offline");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [normalized]);

  async function join() {
    if (!preview?.joinable) return;
    setJoining(true);
    setJoinError(null);
    try {
      const response = await api.join(normalized);
      const saved = await saveSession({
        lectureId: response.lecture.id,
        joinCode: normalized,
        signalToken: response.signal_token,
        replayToken: response.replay_token,
        lecture: response.lecture,
        wsUrl: response.ws_url,
        joinedAt: new Date().toISOString(),
        signalTokenExpiresAt: response.signal_token_expires_at,
        replayTokenExpiresAt: response.replay_token_expires_at,
        nextSeq: 1,
        cooldownUntil: 0,
      });
      if (!saved) {
        setJoinError(t("join.storageError"));
        setJoining(false);
        return;
      }
      router.replace(`/s/${response.lecture.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === "LECTURE_NOT_LIVE") setState("ended");
        else setJoinError(caught.message);
      } else {
        setJoinError(t("errors.network"));
      }
      setJoining(false);
    }
  }

  return (
    <div className="app-page">
      <header className="app-header">
        <div className="container-page flex items-center justify-between gap-3">
          <Logo />
          <ThemeSwitcher />
        </div>
      </header>
      <main id="main" className="container-page grid min-h-[calc(100dvh-5.5rem)] place-items-center py-8 sm:py-12">
        <div className="w-full min-w-0 max-w-xl">
          <Link
            href="/"
            className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("common.back")}
          </Link>
          <div className="app-panel app-panel-rose p-5 sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone="primary">
                <LockKeyhole aria-hidden className="size-3.5" />
                {t("join.title")}
              </Badge>
              <StatusIndicator
                state={online ? "ready" : "offline"}
                label={online ? t("common.online") : t("common.offline")}
              />
            </div>

            {!online ? (
              <Banner tone="offline" className="mt-6">
                {t("join.offline.body")}
              </Banner>
            ) : null}

            {state === "checking" ? (
              <div className="mt-8 space-y-4" aria-busy="true">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-12 w-4/5" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-12 w-full" />
                <p className="text-sm text-muted">{t("join.checking")}</p>
              </div>
            ) : null}

            {state === "invalid" ? (
              <div className="mt-8">
                <ErrorState
                  title={t("join.invalid.title")}
                  body={t("join.invalid.body")}
                  action={
                    <Link
                      href="/#join"
                      className="inline-flex min-h-11 items-center app-primary-button rounded-xl px-5 py-2.5 font-semibold text-primary-foreground"
                    >
                      {t("common.retry")}
                    </Link>
                  }
                />
              </div>
            ) : null}

            {state === "ended" ? (
              <div className="mt-8">
                <ErrorState
                  title={t("join.expired.title")}
                  body={t("join.expired.body")}
                  action={
                    <Link
                      href="/"
                      className="inline-flex min-h-11 items-center app-primary-button rounded-xl px-5 py-2.5 font-semibold text-primary-foreground"
                    >
                      {t("common.back")}
                    </Link>
                  }
                />
              </div>
            ) : null}

            {state === "offline" ? (
              <div className="mt-8">
                <ErrorState
                  title={t("join.offline.title")}
                  body={t("join.offline.body")}
                  action={
                    <Button onClick={() => window.location.reload()}>
                      {t("common.retry")}
                    </Button>
                  }
                />
              </div>
            ) : null}

            {state === "ready" && preview ? (
              <>
                <div className="mt-7 border-b border-border/70 pb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {t("join.course")}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {preview.lecture.course_title ?? t("join.lectureFallback")}
                  </p>
                  <h1
                    data-testid="lecture-title"
                    className="mt-3 break-words text-[clamp(2rem,5vw,3rem)] font-bold leading-[1.1]"
                  >
                    {preview.lecture.title}
                  </h1>
                  <p className="mt-4 inline-flex rounded-xl border border-primary/15 bg-surface/80 px-3 py-2 font-mono text-sm font-semibold tracking-[0.22em] text-primary-strong">
                    {normalized}
                  </p>
                </div>
                <ol className="mt-6 space-y-4 text-sm leading-6">
                  <li className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-positive/15 text-foreground">
                      <Check aria-hidden className="size-4" />
                    </span>
                    {t("join.ready")}
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Clock3 aria-hidden className="size-4" />
                    </span>
                    {preview.lecture.status === "scheduled"
                      ? t("join.scheduled")
                      : t("student.live")}
                  </li>
                  <li className="flex items-center gap-3 text-muted">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-border bg-surface/70">
                      <ShieldCheck aria-hidden className="size-3.5" />
                    </span>
                    {t("join.anonymous")}
                  </li>
                </ol>
                {joinError ? (
                  <Banner tone="warning" className="mt-5">
                    {joinError}
                  </Banner>
                ) : null}
                <Button
                  size="lg"
                  className="mt-7 w-full"
                  onClick={join}
                  loading={joining}
                >
                  {joining ? t("join.joining") : t("join.cta")}
                </Button>
                <p className="mt-3 text-center text-xs text-muted">
                  {t("join.waitForStart")}{" "}
                  <Link href="/privacy" className="font-semibold text-primary underline">
                    {t("join.privacy")}
                  </Link>
                </p>
              </>
            ) : null}

            {state === "ready" && !preview ? (
              <Banner tone="warning" className="mt-6">
                <WifiOff aria-hidden className="mr-1 inline size-4" />
                {t("errors.network")}
              </Banner>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
