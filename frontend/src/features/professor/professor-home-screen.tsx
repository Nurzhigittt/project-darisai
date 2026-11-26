"use client";

import { ArrowRight, BookOpen, LogOut, Plus, Radio, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useToast } from "@/components/ui/toast";
import {
  api,
  ApiError,
  type Course,
  type Lecture,
} from "@/lib/api/client";
import {
  clearProfessorSession,
  getProfessorSession,
  type ProfessorSession,
} from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";
import { cn, formatDuration } from "@/lib/utils";

const statusTone = {
  scheduled: "primary",
  live: "positive",
  paused: "attention",
  ended: "neutral",
} as const;



export function ProfessorHomeScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { push } = useToast();
  const [session, setSession] = useState<ProfessorSession | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [language, setLanguage] = useState<"en" | "ru" | "kk">(locale);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (activeSession: ProfessorSession) => {
      setLoading(true);
      setError(false);
      try {
        const [courseList, lectureList] = await Promise.all([
          api.listCourses(activeSession.accessToken),
          api.listLectures(activeSession.accessToken),
        ]);
        setCourses(courseList);
        setLectures(lectureList);
        setCourseId((current) => current || courseList[0]?.id || "");
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          clearProfessorSession();
          router.replace("/login");
          return;
        }
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const active = getProfessorSession();
    if (!active) {
      router.replace("/login");
      return;
    }
    setSession(active);
    void load(active);
  }, [load, router]);

  useEffect(() => {
    setLanguage(locale);
  }, [locale]);

  function handleApiError(caught: unknown) {
    if (caught instanceof ApiError && caught.status === 401) {
      clearProfessorSession();
      router.replace("/login");
      return;
    }
    if (caught instanceof ApiError) {
      push({ title: t("errors.generic"), description: caught.message, tone: "error" });
    } else {
      push({ title: t("errors.network"), tone: "error" });
    }
  }

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || courseTitle.trim().length < 2) return;
    setCreatingCourse(true);
    try {
      const course = await api.createCourse(session.accessToken, courseTitle.trim());
      setCourses((current) =>
        current.some((item) => item.id === course.id) ? current : [...current, course],
      );
      setCourseId(course.id);
      setCourseTitle("");
      push({ title: course.title, tone: "success" });
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setCreatingCourse(false);
    }
  }

  async function createLecture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !courseId || title.trim().length < 2) return;
    setCreating(true);
    try {
      const lecture = await api.createLecture(session.accessToken, {
        course_id: courseId,
        title: title.trim(),
        language,
      });
      router.push(`/p/${lecture.lecture_id}`);
    } catch (caught) {
      handleApiError(caught);
      setCreating(false);
    }
  }

  function signOut() {
    clearProfessorSession();
    router.replace("/");
  }

  return (
    <div className="app-page">
      <header className="app-header">
        <div className="container-page flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-1.5">
            <span className="mr-2 hidden text-sm text-muted sm:block">
              {session?.name ?? ""}
            </span>
            <LanguageSwitcher />
            <ThemeSwitcher />
            <Button variant="ghost" size="sm" onClick={signOut} aria-label={t("prof.home.logout")}>
              <LogOut aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t("prof.home.logout")}</span>
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="container-page py-8 sm:py-12">
        <div className="app-hero">
          <Badge tone="primary">
            <Sparkles aria-hidden className="size-3.5" />
            Teaching space
          </Badge>
          <h1 className="mt-5 max-w-3xl text-[clamp(2.2rem,4.8vw,3.8rem)] font-bold leading-[1.06]">
            {t("prof.home.title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">{t("prof.home.body")}</p>
        </div>

        <div className="mt-7 grid items-start gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="app-panel app-panel-rose min-w-0 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Plus aria-hidden className="size-5" />
              </div>
              <h2 className="text-xl font-bold">{t("prof.home.new")}</h2>
            </div>
            {loading ? (
              <div className="mt-6 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-2/3" />
              </div>
            ) : courses.length === 0 ? (
              <form onSubmit={createCourse} className="mt-6 space-y-4">
                <p className="text-sm text-muted">{t("prof.home.noCourse")}</p>
                <Input
                  label={t("prof.home.course")}
                  value={courseTitle}
                  onChange={(event) => setCourseTitle(event.target.value)}
                  placeholder="Applied Physics"
                  required
                  minLength={2}
                />
                <Button type="submit" loading={creatingCourse}>
                  <Plus aria-hidden className="size-4" />
                  {t("prof.home.course")}
                </Button>
              </form>
            ) : (
              <form onSubmit={createLecture} className="mt-6 space-y-4">
                <label className="block space-y-2 text-sm font-semibold">
                  {t("prof.home.course")}
                  <select
                    value={courseId}
                    onChange={(event) => setCourseId(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base font-normal outline-none focus:border-primary"
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label={t("prof.home.lectureTitle")}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Bernoulli's principle"
                  required
                  minLength={2}
                  maxLength={200}
                />
                <label className="block space-y-2 text-sm font-semibold">
                  {t("prof.home.language")}
                  <select
                    value={language}
                    onChange={(event) =>
                      setLanguage(event.target.value as "en" | "ru" | "kk")
                    }
                    className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base font-normal outline-none focus:border-primary"
                  >
                    <option value="en">English</option>
                    <option value="ru">Русский</option>
                    <option value="kk">Қазақша</option>
                  </select>
                </label>
                <Button type="submit" size="lg" className="w-full" loading={creating}>
                  {creating ? t("prof.home.creating") : t("prof.home.create")}
                  {!creating ? <ArrowRight aria-hidden className="size-4" /> : null}
                </Button>
              </form>
            )}
          </section>

          <section className="app-panel min-w-0 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t("prof.home.recent")}</h2>
              <button
                type="button"
                onClick={() => session && void load(session)}
                className="min-h-10 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
              >
                {t("status.refresh")}
              </button>
            </div>
            {error ? (
              <div className="mt-6">
                <ErrorState
                  title={t("errors.generic")}
                  body={t("errors.network")}
                  action={
                    <Button onClick={() => session && void load(session)}>
                      {t("common.retry")}
                    </Button>
                  }
                />
              </div>
            ) : loading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : lectures.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  icon={<BookOpen aria-hidden className="size-6" />}
                  title={t("prof.home.empty")}
                  body={t("landing.teach.body")}
                />
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {lectures.map((lecture) => (
                  <li
                    key={lecture.lecture_id}
                    className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/80 bg-background/45 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words font-bold">{lecture.title}</h3>
                        <Badge tone={statusTone[lecture.status]}>
                          {t(
                            lecture.status === "scheduled"
                              ? "lecture.scheduled"
                              : lecture.status === "live"
                                ? "lecture.live"
                                : lecture.status === "paused"
                                  ? "lecture.paused"
                                  : "lecture.ended",
                          )}
                        </Badge>
                      </div>
                      <p className="mt-2 break-words text-xs leading-5 text-muted">
                        {lecture.course_title ?? ""} · {lecture.join_code} ·{" "}
                        {lecture.status === "ended"
                          ? formatDuration(lecture.offset_ms)
                          : new Date(lecture.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/transcript/${lecture.lecture_id}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-primary-soft/60">{t("teaching.transcript")}</Link>
                      <Link href={`/settings/autonomy/${lecture.lecture_id}`}
                        className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-primary-soft/60">
                        {t("teaching.autonomy")}
                      </Link>
                      {lecture.status === "ended" ? (
                        <>
                        <Link
                          href={`/summary/${lecture.lecture_id}`}
                          className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-primary-soft/60"
                        >
                          {t("prof.home.summary")}
                        </Link>
                        <Link href={`/brief/${lecture.lecture_id}`} className="inline-flex min-h-11 items-center rounded-xl bg-primary-soft px-3 text-sm font-semibold text-foreground">
                          BriefNext
                        </Link>
                        </>
                      ) : (
                        <Link
                          href={`/p/${lecture.lecture_id}`}
                          className={cn(
                            "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold",
                            lecture.status === "live"
                              ? "bg-positive/15 text-foreground"
                              : "bg-primary-soft text-primary-strong",
                          )}
                        >
                          <Radio aria-hidden className="size-4" />
                          {t("prof.home.open")}
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        {!loading && !error && courses.length > 0 ? (
          <section className="mt-10 border-t border-border/70 pt-8" aria-labelledby="course-memory-title">
            <h2 id="course-memory-title" className="text-2xl font-bold">{t("teaching.courseMemory")}</h2>
            <p className="mt-2 text-muted">{t("teaching.courseMemoryBody")}</p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => <li key={course.id} className="app-panel app-panel-mint flex min-w-0 flex-col items-start p-6">
                <h3 className="break-words text-xl font-bold">{course.title}</h3>
                <Link href={`/cohort/${course.id}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/15 bg-surface/70 px-3 text-sm font-semibold text-primary hover:bg-primary-soft/60">
                  {t("teaching.cohort")}<ArrowRight aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>)}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
