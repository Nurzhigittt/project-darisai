"use client";

import { Code2, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useI18n } from "@/lib/i18n";

const githubUrl =
  process.env.NEXT_PUBLIC_GITHUB_URL ??
  "https://github.com/Nurzhigittt/project-darisai";

export function SiteHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Link href="/gapcards" className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-primary-soft/60">{t("learning.title")}</Link>
          <Link
            href="/#join"
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-primary-soft/60"
          >
            {t("nav.join")}
          </Link>
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-primary-soft/60"
          >
            {t("nav.teach")}
          </Link>
          <Link
            href="/privacy"
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-primary-soft/60"
          >
            {t("nav.privacy")}
          </Link>
          <Link
            href="/status"
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-primary-soft/60"
          >
            {t("nav.status")}
          </Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 sm:flex">
            <LanguageSwitcher />
            <ThemeSwitcher />
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-primary-soft/60 hover:text-foreground"
            >
              <Code2 aria-hidden className="size-5" />
            </a>
          </div>
          <IconButton
            label={open ? "Close menu" : "Open menu"}
            className="md:hidden"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
          </IconButton>
        </div>
      </div>
      {open ? (
        <nav
          id="mobile-navigation"
          aria-label="Mobile"
          className="border-t border-border bg-surface px-5 py-4 md:hidden"
        >
          <ul className="grid gap-1 text-sm font-semibold">
            <li><Link href="/gapcards" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3">{t("learning.title")}</Link></li>
            <li>
              <Link href="/#join" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3">
                {t("nav.join")}
              </Link>
            </li>
            <li>
              <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3">
                {t("nav.teach")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3">
                {t("nav.privacy")}
              </Link>
            </li>
            <li>
              <Link href="/status" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3">
                {t("nav.status")}
              </Link>
            </li>
          </ul>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </nav>
      ) : null}
    </header>
  );
}

