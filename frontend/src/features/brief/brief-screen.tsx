"use client";

import { ArrowLeft, BookOpen, FileText, Plus, RefreshCw, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError, type HandoffLink, type Insight, type InsightContent, type Lecture } from "@/lib/api/client";
import { clearProfessorSession, getProfessorSession } from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { InsightCard } from "./insight-card";
import { InsightEditor, Textarea } from "./insight-editor";

type Editor = { kind: Insight["kind"]; insight?: Insight };

function errorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "LECTURE_NOT_ENDED") return "brief.notEnded";
    if (error.code === "INSUFFICIENT_EVIDENCE") return "brief.insufficientEvidence";
    if (error.code === "AI_BUDGET_EXHAUSTED") return "brief.generationLimit";
    if (error.status === 0) return "brief.network";
    if (error.status === 429) return "brief.rateLimit";
    if (error.status === 409) return "brief.conflict";
    if (error.status === 404 || error.status === 403 || error.status === 422) return "brief.notFound";
  }
  return "brief.error";
}

function uncertainOutcome(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.code === "INVALID_RESPONSE";
}

// A different lecture must not inherit pending requests, drafts or capabilities.
export function BriefScreen({ lectureId }: { lectureId: string }) {
  return <BriefContent key={lectureId} lectureId={lectureId} />;
}

