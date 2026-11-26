import type { TranscriptImportRequest } from "@/lib/api/client";

export const MAX_AUDIO_BYTES = process.env.NEXT_PUBLIC_REALTIME_TRANSPORT === "supabase"
  ? 4_000_000 : 25 * 1024 * 1024;
export const MAX_JSON_BYTES = 20 * 1024 * 1024;
// Conservative client limit matches the backend default configuration.
export const MAX_TRANSCRIPT_SEGMENTS = 400;
const audioTypes: Record<string, string> = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg" };
export function audioMime(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return audioTypes[extension] ?? (Object.values(audioTypes).includes(file.type) ? file.type : null);
}
export function parseTranscript(text: string): TranscriptImportRequest {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object") throw new Error("Invalid transcript");
  const body = data as Record<string, unknown>;
  if (!["en", "ru", "kk"].includes(String(body.language)) || !Array.isArray(body.segments) || !body.segments.length || body.segments.length > MAX_TRANSCRIPT_SEGMENTS) throw new Error("Invalid transcript");
  if (body.synthetic !== undefined && typeof body.synthetic !== "boolean") throw new Error("Invalid transcript");
  const segments = body.segments.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid segment");
    const segment = item as Record<string, unknown>;
    if (typeof segment.start_ms !== "number" || typeof segment.end_ms !== "number" || !Number.isSafeInteger(segment.start_ms) || !Number.isSafeInteger(segment.end_ms) || segment.start_ms < 0 || segment.end_ms < segment.start_ms || typeof segment.text !== "string" || !segment.text.trim() || segment.text.length > 8000) throw new Error("Invalid segment");
    return { start_ms: segment.start_ms, end_ms: segment.end_ms, text: segment.text };
  });
  return { language: body.language as TranscriptImportRequest["language"], synthetic: body.synthetic === true, segments };
}
