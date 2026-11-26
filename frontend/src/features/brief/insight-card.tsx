"use client";

import { Check, Copy, ExternalLink, Pencil, Send, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { HandoffLink, Insight } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

import { insightActions, safeHandoffUrl } from "./insight-actions";
import { InsightContentView } from "./insight-content";
import styles from "./brief.module.css";

export function InsightCard({ insight, link, disabled, busy, onApprove, onEdit, onReject, onPublish }: {
  insight: Insight;
  link?: HandoffLink;
  disabled: boolean;
  busy: string | null;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
  onPublish: () => void;
}) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const actions = insightActions(insight);
  const url = link && insight.status === "published" ? safeHandoffUrl(link.handoff_url) : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  return <article data-testid={`insight-${insight.insight_id}`}>
    <Card className="overflow-hidden p-5 sm:p-8 lg:p-10">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge>{t(`insight.status.${insight.status}`)}</Badge>
          <Badge tone="primary">{t(`insight.source.${insight.source}`)}</Badge>
        </div>
        <time dateTime={insight.created_at} className="text-xs font-medium text-muted">
          {new Date(insight.created_at).toLocaleDateString(locale)}
        </time>
      </div>
      <InsightContentView content={insight.content} />
      {insight.decision_reason ? <div className="mt-5 border-l-2 border-border pl-4">
        <p className="text-sm font-semibold">{t("insight.reason")}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-muted">{insight.decision_reason}</p>
      </div> : null}
      {insight.status !== "rejected" ? <div className={styles.actions}>
        {actions.approve ? <Button disabled={disabled} loading={busy === "approve"} onClick={onApprove}>
          <Check aria-hidden className="size-4" />{t("insight.approve")}
        </Button> : null}
        {actions.edit ? <Button variant="secondary" disabled={disabled} onClick={onEdit}>
          <Pencil aria-hidden className="size-4" />{t("insight.edit")}
        </Button> : null}
        {actions.reject ? <Button variant="ghost" disabled={disabled} onClick={onReject}>
          <X aria-hidden className="size-4" />{t("insight.reject")}
        </Button> : null}
        {actions.publish ? <Button disabled={disabled} loading={busy === "publish"} onClick={onPublish}>
          <Send aria-hidden className="size-4" />{t(insight.status === "published" ? "brief.createLink" : "insight.publish")}
        </Button> : null}
      </div> : null}
      {insight.kind === "handoff" && insight.status === "published" ? <p className="mt-4 text-sm text-muted">{t("brief.extraLinkNotice")}</p> : null}
      {url && link ? <div className="app-panel app-panel-mint mt-6 space-y-4 p-5 sm:p-6">
        <Input label={t("brief.link")} readOnly value={url} onFocus={(event) => event.target.select()} />
        <p className="text-sm text-muted">{t("brief.linkExpires", { date: new Date(link.expires_at).toLocaleString(locale) })}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void copy()}><Copy aria-hidden className="size-4" />{t(copied ? "common.copied" : "insight.copy")}</Button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold underline">
            {t("insight.view")}<ExternalLink aria-hidden className="size-4" />
          </a>
        </div>
        <p role="status" className="text-sm">{copyFailed ? t("brief.copyFailed") : copied ? t("common.copied") : ""}</p>
      </div> : null}
    </Card>
  </article>;
}
