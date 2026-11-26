"use client";

import { ArrowLeft, BookOpen, CheckCircle2, History, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError, type ReplayMoment, type ReplayStartOut, type ReplayTurnOut } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import {
  getHistoryRevision, getSession, listConfirmedSignals, listReplayProgress, saveReplayProgress,
  type LocalSession, type StoredReplayMessage, type StoredReplayProgress,
} from "@/lib/storage/db";
import { cn, formatOffset } from "@/lib/utils";

import { Citations, ReplaySource } from "./citations";
import { boundedReplayHistory } from "./replay-helpers";

type Discussion = {
  moment: ReplayMoment;
  source: ReplayStartOut["source"];
  ownerToken: string;
  historyRevision: number;
  messages: StoredReplayMessage[];
  stateToken: string | null;
  stage: "mcq" | "socratic" | "complete";
  completed: boolean;
  blocked: boolean;
};

function errorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return "replay.generic";
  if (error.status === 0) return "replay.network";
  if (error.code === "LECTURE_NOT_ENDED") return "replay.notEnded";
  if (error.code === "TRANSCRIPT_REQUIRED") return "replay.noTranscript";
  if (error.code === "TRANSCRIPT_EVIDENCE_REQUIRED" || error.code === "INSUFFICIENT_EVIDENCE") return "replay.noEvidence";
  if (error.code === "AI_BUDGET_EXHAUSTED") return "replay.budget";
  if (["REPLAY_STATE_INVALID", "REPLAY_STATE_EXPIRED", "REPLAY_STATE_REPLAYED", "REPLAY_COMPLETE", "INVALID_STAGE"].includes(error.code)) return "replay.stateExpired";
  if (error.status === 401 || error.status === 403) return "replay.expired";
  if (error.status === 404) return "replay.notFound";
  if (error.status === 429) return "replay.rateLimit";
  if (error.status === 422) return "replay.validation";
  return "replay.generic";
}

function validAccess(session: LocalSession | null): session is LocalSession {
  return Boolean(session?.replayToken && new Date(session.replayTokenExpiresAt).getTime() > Date.now());
}

