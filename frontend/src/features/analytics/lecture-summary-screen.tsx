"use client";

import {
  ArrowLeft,
  BarChart3,
  Clock3,
  Info,
  LockKeyhole,
  Radio,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError, type Summary } from "@/lib/api/client";
import {
  clearProfessorSession,
  getProfessorSession,
} from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";
import { cn, formatDuration, formatOffset } from "@/lib/utils";

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-bold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

export function LectureSummaryScreen({ lectureId }: { lectureId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const session = getProfessorSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    api
      .getSummary(session.accessToken, lectureId)
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 401) {
          clearProfessorSession();
          router.replace("/login");
        } else {
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lectureId, router]);

  const maxSignals = Math.max(1, ...(summary?.timeline.map((item) => item.signals) ?? [1]));

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface/70">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>
      <main id="main" className="container-page py-10">
        <Link
          href="/professor"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("prof.home.recent")}
        </Link>

        {loading ? (
          <div className="mt-8 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-16 w-3/4" />
            <div className="grid gap-4 md:grid-cols-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        ) : error || !summary ? (
          <div className="mt-8">
            <ErrorState
              title={t("errors.generic")}
              body={t("errors.notFound")}
              action={<Button onClick={() => router.refresh()}>{t("common.retry")}</Button>}
            />
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge tone={summary.status === "ended" ? "neutral" : "positive"}>
                {summary.status === "ended" ? t("student.ended") : t("student.live")}
              </Badge>
              <Badge tone="primary">{t("summary.factual")}</Badge>
            </div>
            <h1 className="mt-4 text-[clamp(2.2rem,5vw,3.8rem)] font-extrabold leading-tight">
              {summary.title}
            </h1>
            <p className="mt-2 text-muted">{t("summary.title")}</p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                icon={<Clock3 aria-hidden className="size-4" />}
                label={t("summary.duration")}
                value={formatDuration(summary.duration_ms)}
              />
              <div data-testid="accepted-signals">
                <Stat
                  icon={<Radio aria-hidden className="size-4" />}
                  label={t("summary.signals")}
                  value={String(summary.accepted_signals)}
                />
              </div>
              <Stat
                icon={<Users aria-hidden className="size-4" />}
                label={t("summary.participants")}
                value={summary.unique_participants === null ? "—" : String(summary.unique_participants)}
              />
              <Stat
                icon={<Waves aria-hidden className="size-4" />}
                label={t("summary.clusters")}
                value={String(summary.clusters.length)}
              />
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary-soft/40 p-4 text-sm leading-6">
              <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <p>{t("summary.note")}</p>
            </div>

            <section className="mt-8 rounded-4xl border border-border bg-surface p-6 shadow-soft sm:p-8">
              <div className="flex items-center gap-2">
                <BarChart3 aria-hidden className="size-5 text-primary" />
                <h2 className="text-xl font-bold">{t("summary.timeline")}</h2>
              </div>
              {summary.timeline.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    icon={<BarChart3 aria-hidden className="size-6" />}
                    title={t("summary.noBuckets")}
                    body={t("summary.note")}
                  />
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-border bg-gradient-to-b from-background to-surface p-4">
                  <div
                    className="relative flex h-48 items-end gap-2 overflow-x-auto px-1 pb-7 pt-6"
                    role="img"
                    aria-label={`${t("summary.timeline")}: ${summary.timeline
                      .map((item) => `minute ${item.minute}: ${item.signals} signals`)
                      .join(", ")}`}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-4 bottom-7 top-6 flex flex-col justify-between"
                    >
                      {[0, 1, 2, 3].map((line) => (
                        <span key={line} className="block border-t border-border/60" />
                      ))}
                    </div>
                    <div
                      className={cn(
                        "relative flex h-full w-full items-end gap-2",
                        summary.timeline.length < 8 && "justify-center",
                      )}
                    >
                      {summary.timeline.map((item) => (
                        <div
                          key={item.minute_start_ms}
                          className="group relative flex h-full min-w-10 max-w-16 flex-1 flex-col items-center justify-end"
                        >
                          <span className="mb-1 font-mono text-[10px] font-bold text-muted">
                            {item.signals}
                          </span>
                          <div
                            className="w-full rounded-t-md bg-primary/75 shadow-[0_0_18px_-8px_var(--primary)] transition-colors group-hover:bg-primary"
                            style={{
                              height: `${Math.max(8, (item.signals / maxSignals) * 150)}px`,
                            }}
                          />
                          <span className="absolute -bottom-6 text-[10px] text-muted">
                            {item.minute}
                          </span>
                          <span className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
                            {item.signals} · {item.unique} {t("summary.unique")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <p className="mt-4 text-xs text-muted">{t("summary.timelineNote")}</p>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-4xl border border-border bg-surface p-6 shadow-soft sm:p-8">
                <div className="flex items-center gap-2">
                  <Waves aria-hidden className="size-5 text-ripple-warm" />
                  <h2 className="text-xl font-bold">{t("summary.moments")}</h2>
                </div>
                {summary.clarification_moments.length === 0 ? (
                  <p className="mt-4 text-sm leading-6 text-muted">
                    {t("summary.noMoments")}
                  </p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {summary.clarification_moments.map((cluster) => (
                      <li
                        key={cluster.cluster_id}
                        className="rounded-2xl border border-border bg-background p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-mono text-lg font-bold tabular-nums">
                            {formatOffset(cluster.start_ms)} –{" "}
                            {cluster.end_ms ? formatOffset(cluster.end_ms) : t("student.live")}
                          </p>
                          <Badge tone="attention">
                            {cluster.unique_tokens} {t("summary.unique")}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          {t("summary.peakIntensity")}{" "}
                          <span className="font-mono font-semibold">
                            {(cluster.peak_intensity * 100).toFixed(0)}%
                          </span>{" "}
                          · aggregate only
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-4xl border border-dashed border-border p-6 sm:p-8">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Sparkles aria-hidden className="size-5" />
                </div>
                <h2 className="mt-5 text-xl font-bold">{t("summary.futureAI")}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {t("summary.futureAIBody")}
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs text-muted">
                  <LockKeyhole aria-hidden className="size-4" />
                  {t("summary.noLlm")}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    href={`/p/${lectureId}`}
                    className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-primary-soft/60"
                  >
                    {t("summary.back")}
                  </Link>
                  <Link
                    href="/professor"
                    className="inline-flex min-h-10 items-center rounded-xl bg-primary px-3 text-sm font-semibold text-white"
                  >
                    {t("prof.home.recent")}
                  </Link>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
