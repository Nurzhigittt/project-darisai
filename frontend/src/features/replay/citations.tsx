"use client";

import type { Citation } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { formatOffset } from "@/lib/utils";

import styles from "./replay.module.css";

export function Citations({ citations }: { citations: Citation[] }) {
  const { t } = useI18n();
  if (!citations.length) return null;
  return <details className={styles.citation}>
    <summary>{t("replay.citations", { count: citations.length })}</summary>
    <ul className="mt-4 space-y-5">
      {citations.map((citation, index) => <li key={`${citation.segment_id}:${index}`}>
        <blockquote className="border-l-2 border-primary/50 pl-4 text-sm leading-7">
          <p className="whitespace-pre-wrap break-words">{citation.quote}</p>
          <footer className="mt-3 inline-block rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium tabular-nums text-primary-strong">{formatOffset(citation.start_ms)}–{formatOffset(citation.end_ms)}</footer>
        </blockquote>
      </li>)}
    </ul>
  </details>;
}

export function ReplaySource({ source }: { source: "live" | "prebaked" | "template" }) {
  const { t } = useI18n();
  return <span className="inline-flex rounded-full border border-border/80 bg-surface/80 px-3 py-1.5 text-xs font-medium text-muted">{t(`replay.source.${source}`)}</span>;
}
