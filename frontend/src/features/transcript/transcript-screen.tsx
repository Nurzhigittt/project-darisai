"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { api, ApiError, type Lecture, type Transcript } from "@/lib/api/client";
import { clearProfessorSession, getProfessorSession } from "@/lib/auth/professor";
import { useI18n } from "@/lib/i18n";
import { formatOffset } from "@/lib/utils";
import { audioMime, MAX_AUDIO_BYTES, MAX_JSON_BYTES, parseTranscript } from "./validation";

function errorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "STT_NOT_CONFIGURED") return "transcript.noProvider";
    if (error.status === 413) return "transcript.tooLarge";
    if (error.status === 415) return "transcript.format";
    if (error.status === 429) return "transcript.rateLimit";
    if (error.status === 409) return "transcript.conflict";
    if ([403,404].includes(error.status)) return "transcript.unavailable";
  }
  return "transcript.error";
}

export function TranscriptScreen({ lectureId }: { lectureId: string }) {
  return <TranscriptContent key={lectureId} lectureId={lectureId} />;
}
function TranscriptContent({ lectureId }: { lectureId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [chunk, setChunk] = useState("0");
  const [start, setStart] = useState("0");
  const [fileKey, setFileKey] = useState(0);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const read = useRef<AbortController | null>(null);
  const write = useRef<AbortController | null>(null);
  const tokenRef = useRef<string | null>(null);

  const leave = useCallback(() => {
    read.current?.abort(); write.current?.abort(); busyRef.current = false;
    setLecture(null); setTranscript(null); setFile(null); setJsonFile(null);
    setBusy(false); setError(null); setNotice(null); setFileKey((key) => key + 1);
    const current = getProfessorSession();
    if (!current) clearProfessorSession();
    router.replace(current ? "/professor" : "/login");
  }, [router]);
  const valid = useCallback((token: string, controller: AbortController) => {
    if (!mounted.current || controller.signal.aborted) return false;
    if (getProfessorSession()?.accessToken !== token) { leave(); return false; }
    return true;
  }, [leave]);
  const load = useCallback(async () => {
    const session = getProfessorSession();
    if (!session) { leave(); return false; }
    if (tokenRef.current && tokenRef.current !== session.accessToken) { leave(); return false; }
    tokenRef.current = session.accessToken;
    read.current?.abort(); const controller = new AbortController(); read.current = controller;
    setLoading(true); setError(null); setTranscript(null);
    try {
      const [nextLecture, nextTranscript] = await Promise.all([
        api.getLecture(session.accessToken, lectureId, controller.signal),
        api.getTranscript(session.accessToken, lectureId, controller.signal),
      ]);
      if (!valid(session.accessToken, controller)) return false;
      if (nextLecture.lecture_id !== lectureId || nextTranscript.lecture_id !== lectureId) throw new Error("Unexpected transcript response");
      setLecture(nextLecture); setTranscript(nextTranscript); return true;
    } catch (caught) {
      if (!valid(session.accessToken, controller)) return false;
      if (caught instanceof ApiError && caught.status === 401) { clearProfessorSession(); leave(); }
      else setError(errorKey(caught));
      return false;
    } finally { if (mounted.current && !controller.signal.aborted) setLoading(false); }
  }, [leave, lectureId, valid]);
  useEffect(() => {
    mounted.current = true; void load();
    const connection = () => setOffline(!navigator.onLine);
    const session = (event: StorageEvent) => { if ((event.key === "daris.professor.session" || event.key === null) && getProfessorSession()?.accessToken !== tokenRef.current) leave(); };
    connection(); window.addEventListener("online", connection); window.addEventListener("offline", connection); window.addEventListener("storage", session);
    return () => { mounted.current = false; read.current?.abort(); write.current?.abort(); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); window.removeEventListener("storage", session); };
  }, [load, leave]);

  async function submit(event: FormEvent, kind: "audio" | "json") {
    event.preventDefault();
    if (busyRef.current || loading || error || offline || !lecture) return;
    const session = getProfessorSession();
    if (!session || session.accessToken !== tokenRef.current) { leave(); return; }
    const chosen = kind === "audio" ? file : jsonFile;
    if (!chosen) return;
    if (chosen.size > (kind === "audio" ? MAX_AUDIO_BYTES : MAX_JSON_BYTES)) { setNotice("transcript.tooLarge"); return; }
    const mime = kind === "audio" ? audioMime(chosen) : null;
    if (kind === "audio" && !mime) { setNotice("transcript.format"); return; }
    const chunkIndex = Number(chunk), startMs = Math.round(Number(start) * 1000);
    if (kind === "audio" && (!chunk.trim() || !start.trim() || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || !Number.isSafeInteger(startMs) || startMs < 0)) { setNotice("transcript.invalidPosition"); return; }
    busyRef.current = true; setBusy(true); setNotice(null);
    const controller = new AbortController(); write.current = controller;
    let sent = false;
    try {
      if (kind === "json") {
        let body;
        try { body = parseTranscript(await chosen.text()); } catch {
          if (valid(session.accessToken, controller)) setNotice("transcript.invalidJson");
          return;
        }
        if (!valid(session.accessToken, controller)) return;
        body.language = lecture.language;
        sent = true;
        const result = await api.importTranscript(session.accessToken, lectureId, body, controller.signal);
        if (!valid(session.accessToken, controller)) return;
        if (!result || result.lecture_id !== lectureId || !result.run) throw new Error("Unexpected import response");
        setNotice(result.degraded ? "transcript.degraded" : "transcript.saved");
      } else {
        const form = new FormData(); form.append("file", chosen); form.append("chunk_index", String(chunkIndex)); form.append("start_ms", String(startMs)); form.append("mime_type", mime!);
        sent = true;
        const result = await api.uploadAudioChunk(session.accessToken, lectureId, form, controller.signal);
        if (!valid(session.accessToken, controller)) return;
        if (!result || result.lecture_id !== lectureId) throw new Error("Unexpected upload response");
        setNotice(result.status === "failed" ? "transcript.failed" : result.degraded ? "transcript.degraded" : "transcript.saved");
        if (result.status === "completed") setChunk(String(chunkIndex + 1));
      }
      setFile(null); setJsonFile(null); setFileKey((key) => key + 1); await load();
    } catch (caught) {
      if (!valid(session.accessToken, controller)) return;
      if (caught instanceof ApiError && caught.status === 401) { clearProfessorSession(); leave(); return; }
      const uncertain = sent && (!(caught instanceof ApiError) || caught.status === 0 || caught.status >= 500 && caught.code !== "STT_NOT_CONFIGURED");
      setNotice(uncertain ? "transcript.uncertain" : errorKey(caught));
      if (uncertain || caught instanceof ApiError && caught.status === 409) {
        setFile(null); setJsonFile(null); setFileKey((key) => key + 1); await load();
      }
    } finally { if (mounted.current && !controller.signal.aborted) { busyRef.current = false; setBusy(false); } }
  }
  const disabled = busy || loading || offline || Boolean(error);
  const run = transcript?.latest_run;
  return <div className="min-h-dvh bg-background">
    <header className="border-b border-border bg-surface/70"><div className="container-page flex min-h-16 flex-wrap items-center justify-between gap-2 py-2"><Logo /><div className="flex gap-1"><LanguageSwitcher /><ThemeSwitcher /></div></div></header>
    <main id="main" className="container-page py-8 sm:py-12">
      <Link href="/professor" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted">← {t("transcript.back")}</Link>
      <p className="mt-4 break-words text-sm text-muted">{lecture?.title}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4"><h1 className="text-4xl font-semibold">{t("transcript.title")}</h1><Button variant="secondary" disabled={loading || busy || offline} onClick={() => void load()}>{t("transcript.refresh")}</Button></div>
      <p className="mt-3 max-w-3xl text-muted">{t("transcript.description")}</p>
      {lecture ? <nav className="mt-4 flex flex-wrap gap-4" aria-label={t("teaching.related")}><Link className="inline-flex min-h-11 items-center font-semibold text-primary" href={`/brief/${lectureId}`}>{t("transcript.brief")}</Link></nav> : null}
      {offline ? <p role="status" className="mt-4">{t("transcript.offline")}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl border border-border bg-surface p-4">{t(notice)}</p> : null}
      {loading ? <p role="status" className="mt-6">{t("transcript.loading")}</p> : null}
      {error ? <p role="alert" className="mt-6">{t(error)}</p> : null}
      {lecture ? <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <form onSubmit={(event) => void submit(event, "audio")} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold">{t("transcript.audioTitle")}</h2><p className="text-sm text-muted">{t("transcript.audioHint")}</p>
          <Input key={`audio-${fileKey}`} type="file" accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg" label={t("transcript.audioFile")} disabled={disabled} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <div className="grid gap-4 sm:grid-cols-2"><Input type="number" min="0" step="1" label={t("transcript.chunk")} value={chunk} disabled={disabled} onChange={(event) => setChunk(event.target.value)} /><Input type="number" min="0" step="0.001" label={t("transcript.start")} value={start} disabled={disabled} onChange={(event) => setStart(event.target.value)} /></div>
          <Button disabled={disabled || !file} type="submit">{t(busy ? "transcript.processing" : "transcript.upload")}</Button>
        </form>
        <form onSubmit={(event) => void submit(event, "json")} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold">{t("transcript.importTitle")}</h2><p className="text-sm text-muted">{t("transcript.importHint")}</p>
          <Input key={`json-${fileKey}`} type="file" accept=".json,application/json" label={t("transcript.jsonFile")} disabled={disabled} onChange={(event) => setJsonFile(event.target.files?.[0] ?? null)} />
          <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs" tabIndex={0} aria-label={t("transcript.example")}>{'{"language":"ru","segments":[\n  {"start_ms":0,"end_ms":1000,\n   "text":"..."}\n]}'}</pre>
          <Button variant="secondary" disabled={disabled || !jsonFile} type="submit">{t("transcript.import")}</Button>
        </form>
      </div> : null}
      {transcript ? <section className="mt-8" aria-labelledby="transcript-text"><h2 id="transcript-text" className="text-2xl font-semibold">{t("transcript.text")}</h2>
        <p className="mt-3 text-sm text-muted">{t("transcript.counts", { total: transcript.total_segments, embedded: transcript.embedded_segments })}</p>
        {run ? <p className="mt-2 text-sm">{t("transcript.run")}: {t(`transcript.status.${run.status}`)} · {t(`transcript.source.${run.source}`)}</p> : null}
        {!transcript.segments.length ? <p className="mt-5 text-muted">{t("transcript.empty")}</p> : <ol className="mt-5 space-y-3">{transcript.segments.map((segment) => <li key={segment.segment_id} className="rounded-xl border border-border bg-surface p-4"><p className="font-mono text-xs text-muted">{formatOffset(segment.start_ms)}–{formatOffset(segment.end_ms)}</p><p className="mt-2 whitespace-pre-wrap break-words">{segment.text}</p></li>)}</ol>}
      </section> : null}
    </main>
  </div>;
}
