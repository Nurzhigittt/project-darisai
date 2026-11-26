import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GapCardsScreen } from "@/features/gapcards/gapcards-screen";
import type { GapCard, ReplayStartOut } from "@/lib/api/client";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import * as storage from "@/lib/storage/db";
import { ThemeProvider } from "@/lib/theme";

const lectureId = "11111111-1111-4111-8111-111111111111";
const momentId = "signed-moment-test-only-123456789";
const token = "replay-test-only-token";
const label = (key: string) => dictionaries.en[key] ?? key;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function fixture(): GapCard {
  return {
    card_id: "22222222-2222-4222-8222-222222222222", moment_id: momentId,
    concept_title: "Net force", front: "How does net force change acceleration?",
    back: { type: "transcript_quote", quote: "Acceleration increases with net force.", citation: { segment_id: "33333333-3333-4333-8333-333333333333", start_ms: 10000, end_ms: 20000, quote: "Acceleration increases with net force." } },
    difficulty: 2, source: "template",
    validation: { schema_ok: true, citations_ok: true, answer_leak: false, grounded_score: 1, attempts: 1, fallback_used: true, details: [] },
  };
}

function replayFixture(): ReplayStartOut {
  return { lecture_id: lectureId, transcript_status: "ready", source: "template", moments: [{ moment_id: momentId, offset_ms: 12000, concept_title: "Net force", window: { start_ms: 0, end_ms: 22000 }, recap: { text: "Force and acceleration.", citations: [fixture().back.citation] } }] };
}

async function seed(expired = false, signals = true) {
  await storage.saveSession({
    lectureId, joinCode: "ABC123", signalToken: "signal-must-not-be-used", replayToken: token,
    lecture: { id: lectureId, title: "Mechanics", language: "en", status: "ended", course_title: "Physics" },
    wsUrl: "ws://localhost/ws", joinedAt: new Date().toISOString(), signalTokenExpiresAt: new Date().toISOString(),
    replayTokenExpiresAt: new Date(Date.now() + (expired ? -3600_000 : 3600_000)).toISOString(), nextSeq: 1, cooldownUntil: 0,
  });
  if (signals) await storage.recordConfirmedSignal({ id: `${lectureId}:1`, lectureId, clientSeq: 1, offsetMs: 12000, acceptedAt: new Date().toISOString() });
}

function stored(): storage.StoredGapCard {
  const card = fixture();
  return { id: `${lectureId}:${card.card_id}`, lectureId, front: card.front, quote: card.back.quote, offsetMs: 12000, createdAt: new Date().toISOString(), conceptTitle: card.concept_title, citation: card.back.citation, source: card.source };
}

type Override = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;
function transport(override?: Override) {
  const mock = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = new URL(String(input));
    const custom = override?.(url, init);
    if (custom !== undefined) return custom;
    if (url.pathname === "/api/v1/replay/start") return json(replayFixture());
    if (url.pathname === "/api/v1/gapcards/generate") return json({ lecture_id: lectureId, cards: [fixture()] });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function view() {
  return <I18nProvider><ThemeProvider><GapCardsScreen lectureId={lectureId} /></ThemeProvider></I18nProvider>;
}

async function createCards() {
  fireEvent.click(await screen.findByRole("button", { name: label("gapcards.generate") }));
  await screen.findByText(label("gapcards.generated"));
}

beforeEach(async () => {
  localStorage.clear(); localStorage.setItem("daris.locale", "en");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  await storage.resetLocalDbForTests();
  await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase("daris-local-v1"); request.onsuccess = () => resolve(); });
});
afterEach(() => vi.unstubAllGlobals());

