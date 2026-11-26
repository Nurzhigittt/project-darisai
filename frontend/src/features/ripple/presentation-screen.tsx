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

import styles from "./live.module.css";

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
      <div data-theme="dark" className={`app-page grid min-h-dvh place-items-center ${styles.presentation}`}>
        <Skeleton className="h-80 w-[min(90vw,24rem)]" />
      </div>
    );
  }

  if (error || !lecture) {
    return (
      <div className="app-page grid min-h-dvh place-items-center p-6">
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
    <div data-theme="dark" className={`app-page flex min-h-dvh flex-col ${styles.presentation}`}>
      <header className="app-header">
        <div className="container-page flex items-center justify-between gap-3">
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
        </div>
      </header>
      <main
        id="main"
        className={styles.presentationMain}
      >
        <div className={styles.presentationHeading}>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/75">
            {t("prof.live.joinTitle")}
          </p>
          <h1>
            {lecture.title}
          </h1>
          <p className="mt-2 text-white/80">{lecture.course_title ?? ""}</p>
        </div>
        <div className={styles.presentationQr}>
          <QRCodeSVG
            value={lecture.join_url}
            size={340}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#122C34"
            marginSize={2}
            aria-label={`QR code joining ${lecture.title}`}
            role="img"
          />
        </div>
        <div className={styles.presentationCode}>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/75">
            {t("prof.live.code")}
          </p>
          <p className="mt-2 font-mono font-semibold">
            {lecture.join_code}
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
            {t("prof.live.joinBody")}
          </p>
        </div>
        <p className={`inline-flex items-center gap-2 text-xs text-white/80 ${styles.presentationPrivacy}`}>
          <LockKeyhole aria-hidden className="size-4" />
          {t("join.anonymous")}
        </p>
      </main>
    </div>
  );
}
