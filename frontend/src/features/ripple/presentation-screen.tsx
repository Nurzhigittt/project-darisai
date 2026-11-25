"use client";

import { ArrowLeft, Expand, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type Lecture } from "@/lib/api/client";
import { getProfessorSession } from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";

export function PresentationScreen({ lectureId }: { lectureId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const session = getProfessorSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    api
      .getLecture(session.accessToken, lectureId)
      .then((result) => {
        if (cancelled) return;
        if (result.status === "ended") router.replace(`/summary/${lectureId}`);
        setLecture(result);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 401) router.replace("/login");
        else setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lectureId, router]);

  async function fullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen?.();
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#121212]">
        <Skeleton className="h-96 w-96" />
      </div>
    );
  }

  if (error || !lecture) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <ErrorState
          title={t("errors.generic")}
          body={t("errors.notFound")}
          action={
            <Link href={`/p/${lectureId}`} className="font-semibold text-primary underline">
              {t("summary.back")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#121212] text-[#F4F2F7]">
      <header className="flex items-center justify-between px-6 py-5">
        <Link
          href={`/p/${lectureId}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("common.back")}
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void fullscreen()}
          className="border-white/20 bg-white/10 text-white hover:bg-white/20"
        >
          <Expand aria-hidden className="size-4" />
          {t("prof.live.fullscreen")}
        </Button>
      </header>
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-12 text-center"
      >
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-white/50">
            {t("prof.live.joinTitle")}
          </p>
          <h1 className="mt-3 text-balance text-[clamp(2rem,4vw,3.5rem)] font-extrabold">
            {lecture.title}
          </h1>
          <p className="mt-2 text-white/60">{lecture.course_title ?? ""}</p>
        </div>
        <div className="rounded-4xl bg-white p-6 shadow-2xl">
          <QRCodeSVG
            value={lecture.join_url}
            size={340}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#26233A"
            marginSize={2}
            aria-label={`QR code joining ${lecture.title}`}
            role="img"
          />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/50">
            {t("prof.live.code")}
          </p>
          <p className="mt-2 font-mono text-[clamp(3rem,10vw,6rem)] font-extrabold tracking-[0.2em]">
            {lecture.join_code}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/60">
            {t("prof.live.joinBody")}
          </p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs text-white/45">
          <LockKeyhole aria-hidden className="size-4" />
          {t("join.anonymous")}
        </p>
      </main>
    </div>
  );
}