describe("GapCardsScreen", () => {
  it("creates cards only on request, with fresh signed moments and Replay credentials", async () => {
    await seed();
    await storage.saveReplayProgress({ id: `${lectureId}:12000`, lectureId, offsetMs: 12000, conceptTitle: "Net force", recap: "Force", recapCitations: [], source: "template", messages: [], completed: true, outcome: "partial", updatedAt: new Date().toISOString() });
    const mock = transport();
    render(view());
    await screen.findByText(label("gapcards.emptyTitle"));
    expect(mock).not.toHaveBeenCalled();
    await createCards();
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ lecture_id: lectureId, flagged_offsets_ms: [12000] }), headers: { "X-Replay-Token": token } });
    expect(mock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ lecture_id: lectureId, moments: [{ moment_id: momentId, outcome: "partial" }] }));
    for (const [url, init] of mock.mock.calls) {
      expect(String(url)).not.toContain(token);
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
      expect(JSON.stringify(init)).not.toContain("signal-must-not-be-used");
    }
    expect(JSON.stringify(await storage.listStoredGapCards(lectureId))).not.toContain(momentId);
    expect(screen.getByText(label("gapcards.templateNotice"))).toBeInTheDocument();
  });

  it("reveals the server quote and timestamp before rating; local progress survives remount without a request", async () => {
    await seed();
    const mock = transport();
    const rendered = render(view());
    await createCards();
    expect(screen.queryByText(fixture().back.quote)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: label("gapcards.rating.good") })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: label("gapcards.flip") }));
    expect(screen.getByText(fixture().back.quote)).toBeInTheDocument();
    expect(screen.getByText(/00:10–00:20/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: label("gapcards.context") })).toHaveAttribute("href", `/replay/${lectureId}#offset-12000`);
    fireEvent.click(screen.getByRole("button", { name: label("gapcards.rating.good") }));
    expect(await screen.findByText(label("gapcards.reviewSaved"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label("gapcards.rating.good") })).toBeDisabled();
    expect((await storage.listStoredGapCards(lectureId))[0]?.review?.lastRating).toBe("good");
    expect(mock).toHaveBeenCalledTimes(2);
    rendered.unmount();
    render(view());
    await screen.findByText(fixture().front);
    expect(screen.getByText(label("gapcards.reviewProgress").replace("{reviewed}", "1").replace("{total}", "1"))).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("preserves local review progress when the server refreshes matching card content", async () => {
    await seed();
    await storage.saveStoredGapCards(lectureId, [stored()]);
    await storage.reviewStoredGapCard(stored().id, "easy");
    transport();
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.refresh") }));
    await screen.findByText(label("gapcards.generated"));
    expect((await storage.listStoredGapCards(lectureId))[0]?.review).toMatchObject({ lastRating: "easy", reviewCount: 1, box: 2 });
  });

  it("allows saved cards to be reviewed offline with an expired pass", async () => {
    await seed(true);
    await storage.saveStoredGapCards(lectureId, [stored()]);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const mock = transport();
    render(view());
    await screen.findByText(fixture().front);
    expect(screen.getByRole("button", { name: label("gapcards.refresh") })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: label("gapcards.flip") }));
    fireEvent.click(screen.getByRole("button", { name: label("gapcards.rating.again") }));
    await screen.findByText(label("gapcards.reviewSaved"));
    expect(mock).not.toHaveBeenCalled();
    expect((await storage.listStoredGapCards(lectureId))[0]?.review?.lastRating).toBe("again");
  });

  it("does not invent moments when confirmed Signal history is absent", async () => {
    await seed(false, false);
    const mock = transport();
    render(view());
    expect(await screen.findByText(label("gapcards.noSignals"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label("gapcards.generate") })).toBeDisabled();
    expect(mock).not.toHaveBeenCalled();
  });

  it.each([[401, "UNAUTHORIZED", "gapcards.expired"], [409, "TRANSCRIPT_REQUIRED", "gapcards.noTranscript"], [429, "RATE_LIMITED", "gapcards.rateLimit"], [503, "AI_BUDGET_EXHAUSTED", "gapcards.budget"]] as const)("handles server %s/%s and retains existing cards", async (status, code, key) => {
    await seed();
    await storage.saveStoredGapCards(lectureId, [stored()]);
    const mock = transport(() => json({ error: { code, message: "Unavailable" } }, status));
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.refresh") }));
    expect(await screen.findByText(label(key))).toBeInTheDocument();
    expect(screen.getByText(fixture().front)).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(1);
    expect(await storage.listStoredGapCards(lectureId)).toHaveLength(1);
  });

  it("does not automatically retry a failed generation, and obtains fresh moments on explicit retry", async () => {
    await seed();
    let failed = false;
    const mock = transport((url) => {
      if (url.pathname.endsWith("/generate") && !failed) { failed = true; return Promise.reject(new TypeError("Network unavailable")); }
    });
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.generate") }));
    await screen.findByText(label("gapcards.network"));
    expect(mock).toHaveBeenCalledTimes(2);
    await createCards();
    expect(mock.mock.calls.filter(([url]) => String(url).endsWith("/replay/start"))).toHaveLength(2);
  });

  it("does not display or persist cards that fail server citation validation", async () => {
    await seed();
    transport((url) => url.pathname.endsWith("/generate") ? json({ lecture_id: lectureId, cards: [{ ...fixture(), validation: { ...fixture().validation, citations_ok: false } }] }) : undefined);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.generate") }));
    expect(await screen.findByText(label("gapcards.invalidResponse"))).toBeInTheDocument();
    expect(screen.queryByText(fixture().front)).not.toBeInTheDocument();
    expect(await storage.listStoredGapCards(lectureId)).toEqual([]);
  });

  it("reports an IndexedDB write failure without claiming saved progress", async () => {
    await seed();
    await storage.saveStoredGapCards(lectureId, [stored()]);
    const mock = transport();
    vi.spyOn(storage, "reviewStoredGapCard").mockResolvedValue(null);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.flip") }));
    fireEvent.click(screen.getByRole("button", { name: label("gapcards.rating.hard") }));
    expect(await screen.findByText(label("gapcards.storageError"))).toBeInTheDocument();
    expect(screen.queryByText(label("gapcards.reviewSaved"))).not.toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("aborts pending generation on unmount and never saves its late response", async () => {
    await seed();
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const mock = transport((url) => url.pathname.endsWith("/generate") ? pending : undefined);
    const rendered = render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.generate") }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    const signal = mock.mock.calls[1]?.[1]?.signal;
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(json({ lecture_id: lectureId, cards: [fixture()] })));
    expect(await storage.listStoredGapCards(lectureId)).toEqual([]);
  });

  it.each(["/replay/start", "/generate"])("discards a late %s response after another view clears lecture history", async (endpoint) => {
    await seed();
    await storage.saveStoredGapCards(lectureId, [stored()]);
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const mock = transport((url) => url.pathname.endsWith(endpoint) ? pending : undefined);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.refresh") }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(endpoint === "/generate" ? 2 : 1));
    await storage.clearLectureHistory(lectureId);
    await act(async () => resolve(json(endpoint === "/generate" ? { lecture_id: lectureId, cards: [fixture()] } : replayFixture())));
    await screen.findByText(label("gapcards.historyChanged"));
    expect(screen.queryByText(fixture().front)).not.toBeInTheDocument();
    expect(screen.queryByText(label("gapcards.generated"))).not.toBeInTheDocument();
    expect(await storage.listStoredGapCards(lectureId)).toEqual([]);
    expect(screen.getByRole("button", { name: label("gapcards.generate") })).toBeDisabled();
    expect(mock).toHaveBeenCalledTimes(endpoint === "/generate" ? 2 : 1);
  });

  it("requires a fresh view after a history clear, even if new signals have since arrived", async () => {
    await seed();
    await storage.saveStoredGapCards(lectureId, [stored()]);
    const mock = transport();
    render(view());
    await screen.findByText(fixture().front);
    await storage.clearLectureHistory(lectureId);
    await storage.recordConfirmedSignal({ id: `${lectureId}:2`, lectureId, clientSeq: 2, offsetMs: 14000, acceptedAt: new Date().toISOString() });
    fireEvent.click(screen.getByRole("button", { name: label("gapcards.refresh") }));
    await screen.findByText(label("gapcards.historyChanged"));
    expect(mock).not.toHaveBeenCalled();
    expect(screen.queryByText(fixture().front)).not.toBeInTheDocument();
  });

  it("shows the current persisted rating when another tab rates while generation is pending", async () => {
    await seed();
    await storage.saveStoredGapCards(lectureId, [stored()]);
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const mock = transport((url) => url.pathname.endsWith("/generate") ? pending : undefined);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("gapcards.refresh") }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    await storage.reviewStoredGapCard(stored().id, "easy");
    await act(async () => resolve(json({ lecture_id: lectureId, cards: [fixture()] })));
    await screen.findByText(label("gapcards.generated"));
    expect(screen.getByText(label("gapcards.reviewProgress").replace("{reviewed}", "1").replace("{total}", "1"))).toBeInTheDocument();
    expect((await storage.listStoredGapCards(lectureId))[0]?.review?.lastRating).toBe("easy");
  });


  it("removes deleted in-memory cards when returning from another tab", async () => {
    await seed();
    await storage.saveStoredGapCards(lectureId, [stored()]);
    const mock = transport();
    render(view());
    await screen.findByText(fixture().front);
    await storage.clearLectureHistory(lectureId);
    fireEvent.focus(window);
    await screen.findByText(label("gapcards.historyChanged"));
    expect(screen.queryByText(fixture().front)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: label("gapcards.generate") })).toBeDisabled();
    expect(mock).not.toHaveBeenCalled();
  });

});
