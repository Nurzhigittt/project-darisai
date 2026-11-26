"use client";
import { ArrowRight, BookOpen, Layers3 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { clearLectureHistory, listSessions, listConfirmedSignals, listStoredGapCards, type LocalSession } from "@/lib/storage/db";

type Entry = { session: LocalSession; signals: number; cards: number };
export function LearningLibrary() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LocalSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const sessions = await listSessions();
    return Promise.all(sessions.map(async (session) => ({ session, signals: (await listConfirmedSignals(session.lectureId)).length, cards: (await listStoredGapCards(session.lectureId)).length })));
  }, []);
  useEffect(() => { let active = true; void load().then((data) => { if (active) { setEntries(data); setLoading(false); } }); return () => { active = false; }; }, [load]);
  async function clear() {
    if (!selected || busy) return;
    setBusy(true); setMessage(null);
    try {
      const cleared = await clearLectureHistory(selected.lectureId);
      const next = await load(); setEntries(next);
      const entry = next.find((item) => item.session.lectureId === selected.lectureId);
      setMessage(!cleared || entry && (entry.signals || entry.cards) ? "library.clearFailed" : "library.cleared");
      setSelected(null);
    } catch { setMessage("library.clearFailed"); } finally { setBusy(false); }
  }
  return <div className="app-page">
    <SiteHeader />
    <main id="main" className="container-page py-8 sm:py-12">
      <div className="app-hero">
        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-primary/15 bg-surface/70 text-primary">
          <BookOpen aria-hidden className="size-7" />
        </div>
        <h1 className="text-[clamp(2rem,5vw,3.75rem)] font-bold leading-tight tracking-tight">{t("learning.title")}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">{t("library.local")}</p>
      </div>
      {message ? <p className="app-panel app-panel-mint mt-6 p-5 text-sm leading-6" role="status">{t(message)}</p> : null}
      {loading ? <div className="app-panel mt-8 space-y-5 p-6 sm:p-8" role="status">
        <p className="text-sm text-muted">{t("library.loading")}</p>
        <Skeleton className="h-8 w-2/3" /><Skeleton className="h-28 w-full" />
      </div> : !entries.length ? <div className="app-panel mt-8 flex flex-col items-center gap-5 px-6 py-14 text-center">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-primary-soft text-primary"><Layers3 aria-hidden className="size-7" /></div>
        <p className="max-w-md leading-7 text-muted">{t("library.empty")}</p>
      </div> : <ul className="mt-8 grid gap-6 md:grid-cols-2">
        {entries.map(({ session, signals, cards }) => <li key={session.lectureId} className="app-panel flex min-w-0 flex-col p-6 sm:p-8">
          <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><BookOpen aria-hidden className="size-5" /></div>
          <h2 className="break-words text-2xl font-bold leading-snug tracking-tight">{session.lecture.title}</h2>
          <p className="mb-7 mt-3 text-sm leading-6 text-muted">{t("library.counts", { signals, cards })}</p>
          <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border/70 pt-6">
            <Link href={`/replay/${session.lectureId}`} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-strong px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft hover:brightness-110">
              {t("learning.replay")}<ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href={`/gapcards/${session.lectureId}`} className="inline-flex min-h-12 items-center rounded-2xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold hover:bg-primary-soft">{t("learning.cards")}</Link>
            <Button variant="ghost" onClick={() => setSelected(session)}>{t("library.clear")}</Button>
          </div>
        </li>)}
      </ul>}
      <Dialog open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }} title={t("library.confirmTitle")} description={t("library.confirmBody")}>
        <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>{t("library.cancel")}</Button><Button disabled={busy} onClick={() => void clear()}>{t("library.clear")}</Button></div>
      </Dialog>
    </main>
  </div>;
}
