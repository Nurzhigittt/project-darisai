"use client";

import { Clock3, NotebookPen } from "lucide-react";

import type { InsightContent } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

export function InsightContentView({ content }: { content: InsightContent }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 space-y-6 break-words">
      <div>
        <h2 className="text-2xl font-semibold leading-tight sm:text-3xl">{content.headline}</h2>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Clock3 aria-hidden className="size-4 shrink-0" />
          {t("insight.readTime", { seconds: content.read_time_sec })}
        </p>
      </div>
      {(content.concepts?.length ?? 0) > 0 ? (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{t("insight.concepts")}</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {content.concepts?.map((concept, index) => (
              <li key={index} className="rounded-2xl border border-border bg-background p-4">
                <h4 className="font-semibold">{concept.title}</h4>
                <p className="mt-2 whitespace-pre-wrap leading-7 text-muted">{concept.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {content.task ? (
        <section className="rounded-2xl border border-primary/20 bg-primary-soft/30 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold">
            <span className="flex items-center gap-2"><NotebookPen aria-hidden className="size-4" />{t("insight.task")}</span>
            {content.task.duration_minutes ? <span>{t("insight.minutes", { minutes: content.task.duration_minutes })}</span> : null}
          </div>
          <h3 className="mt-4 text-lg font-semibold">{content.task.title}</h3>
          <p className="mt-2 whitespace-pre-wrap leading-7">{content.task.instructions}</p>
        </section>
      ) : null}
    </div>
  );
}