function BriefContent({ lectureId }: { lectureId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<Insight["kind"]>("brief_next");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [rejecting, setRejecting] = useState<Insight | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, HandoffLink>>({});
  const [offline, setOffline] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const sessionToken = useRef<string | null>(null);
  const readController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);

  const clearProtectedState = useCallback(() => {
    readController.current?.abort();
    mutationController.current?.abort();
    busyRef.current = false;
    setLecture(null);
    setInsights([]);
    setLinks({});
    setEditor(null);
    setRejecting(null);
    setReason("");
    setError(null);
    setActionError(null);
    setMessage("");
    setUnresolved(false);
    setBusy(null);
    setLoading(true);
  }, []);

  const expireSession = useCallback(() => {
    clearProtectedState();
    sessionToken.current = null;
    clearProfessorSession();
    router.replace("/login");
  }, [clearProtectedState, router]);

  const reconcileSession = useCallback(() => {
    clearProtectedState();
    const session = getProfessorSession();
    if (!session) { expireSession(); return; }
    // Preserve the new login, but never reuse the previous account's draft or link.
    sessionToken.current = session.accessToken;
    setSessionRevision((current) => current + 1);
  }, [clearProtectedState, expireSession]);

  const load = useCallback(async (): Promise<boolean> => {
    const session = getProfessorSession();
    if (!session) { expireSession(); return false; }
    if (sessionToken.current && sessionToken.current !== session.accessToken) clearProtectedState();
    sessionToken.current = session.accessToken;
    readController.current?.abort();
    const request = new AbortController();
    readController.current = request;
    setLoading(true);
    setError(null);
    try {
      const [nextLecture, nextInsights] = await Promise.all([
        api.getLecture(session.accessToken, lectureId, request.signal),
        api.listInsights(session.accessToken, lectureId, request.signal),
      ]);
      if (!mounted.current || request.signal.aborted) return false;
      if (getProfessorSession()?.accessToken !== session.accessToken) { reconcileSession(); return false; }
      setLecture(nextLecture);
      setInsights(nextInsights);
      // A material may have been edited and republished in another tab.
      // The list cannot prove that a previously issued link is still valid.
      setLinks({});
      setUnresolved(false);
      return true;
    } catch (caught) {
      if (!mounted.current || request.signal.aborted) return false;
      if (getProfessorSession()?.accessToken !== session.accessToken) { reconcileSession(); return false; }
      if (caught instanceof ApiError && caught.status === 401) { expireSession(); return false; }
      setError(errorKey(caught));
      return false;
    } finally {
      if (mounted.current && !request.signal.aborted) setLoading(false);
    }
  }, [lectureId, clearProtectedState, expireSession, reconcileSession]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      readController.current?.abort();
      mutationController.current?.abort();
    };
  }, [load, sessionRevision]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const updateSession = (event: StorageEvent) => {
      if (event.key !== "daris.professor.session" && event.key !== null) return;
      if (getProfessorSession()?.accessToken !== sessionToken.current) reconcileSession();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("storage", updateSession);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("storage", updateSession);
    };
  }, [reconcileSession]);

  function replaceInsight(updated: Insight) {
    if (!updated || updated.lecture_id !== lectureId || typeof updated.insight_id !== "string") {
      throw new Error("Unexpected material response");
    }
    setInsights((current) => current.some((item) => item.insight_id === updated.insight_id)
      ? current.map((item) => item.insight_id === updated.insight_id ? updated : item)
      : [updated, ...current]);
    setLinks((current) => {
      const next = { ...current };
      delete next[updated.insight_id];
      return next;
    });
  }

  async function refresh() {
    if (busyRef.current || offline) return;
    const resolving = unresolved;
    if (await load() && resolving) {
      setActionError(null);
      setMessage("brief.resolved");
    }
  }

  async function run<T>(key: string, operation: (token: string, signal: AbortSignal) => Promise<T>, apply: (result: T) => void): Promise<void> {
    if (busyRef.current || offline || loading || unresolved || error) return;
    const session = getProfessorSession();
    if (!session) { expireSession(); return; }
    if (session.accessToken !== sessionToken.current) { reconcileSession(); return; }
    busyRef.current = true;
    setBusy(key);
    setActionError(null);
    setMessage("");
    const request = new AbortController();
    mutationController.current = request;
    const isCurrent = () => {
      if (!mounted.current || request.signal.aborted) return false;
      if (getProfessorSession()?.accessToken !== session.accessToken) { reconcileSession(); return false; }
      return true;
    };
    try {
      const result = await operation(session.accessToken, request.signal);
      // Request callbacks must not change state until this session/lifecycle check.
      if (!isCurrent()) return;
      apply(result);
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof ApiError && caught.status === 401) expireSession();
      else if (uncertainOutcome(caught)) {
        // The server may have saved the change before the response was lost.
        // Close stale forms and discard capabilities; read once, never replay.
        setEditor(null);
        setRejecting(null);
        setReason("");
        setLinks({});
        setUnresolved(true);
        setActionError("brief.uncertain");
        if (await load() && isCurrent()) {
          setActionError(null);
          setMessage("brief.resolved");
        }
      } else {
        setActionError(caught instanceof ApiError && caught.status === 422 ? "insight.validation" : errorKey(caught));
        if (caught instanceof ApiError && caught.status === 409) await load();
      }
    } finally {
      if (mutationController.current === request) {
        mutationController.current = null;
        busyRef.current = false;
        if (mounted.current && !request.signal.aborted) setBusy(null);
      }
    }
  }

  async function generate() {
    if (lecture?.status !== "ended") return;
    await run("generate", (token, signal) => api.generateInsight(token, lectureId, { kind, max_concepts: 3 }, signal), (result) => {
      if (!result || !result.insight || result.insight.kind !== kind || result.insight.status !== "pending_approval" ||
        !["template", "prebaked", "live"].includes(result.source) || result.insight.source !== result.source) {
        throw new Error("Unexpected generation response");
      }
      replaceInsight(result.insight);
      setMessage("brief.generated");
    });
  }

  async function save(content: InsightContent, editReason: string) {
    if (!editor) return;
    await run("save", (token, signal) => editor.insight
      ? api.editInsight(token, lectureId, editor.insight.insight_id, { content, reason: editReason }, signal)
      : api.createInsight(token, lectureId, { kind: editor.kind, content }, signal), (updated) => {
      replaceInsight(updated);
      setMessage(editor.insight ? "brief.updated" : "brief.saved");
      setEditor(null);
    });
  }

  async function approve(insight: Insight) {
    await run(`${insight.insight_id}:approve`, (token, signal) => api.approveInsight(token, lectureId, insight.insight_id, signal), (updated) => {
      replaceInsight(updated);
      setMessage("brief.approved");
    });
  }

  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejecting || !reason.trim()) return;
    await run("reject", (token, signal) => api.rejectInsight(token, lectureId, rejecting.insight_id, reason.trim(), signal), (updated) => {
      replaceInsight(updated);
      setMessage("brief.rejected");
      setRejecting(null);
      setReason("");
    });
  }

  async function publish(insight: Insight) {
    await run(`${insight.insight_id}:publish`, (token, signal) => api.publishHandoff(token, lectureId, insight.insight_id, signal), (link) => {
      if (!link || link.insight_id !== insight.insight_id || typeof link.handoff_url !== "string") {
        throw new Error("Unexpected publication response");
      }
      setLinks((current) => ({ ...current, [insight.insight_id]: link }));
      setInsights((current) => current.map((item) => item.insight_id === insight.insight_id ? { ...item, status: "published" } : item));
      setMessage("brief.published");
    });
  }

  const visible = insights.filter((item) => item.kind === kind);
  const disabled = Boolean(busy) || offline || loading || unresolved || Boolean(error);
  const editorError = actionError ? <p role="alert" className="app-panel app-panel-rose mb-4 p-4 text-sm leading-6">{t(actionError)}</p> : null;

  return <div className="app-page">
    <header className="app-header">
      <div className="container-page flex items-center justify-between gap-3">
        <Logo /><div className="flex items-center gap-1"><LanguageSwitcher /><ThemeSwitcher /></div>
      </div>
    </header>
    <main id="main" className="container-page py-8 sm:py-12">
      <Link href={`/summary/${lectureId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />{t("brief.summary")}
      </Link>
      <div className="app-hero mt-5 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-3xl">
          {lecture ? <p className="mb-4 break-words text-sm font-medium text-muted">{lecture.title}</p> : null}
          <h1 className="text-[clamp(2rem,5vw,3.75rem)] font-bold leading-tight tracking-tight">{t("brief.title")}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">{t("brief.subtitle")}</p>
        </div>
        <Button variant="secondary" disabled={Boolean(busy) || offline || loading} onClick={() => void refresh()}>
          <RefreshCw aria-hidden className="size-4" />{t("insight.refresh")}
        </Button>
      </div>
      {lecture ? <nav aria-label={t("teaching.related")} className="mt-5 flex flex-wrap gap-2.5">
        <Link href={`/transcript/${lectureId}`} className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface/75 px-4 py-2 text-sm font-medium hover:bg-primary-soft/60">{t("teaching.transcript")}</Link>
        <Link href={`/cohort/${lecture.course_id}`} className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface/75 px-4 py-2 text-sm font-medium hover:bg-primary-soft/60">{t("teaching.cohort")}</Link>
        <Link href={`/settings/autonomy/${lectureId}`} className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface/75 px-4 py-2 text-sm font-medium hover:bg-primary-soft/60">{t("teaching.autonomy")}</Link>
      </nav> : null}
      {offline ? <p role="status" className="app-panel app-panel-rose mt-5 flex items-center gap-3 p-5 text-sm leading-6"><WifiOff aria-hidden className="size-5 shrink-0" />{t("brief.offline")}</p> : null}
      <p role="status" aria-live="polite" className="mt-4 text-sm font-semibold">{message ? t(message) : ""}</p>
      {!editor && !rejecting ? editorError : null}
      {loading ? <div role="status" aria-label={t("brief.loading")} className="app-panel mt-8 space-y-5 p-6 sm:p-8">
        <Skeleton className="h-14 w-full" /><Skeleton className="h-72 w-full" />
        <span className="sr-only">{t("brief.loading")}</span>
      </div> : error ? <div className="mt-8"><ErrorState title={t("brief.error")} body={t(error)} action={<Button disabled={offline || Boolean(busy)} onClick={() => void refresh()}>{t("brief.retry")}</Button>} /></div> : lecture ? <>
        <div className="app-panel app-panel-mint mt-6 flex items-start gap-3 p-5 text-sm leading-6 text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" /><p>{t("brief.manualNotice")}</p>
        </div>
        <div className="mb-7 mt-8 flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label={t("insight.kind")} className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface/80 p-1.5">
            {(["brief_next", "handoff"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value}
              onClick={() => setKind(value)} className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold", kind === value ? "bg-primary-soft text-primary-strong" : "text-muted hover:bg-background")}>
              {value === "brief_next" ? <BookOpen aria-hidden className="size-4" /> : <FileText aria-hidden className="size-4" />}
              {t(`insight.kind.${value}`)}<span className="rounded-full bg-background px-2 text-sm">{insights.filter((item) => item.kind === value).length}</span>
            </button>)}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={disabled || lecture.status !== "ended"} loading={busy === "generate"} onClick={() => void generate()}>
              <Sparkles aria-hidden className="size-4" />{t("brief.generate", { kind: t(`insight.kind.${kind}`) })}
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => { setActionError(null); setEditor({ kind }); }}><Plus aria-hidden className="size-4" />{t("brief.new")}</Button>
          </div>
        </div>
        {lecture.status !== "ended" ? <p className="mt-3 text-sm text-muted">{t("brief.notEnded")}</p> : null}
        {insights.length >= 100 ? <p className="mt-3 text-sm text-muted">{t("brief.limit")}</p> : null}
        <div className="mt-6 space-y-8">
          {visible.length === 0 ? <EmptyState icon={<FileText aria-hidden className="size-6" />} title={t("brief.emptyTitle")} body={t("brief.emptyBody")} /> :
            visible.map((insight) => <InsightCard key={`${insight.insight_id}:${links[insight.insight_id]?.expires_at ?? ""}`} insight={insight} link={links[insight.insight_id]}
              disabled={disabled} busy={busy?.startsWith(`${insight.insight_id}:`) ? busy.split(":")[1] ?? null : null}
              onApprove={() => void approve(insight)} onEdit={() => { setActionError(null); setEditor({ kind: insight.kind, insight }); }}
              onReject={() => { setActionError(null); setReason(""); setRejecting(insight); }} onPublish={() => void publish(insight)} />)}
        </div>
      </> : null}
    </main>
    <Dialog open={Boolean(editor)} onClose={() => { if (!busyRef.current) setEditor(null); }} title={t(editor?.insight ? "insight.editTitle" : "insight.createTitle")}
      description={editor ? t(`insight.kind.${editor.kind}`) : undefined} closeLabel={t("common.close")} className="max-h-[90dvh] w-[min(94vw,700px)] overflow-y-auto">
      {editorError}
      {editor ? <InsightEditor key={editor.insight?.insight_id ?? editor.kind} initial={editor.insight} kind={editor.kind} busy={disabled} onSave={save} onCancel={() => setEditor(null)} /> : null}
    </Dialog>
    <Dialog open={Boolean(rejecting)} onClose={() => { if (!busyRef.current) setRejecting(null); }} title={t("insight.rejectTitle")}
      description={t("insight.rejectHint")} closeLabel={t("common.close")}>
      <form onSubmit={reject} className="space-y-4 pb-6">
        {editorError}
        {rejecting?.status === "published" ? <p className="rounded-xl bg-primary-soft p-3 text-sm">{t("brief.revokeNotice")}</p> : null}
        <Textarea label={t("insight.reason")} required maxLength={1000} value={reason} disabled={disabled} onChange={(event) => setReason(event.target.value)} />
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => setRejecting(null)}>{t("insight.cancel")}</Button>
          <Button type="submit" disabled={disabled || !reason.trim()} loading={busy === "reject"}>{t("insight.confirmReject")}</Button>
        </div>
      </form>
    </Dialog>
  </div>;
}
