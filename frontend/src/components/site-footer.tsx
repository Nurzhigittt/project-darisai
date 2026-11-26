"use client";

import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { API_URL } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/Nurzhigittt/project-darisai";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="app-footer">
      <div className="container-page flex flex-col justify-between gap-8 py-10 lg:flex-row">
        <div className="shrink-0">
          <Logo />
          <p className="mt-3 max-w-xs text-xs leading-6 text-muted">{t("footer.tagline")}</p>
        </div>
        <nav aria-label={t("footer.product")} className="flex flex-wrap items-start gap-x-6 gap-y-3 text-xs font-medium">
          <Link href="/gapcards" className="py-3">{t("learning.title")}</Link>
          <Link href="/#join" className="py-3">{t("nav.join")}</Link>
          <Link href="/login" className="py-3">{t("nav.teach")}</Link>
          <Link href="/privacy" className="py-3">{t("nav.privacy")}</Link>
          <Link href="/status" className="py-3">{t("nav.status")}</Link>
          <a href={`${API_URL}/api/v1/privacy/manifest`} className="py-3">{t("footer.manifest")}</a>
          <a href={`${API_URL}/api/v1/openapi.json`} className="py-3">{t("footer.api")}</a>
          <a href={githubUrl} target="_blank" rel="noreferrer" className="py-3">{t("footer.github")}</a>
        </nav>
      </div>
      <div className="container-page flex flex-wrap justify-between gap-3 border-t border-border py-5 text-xs text-muted">
        <span>© {new Date().getFullYear()} DärisAI</span>
        <p>{t("footer.caution")}</p>
      </div>
    </footer>
  );
}
