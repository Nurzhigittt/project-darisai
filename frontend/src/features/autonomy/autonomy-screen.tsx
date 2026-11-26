"use client";

import { ArrowLeft, LockKeyhole, RefreshCw, ShieldCheck, ShieldOff, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError, type ConceptAutonomy, type Lecture } from "@/lib/api/client";
import { clearProfessorSession, getProfessorSession } from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";

function errorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "AUTONOMY_NOT_ELIGIBLE") return "autonomy.notEligibleError";
    if (error.status === 0) return "autonomy.network";
    if (error.status === 403) return "autonomy.forbidden";
    if (error.status === 404) return "autonomy.notFound";
    if (error.status === 422) return "autonomy.validation";
    if (error.status === 429) return "autonomy.rateLimit";
  }
  return "autonomy.error";
}

function uncertainOutcome(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}

// A new lecture gets an isolated request lifecycle and cannot inherit a pending decision.
export function AutonomyScreen({ lectureId }: { lectureId: string }) {
  return <AutonomyContent key={lectureId} lectureId={lectureId} />;
}

function AutonomyContent({ lectureId }: { lectureId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [policies, setPolicies] = useState<ConceptAutonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConceptAutonomy | null>(null);
  const [busy, setBusy] = useState(false);
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
    setPolicies([]);
    setSelected(null);
    setError(null);
    setActionError(null);
    setMessage(null);
    setUnresolved(false);
    setBusy(false);
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
    // Preserve a new valid session, but never reuse the previous account's selection.
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
      const [nextLecture, nextPolicies] = await Promise.all([
        api.getLecture(session.accessToken, lectureId, request.signal),
        api.listConceptAutonomy(session.accessToken, lectureId, request.signal),
      ]);
      if (!mounted.current || request.signal.aborted) return false;
      if (getProfessorSession()?.accessToken !== session.accessToken) { reconcileSession(); return false; }
      setLecture(nextLecture);
      setPolicies(nextPolicies);
      setUnresolved(false);
      return true;
    } catch (caught) {
      if (!mounted.current || request.signal.aborted) return false;
      if (getProfessorSession()?.accessToken !== session.accessToken) { reconcileSession(); return false; }
      if (caught instanceof ApiError && caught.status === 401) expireSession();
      else setError(errorKey(caught));
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

  async function refresh() {
    if (busyRef.current || offline) return;
    const resolving = unresolved;
    setActionError(null);
    setMessage(null);
    if (await load() && resolving) setMessage("autonomy.resolved");
  }

  async function confirm() {
    if (!selected || busyRef.current || loading || offline || unresolved || error) return;
    const session = getProfessorSession();
    if (!session) { expireSession(); return; }
    if (session.accessToken !== sessionToken.current) { reconcileSession(); return; }
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    const request = new AbortController();
    mutationController.current = request;
    const mode = selected.mode === "locked" ? "whitelisted" : "locked";
    try {
      const updated = await api.updateConceptAutonomy(session.accessToken, lectureId, selected.concept_canonical_id, { mode }, request.signal);
      if (!mounted.current || request.signal.aborted) return;
      if (getProfessorSession()?.accessToken !== session.accessToken) { reconcileSession(); return; }
      // Do not display success for an empty, unrelated or unrecognized response.
      if (!updated || updated.lecture_id !== lectureId || updated.course_id !== selected.course_id ||
        updated.concept_canonical_id !== selected.concept_canonical_id ||
        (updated.mode !== "locked" && updated.mode !== "whitelisted")) throw new Error("Unexpected autonomy response");
      setPolicies((current) => current.map((item) => item.concept_canonical_id === updated.concept_canonical_id ? updated : item));
      setSelected(null);
      setMessage("autonomy.saved");
    } catch (caught) {
      if (!mounted.current || request.signal.aborted) return;
      if (getProfessorSession()?.accessToken !== session.accessToken) { reconcileSession(); return; }
      if (caught instanceof ApiError && caught.status === 401) { expireSession(); return; }
      if (uncertainOutcome(caught)) {
        setSelected(null);
        setUnresolved(true);
        setActionError("autonomy.uncertain");
        // A failed response can follow a successful save. Read, never replay, the mutation.
        if (await load() && mounted.current && !request.signal.aborted) {
          setActionError(null);
          setMessage("autonomy.resolved");
        }
      } else setActionError(errorKey(caught));
    } finally {
      if (mounted.current && !request.signal.aborted) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const disabled = busy || loading || offline || unresolved || Boolean(error);
  const courseTitle = lecture?.course_title ?? t("autonomy.courseFallback");
  const courseNotice = lecture ? t("autonomy.courseNotice", { course: courseTitle }) : "";
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return <div className="app-page">
    <header className="app-header">
      <div className="container-page flex flex-wrap items-center justify-between gap-3">
        <Logo /><div className="flex items-center gap-1"><LanguageSwitcher /><ThemeSwitcher /></div>
      </div>
    </header>
    <main id="main" className="container-page py-7 sm:py-10">
      <Link href="/professor" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />{t("autonomy.professor")}
      </Link>
      <div className="app-hero mt-5 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-3xl">
          {lecture ? <p className="mb-3 break-words text-sm font-semibold text-primary-strong">{courseTitle} · {lecture.title}</p> : null}
          <h1 className="text-[clamp(2rem,4.6vw,3.5rem)] font-bold leading-[1.08]">{t("autonomy.title")}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">{t("autonomy.subtitle")}</p>
        </div>
        <Button variant="secondary" disabled={busy || loading || offline || Boolean(selected)} onClick={() => void refresh()}>
          <RefreshCw aria-hidden className="size-4" />{t("autonomy.refresh")}
        </Button>
      </div>
      {offline ? <p role="status" className="app-panel mt-5 flex items-center gap-3 p-5 text-sm leading-6"><WifiOff aria-hidden className="size-5 shrink-0" />{t("autonomy.offline")}</p> : null}
      <p role="status" aria-live="polite" className="mt-4 text-sm font-semibold">{message ? t(message) : ""}</p>
      {!selected && actionError ? <p role="alert" className="app-panel app-panel-rose mt-4 p-5 text-sm leading-6">{t(actionError)}</p> : null}
      {loading ? <div role="status" aria-label={t("autonomy.loading")} className="mt-8 space-y-4">
        <Skeleton className="h-24 w-full" /><Skeleton className="h-52 w-full" /><span className="sr-only">{t("autonomy.loading")}</span>
      </div> : error ? <div className="mt-8"><ErrorState title={t("autonomy.errorTitle")} body={t(error)} action={<Button disabled={offline || busy} onClick={() => void refresh()}>{t("autonomy.retry")}</Button>} /></div> : lecture ? <>
        <section aria-label={t("autonomy.title")} className="app-panel app-panel-mint mt-7 p-6 text-sm leading-7 sm:p-7">
          <div className="flex items-start gap-3"><ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" /><p className="font-medium">{courseNotice}</p></div>
          <p className="mt-3 text-muted">{t("autonomy.policyNotice")}</p>
          <p className="mt-2 text-muted">{t("autonomy.counterNotice")}</p>
        </section>
        <div className="mt-6 grid gap-5">
          {policies.length === 0 ? <EmptyState icon={<LockKeyhole aria-hidden className="size-6" />} title={t("autonomy.emptyTitle")} body={t("autonomy.emptyBody")} /> : policies.map((policy) => <article key={policy.concept_canonical_id} aria-labelledby={`concept-${policy.concept_canonical_id}`} className="app-panel p-6 sm:p-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
              <div className="min-w-0 w-full sm:flex-1">
                <Badge tone={policy.mode === "locked" ? "neutral" : "primary"}>{policy.mode === "locked" ? <LockKeyhole aria-hidden className="size-3.5" /> : <ShieldCheck aria-hidden className="size-3.5" />}{t(`autonomy.mode.${policy.mode}`)}</Badge>
                <h2 id={`concept-${policy.concept_canonical_id}`} className="mt-3 break-words text-2xl font-bold">{policy.concept_title}</h2>
                <p className="mt-2 text-sm text-muted">{t(policy.mode === "locked" ? "autonomy.lockedHint" : "autonomy.allowedHint")}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/45 p-4">
                  <Badge tone={policy.eligible ? "positive" : "neutral"}>{t(policy.eligible ? "autonomy.eligibility.ready" : "autonomy.eligibility.notReady")}</Badge>
                  {policy.observation_started_at ? <span className="break-words text-xs leading-6 text-muted">{t("autonomy.eligibility.observation", { date: dateFormatter.format(new Date(policy.observation_started_at)) })}</span> : null}
                  {policy.whitelisted_at ? <span className="break-words text-xs leading-6 text-muted">{t("autonomy.eligibility.whitelisted", { date: dateFormatter.format(new Date(policy.whitelisted_at)) })}</span> : null}
                </div>
                <p className="mt-3 text-xs leading-6 text-muted">{t("autonomy.eligibility.requirements")}</p>
                {policy.policy_reason ? <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-primary/30 pl-3 text-xs leading-6 text-muted">{t("autonomy.eligibility.reason", { reason: policy.policy_reason })}</p> : null}
              </div>
              <Button variant={policy.mode === "locked" ? "primary" : "secondary"} disabled={disabled} onClick={() => { setActionError(null); setMessage(null); setSelected(policy); }}>
                {policy.mode === "locked" ? <ShieldCheck aria-hidden className="size-4" /> : <ShieldOff aria-hidden className="size-4" />}{t(policy.mode === "locked" ? "autonomy.allow" : "autonomy.revoke")}
              </Button>
            </div>
            <dl className="mt-6 grid gap-3 border-t border-border/70 pt-5 text-sm sm:grid-cols-2">
              <div className="rounded-2xl bg-background/55 p-4"><dt className="text-muted">{t("autonomy.approvals")}</dt><dd className="mt-2 text-2xl font-bold tabular-nums">{policy.approvals}</dd></div>
              <div className="rounded-2xl bg-primary-soft/40 p-4"><dt className="text-muted">{t("autonomy.rejections")}</dt><dd className="mt-2 text-2xl font-bold tabular-nums">{policy.rejections}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-muted">{policy.updated_at ? t("autonomy.updated", { date: dateFormatter.format(new Date(policy.updated_at)) }) : t("autonomy.default")}</p>
          </article>)}
        </div>
      </> : null}
    </main>
    <Dialog open={Boolean(selected)} onClose={() => { if (!busyRef.current) setSelected(null); }} closeLabel={t("common.close")}
      title={t(selected?.mode === "locked" ? "autonomy.confirmAllowTitle" : "autonomy.confirmRevokeTitle")}
      description={selected?.concept_title}>
      <div className="space-y-4 pb-5 text-sm leading-6">
        <p className="rounded-xl bg-primary-soft p-3 font-medium">{courseNotice}</p>
        <p>{t(selected?.mode === "locked" ? "autonomy.allowExplanation" : "autonomy.revokeExplanation")}</p>
        {selected && actionError ? <p role="alert" className="rounded-xl border border-border p-3">{t(actionError)}</p> : null}
        {offline ? <p role="status">{t("autonomy.offline")}</p> : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>{t("autonomy.cancel")}</Button>
          <Button disabled={disabled} loading={busy} onClick={() => void confirm()}>{t(selected?.mode === "locked" ? "autonomy.confirmAllow" : "autonomy.confirmRevoke")}</Button>
        </div>
      </div>
    </Dialog>
  </div>;
}
