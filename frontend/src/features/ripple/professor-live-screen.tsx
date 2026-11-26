"use client";

import {
  ArrowLeft,
  BarChart3,
  Clock3,
  Expand,
  Pause,
  Play,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { QRCodePanel } from "@/components/ui/qr-code-panel";
import {
  RippleOrb,
  type RippleAvailability,
  type RippleState,
} from "@/components/ui/ripple-orb";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useToast } from "@/components/ui/toast";
import {
  api,
  ApiError,
  type Lecture,
} from "@/lib/api/client";
import {
  clearProfessorSession,
  getProfessorSession,
  type ProfessorSession,
} from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";
import { formatDuration } from "@/lib/utils";
import {
  DarisSocket,
  type HelloOkPayload,
  type LectureStatePayload,
  type RipplePayload,
  type WsEvent,
  type WsStatus,
} from "@/lib/ws/client";

type RippleView = {
  state: RippleState;
  availability: RippleAvailability;
  intensity: number;
  statusLabel: string;
  active: number;
  unique: number;
  threshold: number;
  windowMs: number;
};

const initialRipple: RippleView = {
  state: "connected",
  availability: "connection_unavailable",
  intensity: 0,
  statusLabel: "connection_unavailable",
  active: 0,
  unique: 0,
  threshold: 3,
  windowMs: 20_000,
};

