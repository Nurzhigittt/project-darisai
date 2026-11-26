"use client";

import { ArrowLeft, BookOpen, FileText, Plus, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
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
    if (error.status === 0) return "brief.network";
    if (error.status === 429) return "brief.rateLimit";
    if (error.status === 409) return "brief.conflict";
    if (error.status === 404 || error.status === 403 || error.status === 422) return "brief.notFound";
  }
  return "brief.error";
}

export function BriefScreen({ lectureId }: { lectureId: string }) {
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
  const busyRef = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const expireSession = useCallback(() => {
    clearProfessorSession();
    setLecture(null);
    setInsights([]);
    setLinks({});
    setEditor(null);
    setRejecting(null);
    router.replace("/login");
  }, [router]);

  const load = useCallback(async () => {
    const session = getProfessorSession();
    if (!session) { expireSession(); return; }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(null);
    try {
      const [nextLecture, nextInsights] = await Promise.all([
        api.getLecture(session.accessToken, lectureId, request.signal),
        api.listInsights(session.accessToken, lectureId, request.signal),
      ]);
      if (request.signal.aborted) return;
      setLecture(nextLecture);
      setInsights(nextInsights);
      // A material may have been edited and republished in another tab.
      // The list cannot prove that a previously issued link is still valid.
      setLinks({});
    } catch (caught) {
      if (request.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { expireSession(); return; }
      setError(errorKey(caught));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [lectureId, expireSession]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  function replaceInsight(updated: Insight) {
    setInsights((current) => current.some((item) => item.insight_id === updated.insight_id)
      ? current.map((item) => item.insight_id === updated.insight_id ? updated : item)
      : [updated, ...current]);
    setLinks((current) => {
      const next = { ...current };
      delete next[updated.insight_id];
      return next;
    });
  }

  async function run(key: string, operation: (token: string) => Promise<void>): Promise<boolean> {
    if (busyRef.current || offline) return false;
    const session = getProfessorSession();
    if (!session) { expireSession(); return false; }
    busyRef.current = true;
    setBusy(key);
    setActionError(null);
    setMessage("");
    try {
      await operation(session.accessToken);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) expireSession();
      else {
        setActionError(caught instanceof ApiError && caught.status === 422 ? "insight.validation" :
          caught instanceof ApiError && caught.status === 0 ? "brief.actionError" : errorKey(caught));
        // On a stale state or uncertain network outcome, fetch the server's state.
        // Never automatically repeat a mutation (especially creation/publication).
        if (caught instanceof ApiError && (caught.status === 409 || caught.status === 0)) await load();
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function save(content: InsightContent, editReason: string) {
    if (!editor) return;
    const done = await run("save", async (token) => {
      const updated = editor.insight
        ? await api.editInsight(token, lectureId, editor.insight.insight_id, { content, reason: editReason })
        : await api.createInsight(token, lectureId, { kind: editor.kind, content });
      replaceInsight(updated);
      setMessage(editor.insight ? "brief.updated" : "brief.saved");
    });
    if (done) setEditor(null);
  }

  async function approve(insight: Insight) {
    await run(`${insight.insight_id}:approve`, async (token) => {
      replaceInsight(await api.approveInsight(token, lectureId, insight.insight_id));
      setMessage("brief.approved");
    });
  }

  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejecting || !reason.trim()) return;
    const done = await run("reject", async (token) => {
      replaceInsight(await api.rejectInsight(token, lectureId, rejecting.insight_id, reason.trim()));
      setMessage("brief.rejected");
    });
    if (done) { setRejecting(null); setReason(""); }
  }

  async function publish(insight: Insight) {
    await run(`${insight.insight_id}:publish`, async (token) => {
      const link = await api.publishHandoff(token, lectureId, insight.insight_id);
      setLinks((current) => ({ ...current, [insight.insight_id]: link }));
      setInsights((current) => current.map((item) => item.insight_id === insight.insight_id ? { ...item, status: "published" } : item));
      setMessage("brief.published");
    });
  }

  const visible = insights.filter((item) => item.kind === kind);
  const disabled = Boolean(busy) || offline;
  const editorError = actionError ? <p role="alert" className="mb-4 rounded-xl border border-border bg-background p-3">{t(actionError)}</p> : null;

  return <div className="min-h-dvh bg-background">
    <header className="border-b border-border bg-surface/70">
      <div className="container-page flex h-16 items-center justify-between">
        <Logo /><div className="flex items-center gap-1"><LanguageSwitcher /><ThemeSwitcher /></div>
      </div>
    </header>
    <main id="main" className="container-page py-8 sm:py-12">
      <Link href={`/summary/${lectureId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />{t("brief.summary")}
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          {lecture ? <p className="mb-2 break-words text-sm font-semibold text-muted">{lecture.title}</p> : null}
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight">{t("brief.title")}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">{t("brief.subtitle")}</p>
        </div>
        <Button variant="secondary" disabled={disabled || loading} onClick={() => void load()}>
          <RefreshCw aria-hidden className="size-4" />{t("insight.refresh")}
        </Button>
      </div>
      {offline ? <p role="status" className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-surface p-4"><WifiOff aria-hidden className="size-5 shrink-0" />{t("brief.offline")}</p> : null}
      <p role="status" aria-live="polite" className="mt-4 text-sm font-semibold">{message ? t(message) : ""}</p>
      {!editor && !rejecting ? editorError : null}
      {loading ? <div role="status" aria-label={t("brief.loading")} className="mt-8 space-y-4">
        <Skeleton className="h-14 w-full" /><Skeleton className="h-72 w-full" />
        <span className="sr-only">{t("brief.loading")}</span>
      </div> : error ? <div className="mt-8"><ErrorState title={t("brief.error")} body={t(error)} action={<Button disabled={offline} onClick={() => void load()}>{t("brief.retry")}</Button>} /></div> : lecture ? <>
        <div className="mt-7 flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-6 text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" /><p>{t("brief.manualNotice")}</p>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label={t("insight.kind")} className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-1.5">
            {(["brief_next", "handoff"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value}
              onClick={() => setKind(value)} className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-semibold", kind === value ? "bg-primary-soft text-foreground" : "text-muted hover:bg-background")}>
              {value === "brief_next" ? <BookOpen aria-hidden className="size-4" /> : <FileText aria-hidden className="size-4" />}
              {t(`insight.kind.${value}`)}<span className="rounded-full bg-background px-2 text-sm">{insights.filter((item) => item.kind === value).length}</span>
            </button>)}
          </div>
          <Button disabled={disabled} onClick={() => { setActionError(null); setEditor({ kind }); }}><Plus aria-hidden className="size-4" />{t("brief.new")}</Button>
        </div>
        {insights.length >= 100 ? <p className="mt-3 text-sm text-muted">{t("brief.limit")}</p> : null}
        <div className="mt-6 space-y-6">
          {visible.length === 0 ? <EmptyState icon={<FileText aria-hidden className="size-6" />} title={t("brief.emptyTitle")} body={t("brief.emptyBody")} /> :
            visible.map((insight) => <InsightCard key={`${insight.insight_id}:${links[insight.insight_id]?.expires_at ?? ""}`} insight={insight} link={links[insight.insight_id]}
              disabled={disabled} busy={busy?.startsWith(`${insight.insight_id}:`) ? busy.split(":")[1] ?? null : null}
              onApprove={() => void approve(insight)} onEdit={() => { setActionError(null); setEditor({ kind: insight.kind, insight }); }}
              onReject={() => { setActionError(null); setReason(""); setRejecting(insight); }} onPublish={() => void publish(insight)} />)}
        </div>
      </> : null}
    </main>
    <Dialog open={Boolean(editor)} onClose={() => { if (!busy) setEditor(null); }} title={t(editor?.insight ? "insight.editTitle" : "insight.createTitle")}
      description={editor ? t(`insight.kind.${editor.kind}`) : undefined} closeLabel={t("common.close")} className="max-h-[90dvh] w-[min(94vw,700px)] overflow-y-auto">
      {editorError}
      {editor ? <InsightEditor key={editor.insight?.insight_id ?? editor.kind} initial={editor.insight} kind={editor.kind} busy={disabled} onSave={save} onCancel={() => setEditor(null)} /> : null}
    </Dialog>
    <Dialog open={Boolean(rejecting)} onClose={() => { if (!busy) setRejecting(null); }} title={t("insight.rejectTitle")}
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
