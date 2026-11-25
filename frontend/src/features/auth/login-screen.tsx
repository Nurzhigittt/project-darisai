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
    <div className="min-h-dvh">
      <header className="container-page flex h-20 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </header>
      <main id="main" className="container-page grid gap-10 pb-20 pt-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("common.back")}
          </Link>
          <div className="mt-6 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <GraduationCap aria-hidden className="size-7" />
          </div>
          <h1 className="mt-6 text-[clamp(2.5rem,5.5vw,4rem)] font-extrabold leading-[1.02]">
            {t("prof.login.title")}
          </h1>
          <p className="mt-4 max-w-lg text-lg leading-8 text-muted">
            {t("prof.login.body")}
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 text-positive" />
              <span>{t("prof.login.bullet1")}</span>
            </li>
            <li className="flex items-start gap-3">
              <KeyRound aria-hidden className="mt-0.5 size-5 text-primary" />
              <span>{t("prof.login.bullet2")}</span>
            </li>
          </ul>
        </div>
        <div className="order-1 rounded-4xl border border-border bg-surface p-7 shadow-soft sm:p-10 lg:order-2">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