export function ProfessorLiveScreen({ lectureId }: { lectureId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { push } = useToast();
  const [session, setSession] = useState<ProfessorSession | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [lectureReady, setLectureReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [ripple, setRipple] = useState<RippleView>(initialRipple);
  const [offsetMs, setOffsetMs] = useState(0);
  const [syncedAt, setSyncedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const socketRef = useRef<DarisSocket | null>(null);
  const lectureRef = useRef<Lecture | null>(null);
  const eventRef = useRef<(event: WsEvent) => void>(() => {});
  const statusRef = useRef<(status: WsStatus) => void>(() => {});

  const handleApiFailure = useCallback(
    (caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) {
        clearProfessorSession();
        router.replace("/login");
        return;
      }
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError(t("errors.network"));
      }
    },
    [router, t],
  );

  useEffect(() => {
    const activeSession = getProfessorSession();
    if (!activeSession) {
      router.replace("/login");
      return;
    }
    setSession(activeSession);
    const accessToken = activeSession.accessToken;
    let cancelled = false;
    async function load() {
      try {
        const result = await api.getLecture(accessToken, lectureId);
        if (cancelled) return;
        setLecture(result);
        lectureRef.current = result;
        setLectureReady(true);
        setOffsetMs(result.offset_ms);
        setSyncedAt(Date.now());
        if (result.status === "ended") router.replace(`/summary/${lectureId}`);
      } catch (caught) {
        if (!cancelled) handleApiFailure(caught);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [handleApiFailure, lectureId, router]);

  useEffect(() => {
    lectureRef.current = lecture;
  }, [lecture]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    eventRef.current = (event: WsEvent) => {
      if (event.type === "hello_ok") {
        const payload = event.payload as unknown as HelloOkPayload;
        setOffsetMs(payload.offset_ms);
        setSyncedAt(Date.now());
        setLecture((current) =>
          current ? { ...current, status: payload.lecture_status } : current,
        );
      } else if (event.type === "ripple_update") {
        const payload = event.payload as unknown as RipplePayload;
        setRipple({
          state: payload.state,
          availability: payload.availability,
          intensity: payload.intensity,
          statusLabel: payload.status_label,
          active: payload.active_participants,
          unique: payload.unique_in_window,
          threshold: payload.threshold,
          windowMs: payload.window_ms,
        });
      } else if (event.type === "lecture_state") {
        const payload = event.payload as unknown as LectureStatePayload;
        setOffsetMs(payload.offset_ms);
        setSyncedAt(Date.now());
        setLecture((current) =>
          current ? { ...current, status: payload.status } : current,
        );
        if (payload.status === "ended") setEndOpen(false);
      } else if (event.type === "error") {
        const payload = event.payload as { code?: string; message?: string };
        push({
          title: t("ws.error"),
          description: payload.message,
          tone: "error",
        });
      }
    };
    statusRef.current = (status) => setWsStatus(status);
  }, [push, t]);

  useEffect(() => {
    if (!session || !lectureReady || !lectureRef.current) return;
    if (lectureRef.current.status === "ended") return;
    if (new Date(session.expiresAt * 1000).getTime() <= Date.now()) {
      clearProfessorSession();
      router.replace("/login");
      return;
    }
    const socket = new DarisSocket({
      url: "",
      lectureId,
      role: "professor",
      token: session.accessToken,
      onEvent: (event) => eventRef.current(event),
      onStatus: (status) => statusRef.current(status),
    });
    socketRef.current = socket;
    socket.connect();
    return () => {
      socket.dispose();
      socketRef.current = null;
    };
  }, [lectureId, lectureReady, router, session]);

  async function control(action: "start" | "pause" | "resume" | "end") {
    if (!session) return;
    setBusyAction(action);
    try {
      const response = await api.controlLecture(session.accessToken, lectureId, action);
      setOffsetMs(response.offset_ms);
      setSyncedAt(Date.now());
      setLecture((current) =>
        current ? { ...current, status: response.status, started_at: response.started_at, ended_at: response.ended_at } : current,
      );
      setEndOpen(false);
      if (action === "end") {
        router.push(`/summary/${lectureId}`);
      } else {
        push({
          title: t(
            action === "start"
              ? "prof.live.started"
              : action === "pause"
                ? "prof.live.paused"
                : "prof.live.resumed",
          ),
          tone: "success",
        });
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearProfessorSession();
        router.replace("/login");
      } else if (caught instanceof ApiError) {
        push({ title: t("errors.generic"), description: caught.message, tone: "error" });
      } else {
        push({ title: t("errors.network"), tone: "error" });
      }
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="container-page flex h-16 items-center justify-between">
          <Logo />
          <ThemeSwitcher />
        </header>
        <main className="container-page grid gap-6 py-10 lg:grid-cols-2">
          <Skeleton className="h-[460px] w-full" />
          <Skeleton className="h-[460px] w-full" />
        </main>
      </div>
    );
  }

  if (!lecture || error) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="container-page flex h-16 items-center justify-between">
          <Logo />
          <ThemeSwitcher />
        </header>
        <main id="main" className="container-page py-12">
          <ErrorState
            title={t("errors.generic")}
            body={error ?? t("errors.notFound")}
            action={
              <Button onClick={() => router.refresh()}>{t("common.retry")}</Button>
            }
          />
        </main>
      </div>
    );
  }

  const live = lecture.status === "live";
  const paused = lecture.status === "paused";
  const scheduled = lecture.status === "scheduled";
  const elapsed = offsetMs + (live ? Math.max(0, now - syncedAt) : 0);
  const rippleAvailability: RippleAvailability =
    wsStatus === "ready" ? ripple.availability : "connection_unavailable";
  const connected = wsStatus === "ready";

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface/65">
        <div className="container-page flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <span className="hidden text-sm text-muted sm:block">
              {session?.name ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeSwitcher />
            <Link
              href="/professor"
              className="ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-primary-soft/60"
            >
              <ArrowLeft aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t("common.back")}</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="container-page py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={live ? "positive" : paused ? "attention" : "primary"}>
                {scheduled
                  ? t("lecture.scheduled")
                  : live
                    ? t("prof.live.started")
                    : paused
                      ? t("prof.live.paused")
                      : t("prof.live.ended")}
              </Badge>
              <StatusIndicator
                state={connected ? "ready" : wsStatus === "connecting" ? "connecting" : "offline"}
                label={
                  connected
                    ? t("ws.ready")
                    : wsStatus === "reconnecting"
                      ? t("ws.reconnecting")
                      : t("ws.offline")
                }
              />
            </div>
            <h1 className="mt-3 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-tight">
              {lecture.title}
            </h1>
            <p className="mt-1 text-sm text-muted">{lecture.course_title ?? ""}</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
            <Clock3 aria-hidden className="size-5 text-primary" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {t("prof.live.elapsed")}
              </p>
              <p className="font-mono text-xl font-semibold tabular-nums">
                {formatDuration(elapsed)}
              </p>
            </div>
          </div>
        </div>

        {!connected ? (
          <Banner tone="offline" className="mt-5">
            {t("prof.live.connectionLost")}
          </Banner>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="relative flex min-h-[430px] flex-col items-center justify-center overflow-hidden rounded-4xl border border-border bg-surface p-6 shadow-soft sm:min-h-[520px] sm:p-10">
            <div
              aria-hidden
              className="absolute inset-x-1/4 top-10 h-64 rounded-full bg-positive/10 blur-3xl"
            />
            <Badge tone="neutral" className="absolute left-5 top-5">
              {t("prof.live.status")}
            </Badge>
            <RippleOrb
              state={ripple.state}
              availability={rippleAvailability}
              intensity={ripple.intensity}
              statusLabel={
                connected ? ripple.statusLabel : "connection_unavailable"
              }
            />
            <p className="mt-6 max-w-md text-center text-sm leading-6 text-muted">
              {t("prof.live.signalsNote")}
            </p>
            <details className="mt-7 w-full max-w-md rounded-2xl border border-border bg-background/70 p-4 text-sm">
              <summary className="cursor-pointer font-semibold">
                {t("prof.live.details")}
              </summary>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted">
                    {t("prof.live.uniqueWindow")}
                  </dt>
                  <dd data-testid="ripple-unique" className="mt-1 font-mono text-lg font-semibold">
                    {ripple.unique}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted">
                    {t("prof.live.active")}
                  </dt>
                  <dd data-testid="ripple-active" className="mt-1 font-mono text-lg font-semibold">
                    {ripple.active}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted">
                    {t("prof.live.threshold")}
                  </dt>
                  <dd className="mt-1 font-mono text-lg font-semibold">{ripple.threshold}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">{t("prof.live.detailsNote")}</p>
            </details>
          </section>

          <section className="flex flex-col gap-5">
            <div className="rounded-4xl border border-border bg-surface p-6 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{t("prof.live.joinTitle")}</h2>
                <Link
                  href={`/p/${lectureId}/present`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary hover:bg-primary-soft"
                >
                  <Expand aria-hidden className="size-4" />
                  {t("prof.live.present")}
                </Link>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{t("prof.live.joinBody")}</p>
              <div className="mt-4">
                <QRCodePanel
                  value={lecture.join_url}
                  code={lecture.join_code}
                  title={lecture.title}
                  size={170}
                  showInstructions={false}
                  presentationHref={`/p/${lectureId}/present`}
                />
              </div>
            </div>

            <div className="rounded-4xl border border-border bg-surface p-6 shadow-soft">
              <div className="flex flex-wrap gap-2">
                {scheduled ? (
                  <Button
                    onClick={() => void control("start")}
                    loading={busyAction === "start"}
                    size="lg"
                    className="flex-1"
                  >
                    <Play aria-hidden className="size-5" />
                    {t("prof.live.start")}
                  </Button>
                ) : null}
                {live ? (
                  <Button
                    variant="secondary"
                    onClick={() => void control("pause")}
                    loading={busyAction === "pause"}
                    size="lg"
                    className="flex-1"
                  >
                    <Pause aria-hidden className="size-5" />
                    {t("prof.live.pause")}
                  </Button>
                ) : null}
                {paused ? (
                  <Button
                    onClick={() => void control("resume")}
                    loading={busyAction === "resume"}
                    size="lg"
                    className="flex-1"
                  >
                    <Play aria-hidden className="size-5" />
                    {t("prof.live.resume")}
                  </Button>
                ) : null}
                {!scheduled ? (
                  <Button
                    variant="danger"
                    onClick={() => setEndOpen(true)}
                    size="lg"
                    className="flex-1"
                    data-testid="end-lecture"
                  >
                    <Square aria-hidden className="size-4" />
                    {t("prof.live.end")}
                  </Button>
                ) : null}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">
                {connected ? t("prof.live.updated") : t("prof.live.connectionLost")}
              </p>
            </div>

            <div className="rounded-4xl border border-dashed border-border p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 aria-hidden className="size-4 text-primary" />
                {t("prof.live.details")}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted">
                {t("prof.live.detailsHint")}
              </p>
              <Link
                href={`/summary/${lectureId}`}
                className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline"
              >
                {t("prof.home.summary")} в†’
              </Link>
            </div>
          </section>
        </div>
      </main>

      <Dialog
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title={t("prof.live.confirmEndTitle")}
        description={t("prof.live.confirmEndBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void control("end")}
              loading={busyAction === "end"}
              data-testid="confirm-end-lecture"
            >
              {busyAction === "end" ? t("prof.live.ending") : t("prof.live.end")}
            </Button>
          </>
        }
      />
    </div>
  );
}
