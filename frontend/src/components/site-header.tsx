"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useI18n } from "@/lib/i18n";

export function SiteHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <header className="app-header relative z-40" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        menuButton.current?.focus();
      }
    }}>
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label={t("nav.main")} className="ml-auto hidden items-center gap-5 lg:flex">
          <Link href="/gapcards" className="rounded-lg py-3 text-sm font-medium hover:text-primary">{t("learning.title")}</Link>
          <Link
            href="/#join"
            className="rounded-lg py-3 text-sm font-medium hover:text-primary"
          >
            {t("nav.join")}
          </Link>
          <Link
            href="/login"
            className="rounded-lg py-3 text-sm font-medium hover:text-primary"
          >
            {t("nav.teach")}
          </Link>
          <Link
            href="/privacy"
            className="rounded-lg py-3 text-sm font-medium hover:text-primary"
          >
            {t("nav.privacy")}
          </Link>
          <Link
            href="/status"
            className="rounded-lg py-3 text-sm font-medium hover:text-primary"
          >
            {t("nav.status")}
          </Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 sm:flex">
            <LanguageSwitcher />
            <ThemeSwitcher />

          </div>
          <IconButton
            ref={menuButton}
            label={t(open ? "nav.closeMenu" : "nav.menu")}
            className="rounded-xl border border-border lg:hidden"
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
          aria-label={t("nav.main")}
          className="border-t border-border bg-surface px-5 py-4 lg:hidden"
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

