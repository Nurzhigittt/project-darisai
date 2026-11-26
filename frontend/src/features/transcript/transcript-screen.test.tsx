import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TranscriptScreen } from "./transcript-screen";
import { parseTranscript } from "./validation";
import { getProfessorSession, saveProfessorSession } from "@/lib/auth/professor";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const lectureId = "11111111-1111-4111-8111-111111111111";
const lecture = { lecture_id: lectureId, title: "Mechanics", language: "ru", course_id: lectureId };
const report = { lecture_id: lectureId, language: "ru", segments: [{ segment_id: "s1", start_ms: 1000, end_ms: 4000, text: "Force is a vector.", has_embedding: true }], total_segments: 1, embedded_segments: 1, latest_run: null };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function signIn(token = "professor-test") { saveProfessorSession({ accessToken: token, professorId: "prof", name: "Test", expiresAt: Math.floor(Date.now() / 1000) + 3600 }); }
function setup(override?: (path: string, options: RequestInit) => Response | Promise<Response> | undefined) {
  const fetcher = vi.fn<typeof fetch>(async (input, options = {}) => {
    const path = new URL(String(input)).pathname;
    const custom = override?.(path, options); if (custom) return custom;
    return json(path.endsWith("/transcript") ? report : lecture);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<I18nProvider><ThemeProvider><TranscriptScreen lectureId={lectureId} /></ThemeProvider></I18nProvider>);
  return fetcher;
}
beforeEach(() => { localStorage.clear(); localStorage.setItem("daris.locale", "en"); signIn(); navigation.replace.mockClear(); });
afterEach(() => vi.unstubAllGlobals());
it("renders real transcript timestamps and readiness counts", async () => {
  const transport = setup();
  expect(await screen.findByText("Force is a vector.")).toBeVisible();
  expect(screen.getByText("00:01–00:04")).toBeVisible();
  expect(screen.getByText("Segments: 1. Indexed for analysis: 1.")).toBeVisible();
  expect(transport.mock.calls.every(([, options]) => (options?.headers as Record<string,string>).Authorization === "Bearer professor-test")).toBe(true);
});
it("sends audio as multipart with chunk metadata and no JSON content type", async () => {
  let sent: RequestInit | undefined;
  setup((path, options) => { if (path.endsWith("/audio-chunks")) { sent = options; return json({ lecture_id: lectureId, status: "completed", chunk_index: 3 }); } });
  await screen.findByText("Force is a vector.");
  fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [new File(["audio"], "lecture.mp3", { type: "audio/mpeg" })] } });
  fireEvent.change(screen.getByLabelText("Chunk number (from 0)"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Start time, seconds"), { target: { value: "12.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Upload and transcribe" }));
  await screen.findByText("The server processed the file. Check the text below.");
  expect(sent?.body).toBeInstanceOf(FormData);
  expect((sent?.body as FormData).get("chunk_index")).toBe("3");
  expect((sent?.body as FormData).get("start_ms")).toBe("12500");
  expect((sent?.headers as Record<string,string>)["Content-Type"]).toBeUndefined();
});
it("explains a missing STT provider without claiming success", async () => {
  setup((path) => path.endsWith("/audio-chunks") ? json({ error: { code: "STT_NOT_CONFIGURED" } }, 503) : undefined);
  await screen.findByText("Force is a vector.");
  fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [new File(["audio"], "lecture.wav")] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload and transcribe" }));
  expect(await screen.findByText("Speech recognition is not configured. You can import a prepared transcript.")).toBeVisible();
});
it("reconciles an uncertain upload once and clears the file without replaying POST", async () => {
  let uploads = 0;
  setup((path) => { if (path.endsWith("/audio-chunks")) { uploads++; return Promise.reject(new TypeError("Disconnected")); } });
  await screen.findByText("Force is a vector.");
  fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [new File(["audio"], "lecture.wav")] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload and transcribe" }));
  await screen.findByText(/The response was lost/);
  await waitFor(() => expect(screen.getByRole("button", { name: "Upload and transcribe" })).toBeDisabled());
  expect(uploads).toBe(1);
});
it("preserves a newer professor session when an old upload returns 401", async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>((done) => { resolve = done; });
  const fetcher = setup((path) => path.endsWith("/audio-chunks") ? pending : undefined);
  await screen.findByText("Force is a vector.");
  fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [new File(["audio"], "lecture.wav")] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload and transcribe" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([path]) => String(path).endsWith("/audio-chunks"))).toBe(true));
  signIn("new-session");
  await act(async () => resolve(json({ error: { code: "UNAUTHORIZED" } }, 401)));
  expect(getProfessorSession()?.accessToken).toBe("new-session");
  expect(navigation.replace).toHaveBeenCalledWith("/professor");
  expect(screen.queryByText("Force is a vector.")).not.toBeInTheDocument();
});
it.each([
  { language: "ru", segments: [{ start_ms: -1, end_ms: 2, text: "a" }] },
  { language: "en", segments: [{ start_ms: 3, end_ms: 2, text: "a" }] },
  { language: "kk", segments: [{ start_ms: 0, end_ms: 2, text: " " }] },
  { language: "xx", segments: [{ start_ms: 0, end_ms: 2, text: "a" }] },
  { language: "en", segments: [] },
])("rejects invalid transcript data before transmission: %j", (data) => {
  expect(() => parseTranscript(JSON.stringify(data))).toThrow();
});
it("keeps only validated import fields, including the explicit synthetic flag", () => {
  expect(parseTranscript(JSON.stringify({ language: "kk", synthetic: true, secret: "unused", segments: [{ start_ms: 0, end_ms: 2, text: "Тест", extra: "unused" }] }))).toEqual({ language: "kk", synthetic: true, segments: [{ start_ms: 0, end_ms: 2, text: "Тест" }] });
});

