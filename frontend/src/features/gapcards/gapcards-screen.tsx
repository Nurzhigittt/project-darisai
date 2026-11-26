"use client";

import { ArrowLeft, ArrowRight, BookOpen, RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { getHistoryRevision, getSession, listConfirmedSignals, listReplayProgress, listStoredGapCards, reviewStoredGapCard, saveStoredGapCards, type GapCardRating, type LocalSession, type StoredGapCard } from "@/lib/storage/db";
import { formatOffset } from "@/lib/utils";

function failureKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "LECTURE_NOT_ENDED") return "gapcards.notEnded";
    if (["TRANSCRIPT_REQUIRED", "TRANSCRIPT_EVIDENCE_REQUIRED"].includes(error.code)) return "gapcards.noTranscript";
    if (["REPLAY_STATE_INVALID", "REPLAY_STATE_EXPIRED"].includes(error.code)) return "gapcards.momentExpired";
    if (error.code === "AI_BUDGET_EXHAUSTED") return "gapcards.budget";
    if (error.status === 401 || error.status === 403) return "gapcards.expired";
    if (error.status === 429) return "gapcards.rateLimit";
    if (error.status === 404) return "gapcards.unavailable";
    if (error.status === 422) return "gapcards.invalid";
    if (error.status === 0) return "gapcards.network";
  }
  return "gapcards.error";
}

export function GapCardsScreen({ lectureId }: { lectureId: string }) {
  return <GapCardsContent key={lectureId} lectureId={lectureId} />;
}

