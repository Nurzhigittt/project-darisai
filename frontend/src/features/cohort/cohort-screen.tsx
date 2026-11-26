"use client";

import { ArrowLeft, ChartNoAxesCombined, Info, LogOut, RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError, type CohortMemory } from "@/lib/api/client";
import { clearProfessorSession, getProfessorSession } from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";

function errorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "cohort.network";
    if (error.status === 403 || error.status === 404 || error.status === 422) return "cohort.unavailable";
    if (error.status === 429) return "cohort.rateLimit";
  }
  return "cohort.genericError";
}

function MetricCell({ value, percent = false, shade = false }: { value?: number | null; percent?: boolean; shade?: boolean }) {
  const { locale, t } = useI18n();
  const present = typeof value === "number" && Number.isFinite(value);
  const number = present ? new Intl.NumberFormat(locale, {
    style: percent ? "percent" : "decimal", maximumFractionDigits: percent ? 2 : 4,
  }).format(value) : null;
  const tint = present && shade ? Math.min(1, Math.max(0, value)) * 0.22 : 0;

  return <td className="border-t border-border p-4 text-center tabular-nums text-foreground" style={{ backgroundColor: `rgb(var(--primary-rgb) / ${tint})` }}>
    {number ?? <><span aria-hidden>—</span><span className="sr-only">{t("cohort.noValue")}</span></>}
  </td>;
}