function Dialogue({ messages }: { messages: StoredReplayMessage[] }) {
  const { t } = useI18n();
  return <ol className="space-y-4">
    {messages.map((message, index) => <li key={index} className={cn("rounded-2xl border border-border p-4 sm:p-5", message.role === "student" ? "ml-4 bg-primary-soft sm:ml-10" : "bg-surface")}>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{t(message.role === "student" ? "replay.you" : "replay.axiom")}</span>{message.source ? <ReplaySource source={message.source} /> : null}</div>
      <p className="mt-3 whitespace-pre-wrap break-words leading-7">{message.text}</p>
      {message.options?.length ? <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted">{message.options.map((option) => <li key={option.id}>{option.text}</li>)}</ul> : null}
      <Citations citations={message.citations ?? []} />
    </li>)}
  </ol>;
}

export function ReplayScreen({ lectureId }: { lectureId: string }) {
  return <ReplayContent key={lectureId} lectureId={lectureId} />;
}

function ReplayContent({ lectureId }: { lectureId: string }) {
  const { t } = useI18n();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [saved, setSaved] = useState<StoredReplayProgress[]>([]);
  const [moments, setMoments] = useState<ReplayStartOut | null>(null);
  const [active, setActive] = useState<Discussion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"moments" | "turn" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [answer, setAnswer] = useState("");
  const [choice, setChoice] = useState("");
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const localVersion = useRef(0);
  const historyRevision = useRef<number | null>(null);
  const responseHeading = useRef<HTMLHeadingElement>(null);
  const discussions = useRef<Record<number, Discussion>>({});

  function remember(discussion: Discussion) {
    discussions.current[discussion.moment.offset_ms] = discussion;
    setActive(discussion);
  }

  const clearStaleHistory = useCallback((reason = "replay.historyChanged") => {
    historyRevision.current = null;
    ++localVersion.current;
    requestRef.current?.abort();
    busyRef.current = false;
    discussions.current = {};
    setBusy(null); setLoading(false); setActive(null); setMoments(null);
    setSaved([]); setOffsets([]); setSelected([]); setAnswer(""); setChoice("");
    setError(null); setStorageError(false); setAccessError(reason);
  }, []);

  const sameHistory = useCallback(async (expected: number | null): Promise<boolean> => {
    const current = await getHistoryRevision(lectureId);
    if (!mounted.current || expected === null || historyRevision.current !== expected) return false;
    if (current < 0) { clearStaleHistory("replay.storageUnavailable"); return false; }
    if (current !== expected) {
      clearStaleHistory();
      return false;
    }
    return true;
  }, [clearStaleHistory, lectureId]);

  const loadLocal = useCallback(async () => {
    const version = ++localVersion.current;
    requestRef.current?.abort();
    busyRef.current = false;
    setBusy(null);
    setLoading(true);
    historyRevision.current = null;
    setActive(null);
    discussions.current = {};
    setMoments(null);
    setSaved([]); setOffsets([]); setSelected([]); setStorageError(false);
    setError(null);
    // Read the revision before the data, so a concurrent clear cannot pair old
    // signals with a new revision and authorize a later stale write.
    const revision = await getHistoryRevision(lectureId);
    const [nextSession, signals, progress] = await Promise.all([getSession(lectureId), listConfirmedSignals(lectureId), listReplayProgress(lectureId)]);
    const latestRevision = await getHistoryRevision(lectureId);
    if (!mounted.current || version !== localVersion.current) return;
    if (revision < 0 || latestRevision < 0) { clearStaleHistory("replay.storageUnavailable"); return; }
    if (revision !== latestRevision) { clearStaleHistory(); return; }
    historyRevision.current = revision;
    const confirmed = [...new Set(signals.map((signal) => signal.offsetMs).filter((offset) => Number.isSafeInteger(offset) && offset >= 0))].sort((a, b) => a - b);
    setSession(nextSession);
    setAccessError(nextSession && !validAccess(nextSession) ? "replay.expired" : null);
    setOffsets(confirmed);
    setSelected(confirmed.slice(0, 20));
    setSaved(progress);
    setLoading(false);
  }, [clearStaleHistory, lectureId]);

  useEffect(() => {
    mounted.current = true;
    void loadLocal();
    return () => { mounted.current = false; requestRef.current?.abort(); };
  }, [loadLocal]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    const check = () => { if (historyRevision.current !== null) void sameHistory(historyRevision.current); };
    const visible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", visible); };
  }, [sameHistory]);

  async function stillOwns(token: string, request: AbortController, revision: number): Promise<boolean> {
    const current = await getSession(lectureId);
    if (!mounted.current || request.signal.aborted || requestRef.current !== request) return false;
    if (!await sameHistory(revision)) return false;
    if (request.signal.aborted || requestRef.current !== request) return false;
    if (current?.replayToken === token) return true;
    setSession(current);
    setAccessError("replay.sessionChanged");
    setActive(null);
    discussions.current = {};
    setMoments(null);
    return false;
  }

  async function run(kind: "moments" | "turn", operation: (token: string, request: AbortController, revision: number) => Promise<void>) {
    if (busyRef.current || offline || accessError) return;
    const revision = historyRevision.current;
    if (revision === null) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    const request = new AbortController();
    requestRef.current?.abort();
    requestRef.current = request;
    let token: string | null = null;
    try {
      if (!await sameHistory(revision)) return;
      const current = await getSession(lectureId);
      if (!mounted.current || request.signal.aborted) return;
      if (!validAccess(current)) throw new ApiError(401, "UNAUTHORIZED", "Replay access expired.");
      token = current.replayToken;
      setSession(current);
      if (kind === "turn" && active?.ownerToken !== token) {
        setSession(current); setAccessError("replay.sessionChanged"); setActive(null); discussions.current = {}; setMoments(null); return;
      }
      await operation(token, request, revision);
    } catch (caught) {
      if (!mounted.current || request.signal.aborted || requestRef.current !== request) return;
      if (token && !await stillOwns(token, request, revision)) return;
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) setAccessError("replay.expired");
      const uncertain = !(caught instanceof ApiError) || caught.status === 0 || caught.status >= 500;
      setError(kind === "turn" && uncertain ? "replay.uncertain" : errorKey(caught));
      if (kind === "turn") {
        // A nonce can be consumed before a timeout, budget error or lost reply.
        // No failed turn is ever replayed with the previous state token.
        setActive((current) => {
          if (!current) return null;
          const blocked = { ...current, stateToken: null, blocked: true };
          discussions.current[current.moment.offset_ms] = blocked;
          return blocked;
        });
      }
    } finally {
      if (mounted.current && requestRef.current === request) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  async function findMoments(requested: number[], openOffset?: number) {
    if (!requested.length) return;
    await run("moments", async (token, request, revision) => {
      const result = await api.startReplay(token, { lecture_id: lectureId, flagged_offsets_ms: requested.slice(0, 20) }, request.signal);
      if (!await stillOwns(token, request, revision)) return;
      if (result.lecture_id !== lectureId || !Array.isArray(result.moments) || !result.moments.length) throw new ApiError(409, "TRANSCRIPT_EVIDENCE_REQUIRED", "No moments returned.");
      setMoments(result);
      setActive(null);
      discussions.current = {};
      setAnswer(""); setChoice("");
      if (openOffset !== undefined) {
        const next = result.moments.find((moment) => moment.offset_ms === openOffset) ?? result.moments[0];
        if (next) remember({ moment: next, source: result.source, ownerToken: token, historyRevision: revision, messages: [], stateToken: null, stage: "mcq", completed: false, blocked: false });
      }
    });
  }

  async function openMoment(moment: ReplayMoment) {
    const revision = historyRevision.current;
    if (busyRef.current || !session || !moments || revision === null || !await sameHistory(revision)) return;
    remember(discussions.current[moment.offset_ms] ?? { moment, source: moments.source, ownerToken: session.replayToken, historyRevision: revision, messages: [], stateToken: null, stage: "mcq", completed: false, blocked: false });
    setError(null); setAnswer(""); setChoice("");
  }

  async function persist(discussion: Discussion, outcome?: StoredReplayProgress["outcome"]) {
    if (!await sameHistory(discussion.historyRevision)) return false;
    // Construct the persisted object explicitly: signed moment/state and access
    // tokens must never enter dialogue storage or a URL.
    const record: StoredReplayProgress = {
      id: `${lectureId}:${discussion.moment.offset_ms}`, lectureId, offsetMs: discussion.moment.offset_ms,
      conceptTitle: discussion.moment.concept_title, recap: discussion.moment.recap.text,
      recapCitations: discussion.moment.recap.citations ?? [], source: discussion.source,
      messages: discussion.messages, completed: discussion.completed,
      outcome: outcome ?? saved.find((item) => item.offsetMs === discussion.moment.offset_ms)?.outcome ?? "unclear",
      updatedAt: new Date().toISOString(),
    };
    const stored = await saveReplayProgress(record, discussion.historyRevision);
    if (!await sameHistory(discussion.historyRevision)) return false;
    if (!stored) setStorageError(true);
    else setSaved((current) => [...current.filter((item) => item.id !== record.id), record].sort((a, b) => a.offsetMs - b.offsetMs));
    return true;
  }

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!active || active.blocked || active.completed) return;
    const previous = active;
    const latest = previous.messages.at(-1);
    const first = previous.messages.length === 0;
    const selectedOption = latest?.kind === "mcq" ? latest.options?.find((option) => option.id === choice) : undefined;
    if (!first && (latest?.kind === "mcq" ? !selectedOption : !answer.trim() || answer.trim().length > 600)) return;
    const text = selectedOption?.text ?? answer.trim();
    // The stateless server does not retain MCQ options: send the meaning as
    // well as the ID so retrieval and the next question see the chosen answer.
    const input: Record<string, string> | null = first ? null : selectedOption ? { choice_id: selectedOption.id, text: selectedOption.text.trim().slice(0, 600) } : { text };
    await run("turn", async (token, request, revision) => {
      const result: ReplayTurnOut = await api.replayTurn(token, {
        lecture_id: lectureId, moment_id: previous.moment.moment_id,
        stage: first ? "mcq" : "socratic", state_token: previous.stateToken,
        history: boundedReplayHistory(previous.messages), input,
      }, request.signal);
      if (!await stillOwns(token, request, revision)) return;
      if (!result.turn || typeof result.turn.text !== "string" || !result.turn.text.trim() || !result.state_token ||
        !["mcq", "question", "reflection", "refusal"].includes(result.turn.kind) ||
        !["mcq", "socratic", "complete"].includes(result.stage) ||
        typeof result.turn.source !== "string" || !["live", "prebaked", "template"].includes(result.turn.source) ||
        (result.turn.kind === "mcq" && (!result.turn.options || result.turn.options.length < 2 || result.turn.options.some((option) => !option.id || option.id.length > 400 || !option.text?.trim())))) {
        throw new ApiError(502, "INVALID_RESPONSE", "Invalid replay response.");
      }
      const response: StoredReplayMessage = {
        role: "axiom", text: result.turn.text, kind: result.turn.kind,
        citations: result.turn.citations ?? [], source: result.turn.source,
        options: (result.turn.options ?? []).map((option) => ({ id: option.id ?? "", text: option.text ?? "" })),
      };
      const completed = result.stage === "complete" || result.turn.stage_complete === true || result.turn.kind === "refusal";
      const next: Discussion = {
        ...previous, messages: [...previous.messages, ...(!first ? [{ role: "student" as const, text }] : []), response],
        stateToken: completed ? null : result.state_token, stage: result.stage, completed, blocked: false,
      };
      if (!await persist(next) || !await stillOwns(token, request, revision)) return;
      remember(next); setAnswer(""); setChoice("");
      if (mounted.current) responseHeading.current?.focus();
    });
  }

  const disabled = Boolean(busy) || offline || Boolean(accessError) || !session;
  const currentRecord = active ? saved.find((item) => item.offsetMs === active.moment.offset_ms) : undefined;
  const latest = active?.messages.at(-1);
  const rejoin = session?.joinCode ? `/join/${session.joinCode}` : "/#join";

  return <div className="min-h-dvh bg-background">
    <header className="border-b border-border bg-surface/70"><div className="container-page flex h-16 items-center justify-between"><Logo /><div className="flex items-center gap-1"><LanguageSwitcher /><ThemeSwitcher /></div></div></header>
    <main id="main" className="container-page max-w-5xl py-8 sm:py-12">
      <Link href={`/s/${lectureId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground"><ArrowLeft aria-hidden className="size-4" />{t("replay.back")}</Link>
      <p className="mt-5 break-words text-sm font-semibold text-muted">{session?.lecture.title}</p>
      <h1 className="mt-2 text-[clamp(2.2rem,6vw,3.5rem)] font-semibold leading-tight">{t("replay.title")}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">{t("replay.subtitle")}</p>
      <p className="mt-5 rounded-xl border border-border bg-surface p-4 text-sm leading-6 text-muted">{t("replay.localNote")}</p>
      {offline ? <p role="status" className="mt-4 flex gap-3 rounded-xl border border-border p-4"><WifiOff aria-hidden className="size-5 shrink-0" />{t("replay.offline")}</p> : null}
      {storageError ? <p role="alert" className="mt-4 rounded-xl border border-border p-4">{t("replay.storageError")}</p> : null}
      {loading ? <div role="status" aria-label={t("replay.loading")} className="mt-8 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-60" /><span className="sr-only">{t("replay.loading")}</span></div> : <>
        {!session ? <div className="mt-8"><EmptyState title={t("replay.noSession")} body={t("replay.noSessionBody")} action={<Link href={rejoin} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">{t("replay.rejoin")}</Link>} /></div> : null}
        {accessError ? <div role="alert" className="mt-6 rounded-2xl border border-border bg-surface p-5"><p>{t(accessError)}</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void loadLocal()}>{t("replay.reload")}</Button><Link href={rejoin} className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-primary">{t("replay.rejoin")}</Link></div></div> : null}
        {session && offsets.length === 0 ? <div className="mt-8"><EmptyState icon={<History aria-hidden className="size-6" />} title={t("replay.noSignals")} body={t("replay.noSignalsBody")} /></div> : null}
        {offsets.length ? <section className="mt-8" aria-labelledby="choose-moments"><h2 id="choose-moments" className="text-2xl font-semibold">{t("replay.select")}</h2><p className="mt-2 text-sm text-muted">{t("replay.selected", { count: selected.length })}</p>
          <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-border bg-surface p-3">
            {offsets.map((offset) => <label id={`offset-${offset}`} key={offset} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium", selected.includes(offset) ? "border-primary bg-primary-soft" : "border-border")}>
              <input type="checkbox" checked={selected.includes(offset)} disabled={disabled || (!selected.includes(offset) && selected.length >= 20)} className="size-4 accent-primary" onChange={(event) => setSelected((current) => event.target.checked ? [...current, offset].sort((a, b) => a - b) : current.filter((item) => item !== offset))} />{t("replay.mark", { time: formatOffset(offset) })}
            </label>)}
          </div>
          <Button className="mt-4" disabled={disabled || selected.length === 0} loading={busy === "moments"} onClick={() => void findMoments(selected)}>{t("replay.find")}</Button>
        </section> : null}
        {error ? <div className="mt-6"><ErrorState title={t("replay.error")} body={t(error)} /></div> : null}
        <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">{busy ? t(busy === "moments" ? "replay.finding" : "replay.thinking") : ""}</p>
        {moments ? <section className="mt-6" aria-labelledby="replay-moments"><h2 id="replay-moments" className="text-2xl font-semibold">{t("replay.moments")}</h2><p className="mt-2 text-sm text-muted">{t("replay.combined")}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
          {moments.moments.map((moment) => <button key={moment.offset_ms} type="button" disabled={disabled} onClick={() => openMoment(moment)} aria-pressed={active?.moment.offset_ms === moment.offset_ms} aria-label={t("replay.openMoment", { time: formatOffset(moment.offset_ms), concept: moment.concept_title })} className={cn("min-h-20 rounded-2xl border p-4 text-left disabled:opacity-60", active?.moment.offset_ms === moment.offset_ms ? "border-primary bg-primary-soft" : "border-border bg-surface")}><span className="text-sm font-semibold tabular-nums text-muted">{formatOffset(moment.offset_ms)}</span><span className="mt-1 block break-words font-semibold">{moment.concept_title}</span></button>)}
        </div></section> : null}
        {active ? <section className="mt-8 rounded-3xl border border-border bg-surface/50 p-4 sm:p-6" aria-labelledby="discussion-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="discussion-title" className="break-words text-2xl font-semibold">{active.moment.concept_title}</h2><ReplaySource source={active.source} /></div>
          <p className="mt-2 text-xs text-muted">{t("replay.window", { start: formatOffset(active.moment.window.start_ms), end: formatOffset(active.moment.window.end_ms) })}</p>
          <h3 className="mt-5 text-lg font-semibold">{t("replay.recap")}</h3><p className="mt-2 whitespace-pre-wrap break-words leading-7">{active.moment.recap.text}</p><Citations citations={active.moment.recap.citations ?? []} />
          {active.source === "template" || latest?.source === "template" ? <p className="mt-3 text-xs leading-5 text-muted">{t("replay.templateNote")}</p> : null}
          <h3 ref={responseHeading} tabIndex={-1} className="mt-7 rounded-lg text-xl font-semibold outline-offset-4">{t("replay.discussion")}</h3>
          <div className="mt-4"><Dialogue messages={active.messages} /></div>
          {active.messages.length === 0 ? <div className="mt-4">{currentRecord ? <p className="mb-3 text-sm leading-6 text-muted">{t("replay.restartHint")}</p> : null}<Button disabled={disabled || active.blocked} onClick={() => void send()} loading={busy === "turn"}>{t("replay.begin")}</Button></div> : null}
          {active.messages.length > 0 && !active.completed && !active.blocked ? <form onSubmit={send} className="mt-5 space-y-4">
            {latest?.kind === "mcq" ? <fieldset disabled={disabled} className="space-y-2"><legend className="mb-3 font-semibold">{t("replay.choose")}</legend>{latest.options?.map((option) => <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3"><input type="radio" name="replay-choice" value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} className="size-4 shrink-0 accent-primary" /><span className="break-words">{option.text}</span></label>)}</fieldset> : <div><label htmlFor="replay-answer" className="mb-2 block font-semibold">{t("replay.answer")}</label><textarea id="replay-answer" rows={4} maxLength={600} value={answer} disabled={disabled} onChange={(event) => setAnswer(event.target.value)} aria-describedby="replay-answer-hint" className="w-full rounded-xl border border-border bg-surface p-3 text-base leading-6" /><p id="replay-answer-hint" className="mt-2 text-xs text-muted">{t("replay.answerHint")}</p></div>}
            <Button type="submit" disabled={disabled || (latest?.kind === "mcq" ? !choice : !answer.trim())} loading={busy === "turn"}>{t("replay.send")}</Button>
          </form> : null}
          {active.completed ? <div className="mt-5 rounded-2xl border border-border bg-primary-soft p-4"><h3 className="flex items-center gap-2 text-xl font-semibold"><CheckCircle2 aria-hidden className="size-5" />{t("replay.complete")}</h3><p className="mt-2 text-sm leading-6">{t(latest?.kind === "refusal" ? "replay.refusal" : "replay.completeBody")}</p></div> : null}
          {active.blocked || active.completed ? <div className="mt-4"><p className="text-sm leading-6 text-muted">{t("replay.restartHint")}</p><Button className="mt-3" variant="secondary" disabled={disabled} onClick={() => void findMoments([active.moment.offset_ms], active.moment.offset_ms)}>{t("replay.restart")}</Button></div> : null}
          {active.messages.length > 0 ? <fieldset className="mt-6" disabled={Boolean(busy)}><legend className="font-semibold">{t("replay.outcome")}</legend><div className="mt-3 flex flex-wrap gap-2">{(["unclear", "partial", "clear"] as const).map((value) => <button key={value} type="button" aria-pressed={(currentRecord?.outcome ?? "unclear") === value} onClick={() => void persist(active, value)} className={cn("min-h-11 rounded-xl border px-4 text-sm font-semibold", (currentRecord?.outcome ?? "unclear") === value ? "border-primary bg-primary-soft" : "border-border bg-surface")}>{t(`replay.outcome.${value}`)}</button>)}</div></fieldset> : null}
        </section> : null}
        {saved.length ? <section className="mt-10" aria-labelledby="saved-replay"><h2 id="saved-replay" className="text-2xl font-semibold">{t("replay.saved")}</h2><p className="mt-2 text-sm leading-6 text-muted">{t("replay.savedHint")}</p><div className="mt-4 space-y-3">{saved.map((record) => <details key={record.id} className="rounded-2xl border border-border bg-surface p-4"><summary className="cursor-pointer break-words font-semibold">{formatOffset(record.offsetMs)} · {record.conceptTitle}<span className="ml-2 text-xs font-normal text-muted">{t(record.completed ? "replay.complete" : "replay.inProgress")} · {t(`replay.outcome.${record.outcome}`)}</span></summary><div className="mt-4"><ReplaySource source={record.source} /><p className="mt-3 whitespace-pre-wrap break-words leading-7">{record.recap}</p><Citations citations={record.recapCitations} /><div className="mt-5"><Dialogue messages={record.messages} /></div><p className="mt-4 text-sm text-muted">{t("replay.restartHint")}</p><Button className="mt-3" variant="secondary" disabled={disabled} onClick={() => void findMoments([record.offsetMs], record.offsetMs)}>{t("replay.restart")}</Button></div></details>)}</div></section> : null}
        {saved.length || active?.completed ? <Link href={`/gapcards/${lectureId}`} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"><BookOpen aria-hidden className="size-4" />{t("replay.gapcards")}</Link> : null}
      </>}
    </main>
  </div>;
}
