"use client";

import type { Citation } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { formatOffset } from "@/lib/utils";

export function Citations({ citations }: { citations: Citation[] }) {
  const { t } = useI18n();
  if (!citations.length) return null;
  return <details className="mt-4 rounded-xl border border-border bg-background/60 p-3">
    <summary className="min-h-8 cursor-pointer text-sm font-semibold">{t("replay.citations", { count: citations.length })}</summary>
    <ul className="mt-3 space-y-3">
      {citations.map((citation, index) => <li key={`${citation.segment_id}:${index}`}>
        <blockquote className="border-l-2 border-primary/50 pl-3 text-sm leading-6">
          <p className="whitespace-pre-wrap break-words">{citation.quote}</p>
          <footer className="mt-1 text-xs font-semibold text-muted">{formatOffset(citation.start_ms)}–{formatOffset(citation.end_ms)}</footer>
        </blockquote>
      </li>)}
    </ul>
  </details>;
}

export function ReplaySource({ source }: { source: "live" | "prebaked" | "template" }) {
  const { t } = useI18n();
  return <span className="inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted">{t(`replay.source.${source}`)}</span>;
}
