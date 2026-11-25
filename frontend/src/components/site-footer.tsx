"use client";

import { Code2 } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { API_URL } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

const githubUrl =
  process.env.NEXT_PUBLIC_GITHUB_URL ??
  "https://github.com/hackathon-worldAI-2026-ULTRA/daris-ai";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="container-page grid gap-8 py-12 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted">
            A quieter way to make confusion visible. Built as a working Signal &
            Ripple foundation.
          </p>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
            {t("footer.product")}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/#join" className="hover:text-primary">
                {t("nav.join")}
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-primary">
                {t("nav.teach")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-primary">
                {t("nav.privacy")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
            {t("footer.trust")}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/status" className="hover:text-primary">
                {t("nav.status")}
              </Link>
            </li>
            <li>
              <a
                href={`${API_URL}/api/v1/privacy/manifest`}
                className="hover:text-primary"
              >
                {t("footer.manifest")}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
            {t("footer.build")}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 hover:text-primary"
              >
                <Code2 aria-hidden className="size-4" />
                {t("footer.github")}
              </a>
            </li>
            <li>
              <a href={`${API_URL}/api/v1/openapi.json`} className="hover:text-primary">
                {t("footer.api")}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="container-page border-t border-border py-5 text-xs text-muted">
        <p>{t("footer.caution")}</p>
      </div>
    </footer>
  );
}
