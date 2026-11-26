"use client";

import { Clock3, NotebookPen } from "lucide-react";

import type { Citation, InsightContent } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { formatOffset } from "@/lib/utils";

import styles from "./brief.module.css";

function CitationList({ citations }: { citations?: Citation[] }) {
  const { t } = useI18n();
  if (!citations?.length) return null;
  return <details className={styles.evidence}>
    <summary>{t("insight.evidence")}</summary>
    <ol className="mt-3 space-y-4">
      {citations.map((citation, index) => <li key={`${citation.segment_id}:${index}`}>
        <figure className="border-l-2 border-primary/40 pl-4">
          <blockquote className="whitespace-pre-wrap text-sm leading-6">{citation.quote}</blockquote>
          <figcaption className="mt-3 text-xs font-medium leading-5 tabular-nums text-muted">{t("insight.evidenceTime", { start: formatOffset(citation.start_ms), end: formatOffset(citation.end_ms) })}</figcaption>
        </figure>
      </li>)}
    </ol>
  </details>;
}

export function InsightContentView({ content }: { content: InsightContent }) {
  const { t } = useI18n();
  return (
    <div className={`${styles.content} space-y-8`}>
      <div>
        <h2 className="max-w-4xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{content.headline}</h2>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface-raised px-3 py-1.5 text-xs font-medium text-muted">
          <Clock3 aria-hidden className="size-4 shrink-0" />
          {t("insight.readTime", { seconds: content.read_time_sec })}
        </p>
      </div>
      {(content.concepts?.length ?? 0) > 0 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t("insight.concepts")}</h3>
          <ul className={styles.concepts}>
            {content.concepts?.map((concept, index) => (
              <li key={index} className={styles.concept}>
                <h4>{concept.title}</h4>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted">{concept.detail}</p>
                {typeof concept.window_start_ms === "number" && typeof concept.window_end_ms === "number" ?
                  <p className="mt-5 border-t border-border/70 pt-4 text-xs font-medium leading-6 tabular-nums text-muted">{t("insight.signalWindow", { start: formatOffset(concept.window_start_ms), end: formatOffset(concept.window_end_ms) })}</p> : null}
                {typeof concept.unique_signals === "number" ? <p className="mt-1 text-xs font-medium leading-6 text-muted">{t("insight.uniqueSignals", { count: concept.unique_signals })}</p> : null}
                <CitationList citations={concept.citations} />
              </li>
            ))}
          </ul>
          {content.concepts?.some((concept) => typeof concept.unique_signals === "number") ? <p className="mt-4 max-w-3xl text-xs leading-6 text-muted">{t("insight.signalCaution")}</p> : null}
        </section>
      ) : null}
      {content.task ? (
        <section className="app-panel app-panel-rose p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold">
            <span className="flex items-center gap-2"><NotebookPen aria-hidden className="size-4" />{t("insight.task")}</span>
            {content.task.duration_minutes ? <span>{t("insight.minutes", { minutes: content.task.duration_minutes })}</span> : null}
          </div>
          <h3 className="mt-5 text-xl font-bold leading-snug tracking-tight">{content.task.title}</h3>
          <p className="mt-2 whitespace-pre-wrap leading-7">{content.task.instructions}</p>
          <CitationList citations={content.task.grounded_in} />
        </section>
      ) : null}
    </div>
  );
}
