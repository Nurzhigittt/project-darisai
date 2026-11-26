"use client";

import {
  ArrowLeft,
  BookmarkCheck,
  CheckCircle2,
  Clock3,
  History,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import { SignalButton, type SignalVisualState } from "@/components/ui/signal-button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useI18n } from "@/lib/i18n";
import {
  addPendingSignal,
  allocateClientSeq,
  getSession,
  listConfirmedSignals,
  listPendingSignals,
  recordConfirmedSignal,
  removePendingSignal,
  setCooldownUntil,
  type ConfirmedSignal,
  type LocalSession,
} from "@/lib/storage/db";
import { formatOffset } from "@/lib/utils";
import {
  DarisSocket,
  type HelloOkPayload,
  type LectureStatePayload,
  type SignalAckPayload,
  type WsEvent,
  type WsStatus,
} from "@/lib/ws/client";

import styles from "./signal.module.css";

type Phase = "idle" | "sending" | "accepted" | "error";
type LectureStatus = "scheduled" | "live" | "paused" | "ended";

export function StudentLectureScreen({ lectureId }: { lectureId: string }) {
  const { t } = useI18n();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [lectureStatus, setLectureStatus] = useState<LectureStatus>("scheduled");
  const [phase, setPhase] = useState<Phase>("idle");
  const [cooldownUntil, setCooldown] = useState(0);
  const [cooldownMs, setCooldownMs] = useState(15_000);
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [history, setHistory] = useState<ConfirmedSignal[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const socketRef = useRef<DarisSocket | null>(null);
  const currentSeqRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef(0);
  const eventHandlerRef = useRef<(event: WsEvent) => void>(() => {});
  const statusHandlerRef = useRef<(status: WsStatus) => void>(() => {});

  const refreshHistory = useCallback(async () => {
    const items = await listConfirmedSignals(lectureId);
    setHistory(items);
  }, [lectureId]);

  const updateCooldown = useCallback(
    (epochMs: number) => {
      cooldownUntilRef.current = epochMs;
      setCooldown(epochMs);
      void setCooldownUntil(lectureId, epochMs);
    },
    [lectureId],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      const stored = await getSession(lectureId);
      if (!active) return;
      setSession(stored);
      if (stored) {
        setLectureStatus(stored.lecture.status);
        setCooldown(stored.cooldownUntil || 0);
        cooldownUntilRef.current = stored.cooldownUntil || 0;
        if (new Date(stored.signalTokenExpiresAt).getTime() <= Date.now()) {
          setFeedback(t("prof.login.expired"));
          setPhase("error");
        }
      }
      setLoadingSession(false);
      void refreshHistory();
    }
    void load();
    return () => {
      active = false;
    };
  }, [lectureId, refreshHistory, t]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const handleSignalAck = useCallback(
    async (ack: SignalAckPayload) => {
      if (currentSeqRef.current !== ack.client_seq) return;
      if (ack.accepted || ack.duplicate) {
        await recordConfirmedSignal({
          id: `${lectureId}:${ack.client_seq}`,
          lectureId,
          clientSeq: ack.client_seq,
          offsetMs: ack.offset_ms,
          acceptedAt: new Date().toISOString(),
        });
        await refreshHistory();
        setPhase("accepted");
        setFeedback(t("student.acceptedBody"));
        updateCooldown(Date.now() + cooldownMs);
        window.setTimeout(() => setPhase("idle"), 1_600);
        currentSeqRef.current = null;
        return;
      }
      if (ack.reason === "cooldown") {
        updateCooldown(Date.now() + (ack.retry_after_ms ?? cooldownMs));
        setPhase("idle");
        setFeedback(t("student.tooSoon"));
      } else if (ack.reason === "duplicate") {
        setPhase("idle");
        setFeedback(t("student.signalNotCounted"));
      } else if (ack.reason === "stale_signal") {
        setPhase("error");
        setFeedback(t("student.signalExpired"));
      } else if (ack.reason === "not_live") {
        setPhase("idle");
        setFeedback(t("student.pausedBody"));
      } else if (ack.reason === "invalid_payload") {
        setPhase("error");
        setFeedback(t("errors.generic"));
      } else {
        setPhase("error");
        setFeedback(t("student.errorBody"));
      }
      currentSeqRef.current = null;
    },
    [cooldownMs, lectureId, refreshHistory, t, updateCooldown],
  );

  useEffect(() => {
    eventHandlerRef.current = (event: WsEvent) => {
      if (event.type === "hello_ok") {
        const payload = event.payload as unknown as HelloOkPayload;
        setLectureStatus(payload.lecture_status);
        setCooldownMs(payload.signal_cooldown_ms);
        setFeedback(null);
      } else if (event.type === "signal_ack") {
        void handleSignalAck(event.payload as unknown as SignalAckPayload);
      } else if (event.type === "lecture_state") {
        const payload = event.payload as unknown as LectureStatePayload;
        setLectureStatus(payload.status);
        if (payload.status === "ended") {
          setPhase("idle");
          setFeedback(t("student.endedBody"));
        }
      } else if (event.type === "error") {
        const payload = event.payload as { code?: string; message?: string };
        if (payload.code === "LECTURE_ENDED") {
          setLectureStatus("ended");
        } else if (payload.code !== "RATE_LIMITED") {
          setFeedback(t("ws.error"));
        }
      }
    };
    statusHandlerRef.current = (status) => {
      setWsStatus(status);
    };
  }, [handleSignalAck, t]);

  useEffect(() => {
    if (!session || session.lecture.status === "ended") return;
    if (new Date(session.signalTokenExpiresAt).getTime() <= Date.now()) return;
    const socket = new DarisSocket({
      url: session.wsUrl,
      lectureId,
      role: "student",
      token: session.signalToken,
      onEvent: (event) => eventHandlerRef.current(event),
      onStatus: (status) => statusHandlerRef.current(status),
    });
    socketRef.current = socket;
    socket.connect();
    return () => {
      socket.dispose();
      socketRef.current = null;
    };
  }, [lectureId, session]);

  useEffect(() => {
    if (wsStatus !== "ready" || !session) return;
    let cancelled = false;
    async function flush() {
      const pending = await listPendingSignals(lectureId);
      if (cancelled || pending.length === 0) return;
      const item = pending[0];
      if (!item) return;
      if (Date.now() - item.createdAt > 30_000) {
        await removePendingSignal(item.id);
        setFeedback(t("student.signalExpired"));
        return;
      }
      if (currentSeqRef.current !== null) return;
      currentSeqRef.current = item.clientSeq;
      setPhase("sending");
      const sent = socketRef.current?.sendStudentSignal(item.clientSeq, item.clientTsMs);
      if (!sent) {
        currentSeqRef.current = null;
        setPhase("idle");
      }
    }
    void flush();
    return () => {
      cancelled = true;
    };
  }, [lectureId, session, t, wsStatus]);

  async function submitSignal() {
    if (!session) return;
    setFeedback(null);
    let seq: number;
    try {
      seq = await allocateClientSeq(lectureId);
    } catch {
      setFeedback(t("student.errorBody"));
      setPhase("error");
      return;
    }
    const nowMs = Date.now();
    if (!socketRef.current?.sendStudentSignal(seq, nowMs)) {
      currentSeqRef.current = null;
      await addPendingSignal({
        id: `${lectureId}:${seq}`,
        lectureId,
        clientSeq: seq,
        createdAt: nowMs,
        clientTsMs: nowMs,
      });
      setPhase("idle");
      setFeedback(t("student.signalSaved"));
      return;
    }
    currentSeqRef.current = seq;
    setPhase("sending");
  }

  const cooldownRemaining = Math.max(0, cooldownUntil - now);
  let visualState: SignalVisualState = "ready";
  if (phase === "sending") visualState = "sending";
  else if (phase === "accepted") visualState = "accepted";
  else if (phase === "error") visualState = "error";
  else if (lectureStatus === "ended") visualState = "ended";
  else if (lectureStatus === "paused") visualState = "paused";
  else if (wsStatus === "offline" || wsStatus === "closed") visualState = "offline";
  else if (wsStatus === "connecting" || wsStatus === "reconnecting" || wsStatus === "idle")
    visualState = "connecting";
  else if (cooldownRemaining > 0) visualState = "cooldown";

  const waiting = lectureStatus === "scheduled";
  const ended = lectureStatus === "ended";
  const connectionState =
    wsStatus === "ready"
      ? "ready"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "connecting"
        : "offline";

  if (loadingSession) {
    return (
      <div className="app-page min-h-dvh">
        <header className="app-header">
          <div className="container-page flex items-center justify-between">
            <Logo />
            <ThemeSwitcher />
          </div>
        </header>
        <main className="container-page py-12">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-6 h-16 w-3/4" />
          <Skeleton className="mx-auto mt-16 size-[min(72vw,18rem)] rounded-full" />
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-page min-h-dvh">
        <header className="app-header">
          <div className="container-page flex items-center justify-between">
            <Logo />
            <ThemeSwitcher />
          </div>
        </header>
        <main id="main" className="container-page py-12">
          <ErrorState
            title={t("student.rejoin")}
            body={t("join.invalid.body")}
            action={
              <Link
                href="/#join"
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground"
              >
                {t("join.cta")}
              </Link>
            }
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app-page min-h-dvh">
      <header className="app-header">
        <div className="container-page flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>
      <main id="main" className={`container-page ${styles.main}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("common.back")}
          </Link>
          <StatusIndicator
            state={connectionState}
            label={
              wsStatus === "ready"
                ? t("ws.ready")
                : wsStatus === "reconnecting"
                  ? t("ws.reconnecting")
                  : wsStatus === "connecting"
                    ? t("ws.connecting")
                    : t("ws.offline")
            }
          />
        </div>

        <div className={styles.lectureHeader}>
          <p className={styles.eyebrow}>
            {ended ? t("student.ended") : waiting ? t("join.waiting") : t("student.live")}
          </p>
          <h1>
            {session.lecture.title || t("student.titleFallback")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {session.lecture.course_title ?? "Lecture"}
          </p>
        </div>

        <div className={styles.stage}>
          {waiting ? (
            <div className="app-panel app-panel-mint px-6 py-16 text-center">
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-primary-soft">
                <Clock3 aria-hidden className="size-9 text-primary" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold">{t("student.waiting.title")}</h2>
              <p className="mx-auto mt-3 max-w-sm leading-7 text-muted">
                {t("student.waiting.body")}
              </p>
              {wsStatus === "offline" ? (
                <Banner tone="offline" className="mt-6 text-left">
                  {t("student.offline")}
                </Banner>
              ) : null}
            </div>
          ) : ended ? (
            <div
              data-testid="student-ended"
              className="app-panel app-panel-mint p-7 text-center sm:p-10"
            >
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-positive/15">
                <CheckCircle2 aria-hidden className="size-10 text-positive" />
              </div>
              <h2 className="mt-6 text-3xl font-semibold">{t("student.ended")}</h2>
              <p className="mx-auto mt-3 max-w-md leading-7 text-muted">
                {t("student.endedBody")}
              </p>
              <div className="mt-7 rounded-2xl border border-border bg-background p-4 text-left">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">{t("student.history")}</h3>
                  <BookmarkCheck aria-hidden className="size-5 text-primary" />
                </div>
                {history.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t("student.historyEmpty")}</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {history.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold tabular-nums"
                      >
                        {formatOffset(item.offsetMs)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <nav className="mt-7 flex flex-wrap justify-center gap-3" aria-label={t("learning.title")}>
                <Link href={`/replay/${lectureId}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"><Sparkles aria-hidden className="size-4" />{t("learning.replay")}</Link>
                <Link href={`/gapcards/${lectureId}`} className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 font-semibold">{t("learning.cards")}</Link>
              </nav>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
                  <History aria-hidden className="size-4" />
                  {t("student.history")}
                </Button>
                <Link
                  href={session.joinCode ? `/join/${session.joinCode}` : "/#join"}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  {t("student.rejoin")}
                </Link>
              </div>
            </div>
          ) : (
            <div className={`app-panel ${styles.signalStage}`}>
              <SignalButton
                state={visualState}
                cooldownRemainingMs={cooldownRemaining}
                cooldownTotalMs={cooldownMs}
                onClick={submitSignal}
              />
              <p className={styles.support}>
                {t("student.signalSupport")}
              </p>
              <div aria-live="polite" className="mt-3 min-h-8 max-w-md text-center">
                {feedback ? (
                  <p
                    className={
                      phase === "error"
                        ? "text-sm font-semibold text-ripple-warm"
                        : "text-sm font-semibold text-foreground"
                    }
                  >
                    {feedback}
                  </p>
                ) : cooldownRemaining > 0 ? (
                  <p className="text-sm text-muted">{t("student.cooldown")}</p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck aria-hidden className="size-4 text-positive" />
            {t("student.privacy")}
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-primary hover:bg-primary-soft"
            >
              <History aria-hidden className="size-4" />
              {t("student.history")}
            </button>
            <Link
              href="/privacy"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-primary hover:bg-primary-soft"
            >
              <LockKeyhole aria-hidden className="size-4" />
              {t("nav.privacy")}
            </Link>
          </div>
          {wsStatus === "closed" && !ended ? (
            <p className="text-xs text-muted">{t("prof.login.expired")}</p>
          ) : null}
          {wsStatus === "offline" && !ended ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted">
              <WifiOff aria-hidden className="size-4" />
              {t("ws.offline")}
            </p>
          ) : null}
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Radio aria-hidden className="size-4" />
            {t("landing.footerNote")}
          </p>
        </div>
      </main>

      <Sheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t("student.history")}
      >
        {history.length === 0 ? (
          <EmptyState
            icon={<History aria-hidden className="size-6" />}
            title={t("student.historyEmpty")}
            body={t("student.historyLocalNote")}
          />
        ) : (
          <>
            <ul className="space-y-2">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3"
                >
                  <span className="font-semibold">
                    {t("student.historyEntry", { time: formatOffset(item.offsetMs) })}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(item.acceptedAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-6 text-muted">
              {t("student.historyLocalNote")}
            </p>
          </>
        )}
        <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm leading-6">
          {t("student.historyClearWarning")}
        </div>
      </Sheet>
    </div>
  );
}
