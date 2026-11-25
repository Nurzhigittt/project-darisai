"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent, type TextareaHTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Insight, InsightContent } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

export function Textarea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return <label htmlFor={id} className="block space-y-2 text-sm font-semibold">
    <span>{label}</span>
    <textarea id={id} {...props} className="block min-h-24 w-full resize-y rounded-xl border border-border bg-surface p-3 text-base font-normal text-foreground" />
  </label>;
}

export function InsightEditor({ initial, kind, busy, onSave, onCancel }: {
  initial?: Insight;
  kind: Insight["kind"];
  busy: boolean;
  onSave: (content: InsightContent, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [content, setContent] = useState<InsightContent>(() => initial?.content ?? {
    headline: "", read_time_sec: 20, concepts: [],
    task: kind === "handoff" ? { title: "", instructions: "", duration_minutes: null } : null,
  });
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const concepts = content.concepts ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned: InsightContent = {
      headline: content.headline.trim(),
      read_time_sec: content.read_time_sec,
      concepts: concepts.map((item) => ({ title: item.title.trim(), detail: item.detail.trim() })),
      task: content.task ? { ...content.task, title: content.task.title.trim(), instructions: content.task.instructions.trim() } : null,
    };
    if (!cleaned.headline || cleaned.concepts?.some((item) => !item.title || !item.detail) ||
      (cleaned.task && (!cleaned.task.title || !cleaned.task.instructions)) ||
      (kind === "handoff" && !cleaned.task) || (initial && !reason.trim())) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    await onSave(cleaned, reason.trim());
  }

  return <form onSubmit={submit} className="pb-5">
    <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-70">
      <Input label={t("insight.headline")} required maxLength={200} value={content.headline}
        onChange={(event) => setContent({ ...content, headline: event.target.value })} />
      <Input label={t("insight.readSeconds")} type="number" required min={1} max={60} step={1}
        value={content.read_time_sec || ""} onChange={(event) => setContent({ ...content, read_time_sec: Number(event.target.value) })} />
      <div className="space-y-3">
        <h3 className="font-bold">{t("insight.concepts")}</h3>
        {concepts.map((concept, index) => <div key={index} className="space-y-3 rounded-2xl border border-border p-4">
          <Input label={`${t("insight.conceptTitle")} ${index + 1}`} required maxLength={160} value={concept.title}
            onChange={(event) => setContent({ ...content, concepts: concepts.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })} />
          <Textarea label={`${t("insight.conceptDetail")} ${index + 1}`} required maxLength={1000} value={concept.detail}
            onChange={(event) => setContent({ ...content, concepts: concepts.map((item, i) => i === index ? { ...item, detail: event.target.value } : item) })} />
          <Button type="button" variant="ghost" onClick={() => setContent({ ...content, concepts: concepts.filter((_, i) => i !== index) })}>
            <Trash2 aria-hidden className="size-4" />{t("insight.removeConcept", { number: index + 1 })}
          </Button>
        </div>)}
        {concepts.length < 12 ? <Button type="button" variant="secondary" onClick={() => setContent({ ...content, concepts: [...concepts, { title: "", detail: "" }] })}>
          <Plus aria-hidden className="size-4" />{t("insight.addConcept")}
        </Button> : null}
      </div>
      {kind === "brief_next" ? <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
        <input type="checkbox" className="size-5 accent-primary" checked={Boolean(content.task)}
          onChange={(event) => setContent({ ...content, task: event.target.checked ? { title: "", instructions: "", duration_minutes: null } : null })} />
        {t("insight.includeTask")}
      </label> : null}
      {content.task ? <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
        <Input label={t("insight.taskTitle")} required maxLength={160} value={content.task.title}
          onChange={(event) => setContent({ ...content, task: { ...content.task!, title: event.target.value } })} />
        <Textarea label={t("insight.instructions")} required maxLength={4000} rows={5} value={content.task.instructions}
          onChange={(event) => setContent({ ...content, task: { ...content.task!, instructions: event.target.value } })} />
        <Input label={t("insight.duration")} type="number" min={1} max={180} step={1} value={content.task.duration_minutes ?? ""}
          onChange={(event) => setContent({ ...content, task: { ...content.task!, duration_minutes: event.target.value === "" ? null : Number(event.target.value) } })} />
      </div> : null}
      {initial ? <Textarea label={t("insight.reason")} required maxLength={1000} value={reason}
        onChange={(event) => setReason(event.target.value)} /> : null}
      {initial?.status === "published" ? <p className="rounded-xl bg-primary-soft p-3 text-sm">{t("brief.revokeNotice")}</p> : null}
      {invalid ? <p role="alert" className="font-semibold">{t("insight.validation")}</p> : null}
      <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>{t("insight.cancel")}</Button>
        <Button type="submit" loading={busy}>{t(initial ? "insight.save" : "insight.create")}</Button>
      </div>
    </fieldset>
  </form>;
}