function GapCardsContent({ lectureId }: { lectureId: string }) {
  const { t, locale } = useI18n();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [cards, setCards] = useState<StoredGapCard[]>([]);
  const [signalCount, setSignalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [durable, setDurable] = useState(true);
  const [checkedAt, setCheckedAt] = useState(0);
  const active = useRef(false);
  const busyRef = useRef(false);
  const historyRevision = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const invalidateHistory = useCallback((key: string) => {
    historyRevision.current = null;
    controller.current?.abort(); busyRef.current = false; setBusy(false);
    setCards([]); setSignalCount(0); setIndex(0); setFlipped(false); setRated(null); setMessage(null);
    setError(key);
  }, []);

  useEffect(() => {
    active.current = true;
    void (async () => {
      // Read the revision before the data snapshot so a concurrent clear cannot
      // pair old data with the new revision.
      const revision = await getHistoryRevision(lectureId);
      const [nextSession, stored, signals] = await Promise.all([getSession(lectureId), listStoredGapCards(lectureId), listConfirmedSignals(lectureId)]);
      const currentRevision = await getHistoryRevision(lectureId);
      if (!active.current) return;
      setSession(nextSession);
      setCheckedAt(Date.now());
      if (revision < 0 || currentRevision < 0) setError("gapcards.storageError");
      else if (revision !== currentRevision) setError("gapcards.historyChanged");
      else {
        historyRevision.current = revision;
        setCards(stored);
        setSignalCount(signals.length);
        const due = stored.findIndex((card) => !card.review || new Date(card.review.dueAt).getTime() <= Date.now());
        setIndex(Math.max(0, due));
      }
      setLoading(false);
    })();
    return () => { active.current = false; controller.current?.abort(); };
  }, [lectureId]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    const verify = () => {
      const expected = historyRevision.current;
      if (expected === null) return;
      void getHistoryRevision(lectureId).then((revision) => {
        if (!active.current || historyRevision.current !== expected || revision === expected) return;
        invalidateHistory(revision < 0 ? "gapcards.storageError" : "gapcards.historyChanged");
      });
    };
    const visibility = () => { if (document.visibilityState === "visible") verify(); };
    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", verify); document.removeEventListener("visibilitychange", visibility); };
  }, [lectureId, invalidateHistory]);

  useEffect(() => {
    if (!session) return;
    const remaining = new Date(session.replayTokenExpiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = window.setTimeout(() => setCheckedAt(Date.now()), Math.min(remaining + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [session]);

  async function historyUnchanged(expected: number, request?: AbortController): Promise<boolean> {
    const revision = await getHistoryRevision(lectureId);
    if (!active.current || request?.signal.aborted || historyRevision.current !== expected) return false;
    if (revision >= 0 && revision === expected) return true;
    invalidateHistory(revision < 0 ? "gapcards.storageError" : "gapcards.historyChanged");
    return false;
  }

  async function generate() {
    const expectedRevision = historyRevision.current;
    if (busyRef.current || offline || expectedRevision === null) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    const request = new AbortController();
    controller.current = request;
    try {
      if (!await historyUnchanged(expectedRevision, request)) return;
      const [currentSession, signals, progress] = await Promise.all([getSession(lectureId), listConfirmedSignals(lectureId), listReplayProgress(lectureId)]);
      if (!await historyUnchanged(expectedRevision, request)) return;
      setSession(currentSession);
      setCheckedAt(Date.now());
      setSignalCount(signals.length);
      const expiresAt = currentSession ? new Date(currentSession.replayTokenExpiresAt).getTime() : 0;
      if (!currentSession || !currentSession.replayToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        setError("gapcards.expired"); return;
      }
      const offsets = [...new Set(signals.map((signal) => signal.offsetMs))].filter((offset) => Number.isInteger(offset) && offset >= 0).sort((a, b) => b - a).slice(0, 20);
      if (offsets.length === 0) { setError("gapcards.noSignals"); return; }
      // Signed moment IDs are fetched afresh and remain in memory only.
      const replay = await api.startReplay(currentSession.replayToken, { lecture_id: lectureId, flagged_offsets_ms: offsets }, request.signal);
      if (!await historyUnchanged(expectedRevision, request)) return;
      if (replay.lecture_id !== lectureId || !replay.moments.length) { setError("gapcards.noTranscript"); return; }
      const moments = replay.moments.slice(0, 20);
      const result = await api.generateGapCards(currentSession.replayToken, {
        lecture_id: lectureId,
        moments: moments.map((moment) => ({ moment_id: moment.moment_id, outcome: progress.find((item) => item.offsetMs === moment.offset_ms)?.outcome ?? "unclear" })),
      }, request.signal);
      if (!await historyUnchanged(expectedRevision, request)) return;
      if ((await getSession(lectureId))?.replayToken !== currentSession.replayToken) { setError("gapcards.expired"); return; }
      if (!active.current || request.signal.aborted) return;
      if (result.lecture_id !== lectureId || result.cards.some((card) => !moments.some((moment) => moment.moment_id === card.moment_id) || !card.validation.schema_ok || !card.validation.citations_ok || card.validation.answer_leak)) {
        setError("gapcards.invalidResponse"); return;
      }
      if (!result.cards.length) { setError("gapcards.noCards"); return; }
      const createdAt = new Date().toISOString();
      const next = result.cards.map((card): StoredGapCard => {
        const offsetMs = moments.find((moment) => moment.moment_id === card.moment_id)!.offset_ms;
        return {
          id: `${lectureId}:${card.card_id}`, lectureId, offsetMs, front: card.front, quote: card.back.quote,
          createdAt, conceptTitle: card.concept_title, source: card.source, citation: card.back.citation, difficulty: card.difficulty,
        };
      });
      const saved = await saveStoredGapCards(lectureId, next, expectedRevision);
      // Read back the transactional merge, including ratings written in another tab.
      const persisted = saved ? await listStoredGapCards(lectureId) : next;
      if (!await historyUnchanged(expectedRevision, request)) return;
      setCards(persisted); setIndex(0); setFlipped(false); setRated(null); setDurable(saved);
      setMessage(saved ? "gapcards.generated" : null);
      if (!saved) setError("gapcards.storageError");
    } catch (caught) {
      if (active.current && !request.signal.aborted && await historyUnchanged(expectedRevision, request)) setError(failureKey(caught));
    } finally {
      if (active.current && !request.signal.aborted) { busyRef.current = false; setBusy(false); }
    }
  }

  async function rate(rating: GapCardRating) {
    const card = cards[index];
    const expectedRevision = historyRevision.current;
    if (!card || !flipped || !durable || busyRef.current || rated === card.id || expectedRevision === null) return;
    busyRef.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      if (!await historyUnchanged(expectedRevision)) return;
      const updated = await reviewStoredGapCard(card.id, rating, Date.now(), expectedRevision);
      if (!await historyUnchanged(expectedRevision)) return;
      if (updated) {
        setCards((current) => current.map((item) => item.id === updated.id ? updated : item));
        setRated(card.id); setMessage("gapcards.reviewSaved");
      } else setError("gapcards.storageError");
    } finally {
      if (active.current) { busyRef.current = false; setBusy(false); }
    }
  }

  function move(next: number) {
    setIndex(next); setFlipped(false); setRated(null); setMessage(null);
    heading.current?.focus();
  }

  const card = cards[index];
  const reviewed = cards.filter((item) => item.review).length;
  const expires = session ? new Date(session.replayTokenExpiresAt).getTime() : 0;
  const validPass = Boolean(session?.replayToken && Number.isFinite(expires) && expires > checkedAt);
  const canGenerate = validPass && signalCount > 0;
  const dueDate = card?.review ? new Date(card.review.dueAt) : null;
  const nextReview = dueDate && Number.isFinite(dueDate.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(dueDate) : null;

  return <div className="min-h-dvh bg-background">
    <header className="border-b border-border bg-surface/70"><div className="container-page flex min-h-16 items-center justify-between gap-2 py-2"><Logo /><div className="flex items-center gap-1"><LanguageSwitcher /><ThemeSwitcher /></div></div></header>
    <main id="main" className="container-page max-w-4xl py-8 sm:py-12">
      <Link href={`/replay/${lectureId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground"><ArrowLeft aria-hidden className="size-4" />{t("gapcards.replay")}</Link>
      {session ? <p className="mt-5 break-words text-sm font-medium text-muted">{session.lecture.title}</p> : null}
      <h1 className="mt-3 text-[clamp(2rem,5vw,3.5rem)] font-semibold">{t("gapcards.title")}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">{t("gapcards.subtitle")}</p>
      <p className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm leading-6">{t("gapcards.localNotice")}</p>
      {offline ? <p role="status" className="mt-4 flex items-center gap-3 rounded-xl border border-border p-4"><WifiOff aria-hidden className="size-5 shrink-0" />{t("gapcards.offline")}</p> : null}
      <p role="status" aria-live="polite" className="mt-4 text-sm font-medium">{message ? t(message) : ""}</p>
      {error ? <p role="alert" className="mb-4 rounded-xl border border-border bg-surface p-4">{t(error)}</p> : null}
      {loading ? <div role="status" aria-label={t("gapcards.loading")}><Skeleton className="h-80 w-full" /><span className="sr-only">{t("gapcards.loading")}</span></div> : <>
        <div className="my-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">{t("gapcards.reviewProgress", { reviewed, total: cards.length })}</p>
          <Button variant={cards.length ? "secondary" : "primary"} disabled={busy || offline || !canGenerate} loading={busy && !flipped} onClick={() => void generate()}><RefreshCw aria-hidden className="size-4" />{t(cards.length ? "gapcards.refresh" : "gapcards.generate")}</Button>
        </div>
        {!canGenerate ? <p className="mb-5 text-sm text-muted">{t(!validPass ? "gapcards.expired" : "gapcards.noSignals")}</p> : <p className="mb-5 text-sm text-muted">{t("gapcards.generationHint")}</p>}
        {!card ? <EmptyState icon={<BookOpen aria-hidden className="size-6" />} title={t("gapcards.emptyTitle")} body={t("gapcards.emptyBody")} /> : <>
          <article className="rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-8" aria-labelledby="gapcard-heading">
            <div className="flex flex-wrap items-center justify-between gap-3"><Badge>{t(`gapcards.source.${card.source ?? "unknown"}`)}</Badge><span className="text-sm text-muted">{t("gapcards.position", { current: index + 1, total: cards.length })}</span></div>
            {card.source === "template" ? <p className="mt-3 text-sm text-muted">{t("gapcards.templateNotice")}</p> : null}
            {card.conceptTitle ? <p className="mt-5 break-words text-sm font-medium text-muted">{card.conceptTitle}</p> : null}
            <h2 id="gapcard-heading" ref={heading} tabIndex={-1} className="mt-4 break-words text-2xl font-semibold leading-relaxed outline-none sm:text-3xl">{card.front}</h2>
            <Button className="mt-6" variant="secondary" aria-expanded={flipped} aria-controls={flipped ? "gapcard-back" : undefined} disabled={busy} onClick={() => setFlipped((current) => !current)}>{t(flipped ? "gapcards.hide" : "gapcards.flip")}</Button>
            {flipped ? <section id="gapcard-back" aria-label={t("gapcards.quote")} className="mt-6 border-t border-border pt-5">
              <h3 className="text-lg font-semibold">{t("gapcards.quote")}</h3>
              <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-4 border-primary pl-4 text-lg leading-8">{card.quote}</blockquote>
              <p className="mt-3 text-sm font-medium text-muted">{t("gapcards.timestamp")}: {formatOffset(card.citation?.start_ms ?? card.offsetMs)}{card.citation ? `–${formatOffset(card.citation.end_ms)}` : ""}</p>
              <Link href={`/replay/${lectureId}#offset-${card.offsetMs}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-primary">{t("gapcards.context")}<ArrowRight aria-hidden className="size-4" /></Link>
              <p className="mt-5 text-sm text-muted">{t("gapcards.ratingPrompt")}</p>
              <div role="group" aria-label={t("gapcards.ratingPrompt")} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["again", "hard", "good", "easy"] as const).map((rating) => <Button key={rating} variant="secondary" disabled={busy || !durable || rated === card.id} onClick={() => void rate(rating)}>{t(`gapcards.rating.${rating}`)}</Button>)}
              </div>
            </section> : null}
            {nextReview ? <p className="mt-5 text-sm text-muted">{t("gapcards.nextReview", { date: nextReview })}</p> : null}
          </article>
          <nav aria-label={t("gapcards.cardNavigation")} className="mt-5 flex justify-between gap-3"><Button variant="secondary" disabled={busy || index === 0} onClick={() => move(index - 1)}><ArrowLeft aria-hidden className="size-4" />{t("gapcards.previous")}</Button><Button variant="secondary" disabled={busy || index + 1 >= cards.length} onClick={() => move(index + 1)}>{t("gapcards.next")}<ArrowRight aria-hidden className="size-4" /></Button></nav>
        </>}
      </>}
    </main>
  </div>;
}
