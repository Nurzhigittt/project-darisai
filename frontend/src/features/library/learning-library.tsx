"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
  return <div className="min-h-dvh bg-background"><SiteHeader /><main id="main" className="container-page py-10"><h1 className="text-4xl font-semibold">{t("learning.title")}</h1><p className="mt-4 max-w-2xl text-muted">{t("library.local")}</p>
    {message ? <p className="mt-5" role="status">{t(message)}</p> : null}
    {loading ? <p className="mt-6" role="status">{t("library.loading")}</p> : !entries.length ? <p className="mt-8">{t("library.empty")}</p> : <ul className="mt-8 grid gap-5 md:grid-cols-2">{entries.map(({ session, signals, cards }) => <li key={session.lectureId} className="min-w-0 rounded-2xl border border-border bg-surface p-6"><h2 className="break-words text-2xl font-semibold">{session.lecture.title}</h2><p className="mt-2 text-sm text-muted">{t("library.counts", { signals, cards })}</p><div className="mt-5 flex flex-wrap gap-3"><Link href={`/replay/${session.lectureId}`} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground">{t("learning.replay")}</Link><Link href={`/gapcards/${session.lectureId}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 font-semibold">{t("learning.cards")}</Link><Button variant="ghost" onClick={() => setSelected(session)}>{t("library.clear")}</Button></div></li>)}</ul>}
    <Dialog open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }} title={t("library.confirmTitle")} description={t("library.confirmBody")}><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>{t("library.cancel")}</Button><Button disabled={busy} onClick={() => void clear()}>{t("library.clear")}</Button></div></Dialog>
  </main></div>;
}
