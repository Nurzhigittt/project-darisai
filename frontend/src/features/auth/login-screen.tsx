"use client";

import { ArrowLeft, GraduationCap, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import {
  buildProfessorSession,
  getProfessorSession,
  saveProfessorSession,
} from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";

export function LoginScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getProfessorSession()) router.replace("/professor");
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.loginProfessor(inviteCode.trim());
      saveProfessorSession(
        buildProfessorSession(response.access_token, response.expires_in, response.professor),
      );
      router.replace("/professor");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError(t("prof.login.error"));
      } else {
        setError(t("errors.network"));
      }
      setLoading(false);
    }
  }

  return (
    <div className="app-page">
      <header className="app-header">
        <div className="container-page flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>
      <main id="main" className="container-page grid gap-6 py-8 sm:py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-10">
        <div className="app-hero min-w-0">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("common.back")}
          </Link>
          <div className="mt-6 flex size-14 items-center justify-center rounded-2xl border border-primary/10 bg-surface/80 text-primary shadow-soft">
            <GraduationCap aria-hidden className="size-7" />
          </div>
          <h1 className="mt-6 text-[clamp(2.2rem,4.8vw,4rem)] font-bold leading-[1.06]">
            {t("prof.login.title")}
          </h1>
          <p className="mt-4 max-w-lg text-lg leading-8 text-muted">
            {t("prof.login.body")}
          </p>
          <ul className="mt-8 space-y-4 border-t border-border/70 pt-6 text-sm leading-6">
            <li className="flex items-start gap-3">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-positive" />
              <span>{t("prof.login.bullet1")}</span>
            </li>
            <li className="flex items-start gap-3">
              <KeyRound aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>{t("prof.login.bullet2")}</span>
            </li>
          </ul>
        </div>
        <div className="app-panel app-panel-rose min-w-0 p-6 sm:p-9">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <Input
              label={t("prof.login.invite")}
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value);
                setError(null);
              }}
              autoComplete="one-time-code"
              spellCheck={false}
              autoFocus
              error={error}
              leading={<KeyRound aria-hidden className="size-4" />}
            />
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {loading ? t("prof.login.checking") : t("prof.login.cta")}
            </Button>
          </form>
          <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted">
            {t("prof.login.devNote")}
          </p>
        </div>
      </main>
    </div>
  );
}