it("caps imports at the backend default of 400 segments", () => {
  const segment = { start_ms: 0, end_ms: 1000, text: "A segment" };
  expect(parseTranscript(JSON.stringify({ language: "en", segments: Array.from({ length: 400 }, () => segment) })).segments).toHaveLength(400);
  expect(() => parseTranscript(JSON.stringify({ language: "en", segments: Array.from({ length: 401 }, () => segment) }))).toThrow();
});
it("imports validated JSON with the lecture language and refreshes the stored transcript", async () => {
  let imported = false;
  const fetcher = setup((path, options) => {
    if (path.endsWith("/transcript/import")) {
      imported = true;
      return json({ lecture_id: lectureId, run: { source: "fixture", status: "completed" }, degraded: false }, 201);
    }
    if (path.endsWith("/transcript") && imported) return json({ ...report, segments: [...report.segments, { segment_id: "s2", start_ms: 5000, end_ms: 7000, text: "Imported excerpt", has_embedding: true }], total_segments: 2, embedded_segments: 2 });
    if (options.method === "POST") throw new Error("Unexpected mutation");
  });
  await screen.findByText("Force is a vector.");
  const segments = [{ start_ms: 5000, end_ms: 7000, text: "Imported excerpt" }];
  const source = JSON.stringify({ language: "kk", synthetic: true, secret: "unused", segments: [{ ...segments[0], extra: "unused" }] });
  const file = new File([source], "transcript.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => source });
  fireEvent.change(screen.getByLabelText("Transcript JSON"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  expect(await screen.findByText("Imported excerpt")).toBeVisible();
  expect(screen.getByText("Force is a vector.")).toBeVisible();
  expect(screen.getByText("Segments: 2. Indexed for analysis: 2.")).toBeVisible();
  const posts = fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(new URL(String(posts[0]![0])).pathname).toBe(`/api/v1/lectures/${lectureId}/transcript/import`);
  expect(JSON.parse(String(posts[0]![1]?.body))).toEqual({ language: "ru", synthetic: true, segments });
  expect(new Headers(posts[0]![1]?.headers).get("Authorization")).toBe("Bearer professor-test");
  expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
});
it("discards a late JSON file-read failure after a silent account change", async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise<string>((_, fail) => { reject = fail; });
  const fetcher = setup();
  await screen.findByText("Force is a vector.");
  const file = new File(["{}"], "transcript.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => pending });
  fireEvent.change(screen.getByLabelText("Transcript JSON"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  signIn("new-session");
  await act(async () => reject(new Error("File read interrupted")));
  expect(getProfessorSession()?.accessToken).toBe("new-session");
  expect(navigation.replace).toHaveBeenCalledWith("/professor");
  expect(screen.queryByText("Force is a vector.")).not.toBeInTheDocument();
  expect(screen.queryByText(/Invalid JSON:/)).not.toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
});
