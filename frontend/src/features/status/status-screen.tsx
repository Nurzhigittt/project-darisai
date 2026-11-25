"use client";

import { Activity, CircleDot, Database, Radio, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Status } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

const tone = {
  ok: "positive",
  degraded: "attention",
  unavailable: "danger",
} as const;

const componentTone = {
  available: "positive",
  degraded: "attention",
  unavailable: "danger",
} as const;

export function StatusScreen() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await api.getStatus();
      setStatus(result);
      setCheckedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const overallLabel =
    status?.status === "ok"
      ? t("status.ok")
      : status?.status === "degraded"
        ? t("status.degraded")
        : t("status.down");

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="container-page py-12 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Activity aria-hidden className="size-6" />
            </div>
            <h1 className="mt-6 text-[clamp(2.5rem,5vw,3.8rem)] font-extrabold leading-tight">
              {t("status.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-muted">{t("status.intro")}</p>
          </div>
          <Button variant="secondary" onClick={() => void load()} loading={loading}>
            <RefreshCw aria-hidden className="size-4" />
            {t("status.refresh")}
          </Button>
        </div>

        {loading && !status ? (
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : error || !status ? (
          <div className="mt-10">
            <ErrorState
              title={t("status.unavailable")}
              body={t("errors.network")}
              action={<Button onClick={() => void load()}>{t("common.retry")}</Button>}
            />
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6 shadow-soft">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                  {t("status.overall")}
                </p>
                <p className="mt-1 text-xl font-bold">{overallLabel}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={tone[status.status]}>{status.status}</Badge>
                <span className="text-xs text-muted">
                  {checkedAt
                    ? t("status.updated", { time: checkedAt.toLocaleTimeString() })
                    : ""}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {status.components.map((component) => (
                <div
                  key={component.name}
                  className="rounded-3xl border border-border bg-surface p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {component.name === "PostgreSQL" ? (
                        <Database aria-hidden className="size-5 text-primary" />
                      ) : component.name === "Redis" ? (
                        <CircleDot aria-hidden className="size-5 text-primary" />
                      ) : (
                        <Radio aria-hidden className="size-5 text-primary" />
                      )}
                      <h2 className="font-bold">{component.name}</h2>
                    </div>
                    <Badge tone={componentTone[component.status]}>
                      {component.status}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {component.detail ?? t("status.probe")}
                  </p>
                  {typeof component.latency_ms === "number" ? (
                    <p className="mt-3 font-mono text-2xl font-bold tabular-nums">
                      {component.latency_ms.toFixed(1)}
                      <span className="ml-1 text-xs font-normal text-muted">ms</span>
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-muted">{t("status.noLatency")}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
                  {t("status.connections")}
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold">
                  {status.websocket_connections}
                </p>
              </div>
              <div className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
                  {t("status.signals")}
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold">
                  {status.accepted_signals_total}
                </p>
              </div>
              <div className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
                  {t("status.rejected")}
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold">
                  {status.rejected_signals_total}
                </p>
              </div>
            </div>

            <section className="mt-8 rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">{t("status.limits")}</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(status.limits ?? {}).map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-2">
                    <dt className="font-mono text-xs text-muted">{key}</dt>
                    <dd className="font-mono text-sm font-bold">{String(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-muted">{t("status.processNote")}</p>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