function CohortTable({ memory }: { memory: CohortMemory }) {
  const { t } = useI18n();
  return <section className="mt-8" aria-labelledby="cohort-table-title">
    <h2 id="cohort-table-title" className="text-2xl font-semibold">{t("cohort.tableTitle")}</h2>
    <p className="mt-2 text-sm leading-6 text-muted">{t("cohort.identifiers")}</p>
    <p id="cohort-scroll-hint" className="mt-1 text-sm leading-6 text-muted">{t("cohort.scroll")}</p>
    <div role="region" aria-label={t("cohort.tableRegion")} aria-describedby="cohort-scroll-hint" tabIndex={0}
      className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-border bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">{t("cohort.tableTitle")}. {t("cohort.denominator")}</caption>
        <thead>
          <tr className="bg-background text-left align-bottom">
            {["concept", "lectures", "events", "signalShare", "clusterShare", "peak"].map((column, index) =>
              <th key={column} scope="col" className={`px-4 py-5 font-semibold leading-5 ${index === 0 ? "w-64" : "text-center"}`}>{t(`cohort.${column}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {memory.concepts.map((concept) => <tr key={concept.concept_canonical_id}>
            <th scope="row" className="border-t border-border p-4 text-left align-top font-normal">
              <code className="break-all font-mono text-xs leading-5">{concept.concept_canonical_id}</code>
              {concept.status === "insufficient_history" ? <span className="mt-2 block text-xs font-semibold text-muted">{t("cohort.insufficient")}</span> : null}
            </th>
            {concept.status === "insufficient_history"
              // Status takes precedence even if a malformed response contains forbidden values.
              ? <td colSpan={5} className="border-t border-border bg-background/60 p-4 text-center text-muted">{t("cohort.suppressed")}</td>
              : <>
                <MetricCell value={concept.observed_lectures} />
                <MetricCell value={concept.mean_signal_events_per_lecture} />
                <MetricCell value={concept.signal_observed_lecture_share} percent shade />
                <MetricCell value={concept.cluster_observed_lecture_share} percent shade />
                <MetricCell value={concept.mean_cluster_peak_intensity} shade />
              </>}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="mt-4 grid gap-4 text-sm leading-6 text-muted sm:grid-cols-2">
      <div><p>{t("cohort.denominator")}</p><p className="mt-1">{t("cohort.valuesLegend")}</p></div>
      <div>
        <div aria-hidden className="mb-2 flex max-w-xs items-center gap-3 text-xs tabular-nums">
          <span>{t("cohort.scaleLow")}</span>
          <span className="h-3 flex-1 rounded-full border border-border" style={{ background: "linear-gradient(to right, rgb(var(--primary-rgb) / 0), rgb(var(--primary-rgb) / 0.22))" }} />
          <span>{t("cohort.scaleHigh")}</span>
        </div>
        <p>{t("cohort.shadingLegend")}</p>
      </div>
    </div>
    {memory.concepts.length >= 200 ? <p className="mt-4 text-sm font-semibold text-muted">{t("cohort.limit")}</p> : null}
  </section>;
}

export function CohortScreen({ courseId }: { courseId: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [memory, setMemory] = useState<CohortMemory | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const expireSession = useCallback(() => {
    controller.current?.abort();
    clearProfessorSession();
    setMemory(null);
    setCourseTitle(null);
    setError(null);
    router.replace("/login");
  }, [router]);

  const ignoreChangedSession = useCallback((expectedToken: string): boolean => {
    const current = getProfessorSession();
    if (current?.accessToken === expectedToken) return false;
    if (!current) { expireSession(); return true; }
    // An old request must neither expose the previous professor's report nor
    // invalidate a newer sign-in when the storage event has not arrived yet.
    controller.current?.abort();
    setMemory(null);
    setCourseTitle(null);
    setError(null);
    router.replace("/professor");
    return true;
  }, [expireSession, router]);

  const load = useCallback(async () => {
    controller.current?.abort();
    const session = getProfessorSession();
    if (!session) { expireSession(); return; }
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setMemory(null);
    setCourseTitle(null);
    setError(null);
    try {
      const [nextMemory, courses] = await Promise.all([
        api.getCohortMemory(session.accessToken, courseId, request.signal),
        api.listCourses(session.accessToken, request.signal),
      ]);
      if (request.signal.aborted || controller.current !== request) return;
      if (ignoreChangedSession(session.accessToken)) return;
      const course = courses.find((item) => item.id === courseId);
      if (!course) throw new ApiError(404, "NOT_FOUND", "Course not found.");
      setMemory(nextMemory);
      setCourseTitle(course.title);
    } catch (caught) {
      if (request.signal.aborted || controller.current !== request) return;
      if (ignoreChangedSession(session.accessToken)) return;
      if (caught instanceof ApiError && caught.status === 401) { expireSession(); return; }
      setError(errorKey(caught));
    } finally {
      if (!request.signal.aborted && controller.current === request) setLoading(false);
    }
  }, [courseId, expireSession, ignoreChangedSession]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    // Signing out in another tab must also clear the protected report here.
    const updateSession = (event: StorageEvent) => {
      if (event.key !== "daris.professor.session" && event.key !== null) return;
      if (!getProfessorSession()) expireSession();
      else void load();
    };
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("storage", updateSession);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("storage", updateSession);
    };
  }, [expireSession, load]);

  const generated = memory ? new Date(memory.generated_at) : null;
  const generatedLabel = generated && Number.isFinite(generated.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(generated) : null;

  return <div className="min-h-dvh bg-background">
    <header className="border-b border-border bg-surface/70">
      <div className="container-page flex min-h-16 flex-wrap items-center justify-between gap-2 py-2">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher /><ThemeSwitcher />
          <Button variant="ghost" className="px-3" aria-label={t("cohort.logout")} onClick={expireSession}><LogOut aria-hidden className="size-4" /></Button>
        </div>
      </div>
    </header>
    <main id="main" className="container-page py-8 sm:py-12">
      <Link href="/professor" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />{t("cohort.back")}
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          {courseTitle ? <p className="mb-2 break-words text-sm font-semibold text-muted">{courseTitle}</p> : null}
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight">{t("cohort.title")}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">{t("cohort.subtitle")}</p>
        </div>
        <Button variant="secondary" disabled={loading || offline} onClick={() => void load()}><RefreshCw aria-hidden className="size-4" />{t("cohort.refresh")}</Button>
      </div>
      {offline ? <p role="status" className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-surface p-4"><WifiOff aria-hidden className="size-5 shrink-0" />{t("cohort.offline")}</p> : null}
      {loading ? <div role="status" aria-label={t("cohort.loading")} className="mt-8 space-y-4">
        <Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /><span className="sr-only">{t("cohort.loading")}</span>
      </div> : error ? <div className="mt-8"><ErrorState title={t("cohort.error")} body={t(error)} action={<Button disabled={offline} onClick={() => void load()}>{t("cohort.retry")}</Button>} /></div> : memory ? <>
        <div className="mt-7 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 text-sm leading-6">
          <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div><p>{t("cohort.interpretation")}</p><p className="mt-2 text-muted">{t("cohort.thresholds", { lectures: memory.minimum_lectures_required, participants: memory.minimum_participants_per_lecture })}</p></div>
        </div>
        {memory.concepts.length === 0 ? <div className="mt-8"><EmptyState icon={<ChartNoAxesCombined aria-hidden className="size-6" />} title={t("cohort.emptyTitle")} body={t("cohort.emptyBody")} /></div> : <CohortTable memory={memory} />}
        {generatedLabel ? <p className="mt-6 text-xs text-muted">{t("cohort.generated")}: <time dateTime={memory.generated_at}>{generatedLabel}</time></p> : null}
      </> : null}
    </main>
  </div>;
}
