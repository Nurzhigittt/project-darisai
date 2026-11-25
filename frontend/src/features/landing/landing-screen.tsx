"use client";

import {
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { isJoinCodeComplete, normalizeJoinCode } from "@/lib/utils";

function RippleIllustration() {
  const { t } = useI18n();
  return (
    <div
      aria-hidden
      className="relative mx-auto grid aspect-square w-full max-w-[430px] place-items-center"
    >
      <div className="absolute inset-[9%] rounded-full border border-primary/10" />
      <div className="absolute inset-[19%] rounded-full border border-primary/15" />
      <div className="absolute inset-[30%] rounded-full bg-ripple-low/10 blur-2xl" />
      <div className="absolute inset-[30%] rounded-full border border-ripple-low/40" />
      <div className="absolute size-28 rounded-full bg-ripple-low/90 shadow-[0_0_80px_-10px_var(--ripple-low)] motion-safe:animate-breathe" />
      <div className="absolute right-[8%] top-[24%] size-3 rounded-full bg-accent" />
      <div className="absolute bottom-[19%] left-[12%] size-2.5 rounded-full bg-primary/60" />
      <div className="absolute right-[22%] bottom-[11%] size-2 rounded-full bg-ripple-low" />
      <div className="absolute left-[24%] top-[9%] size-2 rounded-full bg-ripple-low/70" />
      <div className="absolute inset-x-[16%] bottom-[11%] rounded-2xl border border-border bg-surface/90 px-4 py-3 text-left shadow-lift backdrop-blur">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {t("landing.illustration.room")}
        </p>
        <p className="mt-0.5 text-sm font-bold text-foreground">
          {t("landing.illustration.clarification")}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {t("landing.illustration.caption")}
        </p>
      </div>
    </div>
  );
}

export function LandingScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (!isJoinCodeComplete(normalized)) {
      setError(t("join.invalid.body"));
      return;
    }
    setError(null);
    router.push(`/join/${normalized}`);
  }

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main">
        <section className="grain relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -top-40 size-[620px] rounded-full bg-primary-soft/70 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-44 -left-44 size-[480px] rounded-full bg-accent/10 blur-3xl"
          />
          <div className="container-page relative grid items-center gap-14 pb-20 pt-14 lg:grid-cols-[1.08fr_0.92fr] lg:pb-28 lg:pt-24">
            <div className="motion-safe:animate-fade-up">
              <Badge tone="primary">
                <Sparkles aria-hidden className="size-3.5" />
                Signal &amp; Ripple · Phase 1
              </Badge>
              <h1 className="mt-6 text-balance text-[clamp(3rem,7.8vw,5.8rem)] font-extrabold leading-[0.95] tracking-[-0.055em]">
                {t("landing.title")}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted sm:text-xl">
                {t("landing.support")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="#join"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-semibold text-white shadow-lift transition-colors hover:bg-primary-strong"
                >
                  {t("landing.join.cta")}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-surface px-6 py-3 font-semibold transition-colors hover:bg-primary-soft/60"
                >
                  <GraduationCap aria-hidden className="size-5" />
                  {t("landing.teach.cta")}
                </Link>
              </div>
              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-border pt-6 text-sm">
                <div>
                  <dt className="font-bold text-foreground">
                    {t("landing.stat.accounts")}
                  </dt>
                  <dd className="mt-1 text-muted">{t("landing.stat.accountsSub")}</dd>
                </div>
                <div>
                  <dt className="font-bold text-foreground">
                    {t("landing.stat.install")}
                  </dt>
                  <dd className="mt-1 text-muted">{t("landing.stat.installSub")}</dd>
                </div>
                <div>
                  <dt className="font-bold text-foreground">{t("landing.stat.mic")}</dt>
                  <dd className="mt-1 text-muted">{t("landing.stat.micSub")}</dd>
                </div>
              </dl>
            </div>
            <div className="relative">
              <div className="absolute inset-10 -z-10 rounded-full bg-positive/10 blur-3xl" />
              <RippleIllustration />
            </div>
          </div>
        </section>

        <section id="join" className="scroll-mt-20 bg-surface/60 py-16 sm:py-20">
          <div className="container-page grid gap-6 md:grid-cols-2">
            <div className="rounded-4xl border border-border bg-surface p-7 shadow-soft sm:p-9">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <BookOpen aria-hidden className="size-6" />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold">{t("landing.join.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{t("landing.join.body")}</p>
              <form onSubmit={handleJoin} className="mt-6" noValidate>
                <label htmlFor="lecture-code" className="text-sm font-semibold">
                  {t("join.codeLabel")}
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="lecture-code"
                    name="code"
                    value={code}
                    onChange={(event) => {
                      setCode(normalizeJoinCode(event.target.value));
                      setError(null);
                    }}
                    placeholder={t("landing.join.placeholder")}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    inputMode="text"
                    maxLength={6}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "code-error" : "code-hint"}
                    className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-xl font-bold uppercase tracking-[0.24em] outline-none focus:border-primary"
                  />
                  <Button type="submit" size="lg" className="shrink-0">
                    {t("landing.join.cta")}
                  </Button>
                </div>
                {error ? (
                  <p id="code-error" role="alert" className="mt-2 text-sm font-medium text-ripple-warm">
                    {error}
                  </p>
                ) : (
                  <p id="code-hint" className="mt-2 text-xs text-muted">
                    {t("landing.join.hint")}
                  </p>
                )}
              </form>
              <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted">
                <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t("join.anonymous")}
              </p>
            </div>

            <div className="rounded-4xl border border-border bg-primary-soft/45 p-7 sm:p-9">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm">
                <GraduationCap aria-hidden className="size-6" />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold">{t("landing.teach.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{t("landing.teach.body")}</p>
              <Link
                href="/login"
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-raised"
              >
                {t("landing.teach.cta")}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <ul className="mt-7 space-y-3 text-sm">
                {[
                  t("landing.teach.bullet1"),
                  t("landing.teach.bullet2"),
                  t("landing.teach.bullet3"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 text-positive" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container-page">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                {t("landing.how.eyebrow")}
              </p>
              <h2 className="mt-3 text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight">
                {t("landing.how.title")}
              </h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                {
                  number: "01",
                  title: t("landing.how.step1.title"),
                  body: t("landing.how.step1.body"),
                  icon: BookOpen,
                },
                {
                  number: "02",
                  title: t("landing.how.step2.title"),
                  body: t("landing.how.step2.body"),
                  icon: HeartHandshake,
                },
                {
                  number: "03",
                  title: t("landing.how.step3.title"),
                  body: t("landing.how.step3.body"),
                  icon: Sparkles,
                },
              ].map((step) => (
                <div
                  key={step.number}
                  className="rounded-3xl border border-border bg-surface p-6 shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold tracking-widest text-primary">
                      {step.number}
                    </span>
                    <step.icon aria-hidden className="size-5 text-muted" />
                  </div>
                  <h3 className="mt-8 text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="container-page overflow-hidden rounded-4xl border border-border bg-primary-soft/50">
            <div className="grid gap-8 p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-2xl">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm">
                  <ShieldCheck aria-hidden className="size-6" />
                </div>
                <h2 className="mt-5 text-3xl font-extrabold">{t("landing.privacy.title")}</h2>
                <p className="mt-3 leading-7 text-muted">{t("landing.privacy.body")}</p>
              </div>
              <Link
                href="/privacy"
                className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-raised lg:self-center"
              >
                {t("landing.privacy.link")}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
          <p className="container-page mt-6 text-sm text-muted">
            {t("landing.footerNote")}
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
