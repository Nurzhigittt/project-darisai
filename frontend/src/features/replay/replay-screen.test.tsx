import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReplayStartOut, ReplayTurnOut } from "@/lib/api/client";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { addPendingSignal, clearLectureHistory, getHistoryRevision, getSession, listReplayProgress, recordConfirmedSignal, resetLocalDbForTests, saveReplayProgress, saveSession, type LocalSession, type StoredReplayProgress } from "@/lib/storage/db";
import { ThemeProvider } from "@/lib/theme";

import { boundedReplayHistory } from "./replay-helpers";
import { ReplayScreen } from "./replay-screen";

const lectureId = "11111111-1111-4111-8111-111111111111";
const replayToken = "private-replay-access-test";
const momentToken = "signed-moment-test-only-12345678";
const stateToken = "signed-state-test-only-12345678";
const offset = 250_000;
const label = (key: string) => dictionaries.en[key] ?? key;
const citation = { segment_id: "33333333-3333-4333-8333-333333333333", start_ms: 240_000, end_ms: 260_000, quote: "Acceleration follows the net force." };

function localSession(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    lectureId, joinCode: "ABC123", signalToken: "private-signal-token-test", replayToken,
    lecture: { id: lectureId, title: "Forces and motion", course_title: "Mechanics", status: "ended", language: "en" },
    wsUrl: "ws://localhost:8000/ws", joinedAt: new Date().toISOString(),
    signalTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    replayTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), nextSeq: 2, cooldownUntil: 0,
    ...overrides,
  };
}

async function seed() {
  await saveSession(localSession());
  await recordConfirmedSignal({ id: `${lectureId}:1`, lectureId, clientSeq: 1, offsetMs: offset, acceptedAt: new Date().toISOString() });
}

function moments(token = momentToken): ReplayStartOut {
  return { lecture_id: lectureId, source: "template", transcript_status: "ready", moments: [{
    moment_id: token, offset_ms: offset, window: { start_ms: 160_000, end_ms: 260_000 }, concept_title: "Net force",
    recap: { text: "The lecturer discussed the relation between force and acceleration.", citations: [citation] },
  }] };
}

function turn(kind: "mcq" | "question" | "reflection" | "refusal" = "question", complete = false): ReplayTurnOut {
  return {
    turn: { kind, text: kind === "mcq" ? "Which quantity changes acceleration?" : kind === "refusal" ? "There is not enough lecture evidence." : complete ? "Summarize the relation in your own words." : "How would you explain the net force?",
      citations: kind === "refusal" ? [] : [citation], options: kind === "mcq" ? [{ id: "a", text: "Net force" }, { id: "b", text: "Colour" }] : [],
      stage_complete: complete, state_token: stateToken, source: kind === "mcq" ? "live" : "template",
    },
    state_token: stateToken, stage: complete ? "complete" : "socratic", turn_number: 1,
  };
}

function stored(): StoredReplayProgress {
  return { id: `${lectureId}:${offset}`, lectureId, offsetMs: offset, conceptTitle: "Net force", recap: "Saved recap", recapCitations: [citation], source: "template",
    messages: [{ role: "axiom", text: "Saved discussion question", kind: "question", citations: [citation], source: "template" }], completed: false, outcome: "partial", updatedAt: new Date().toISOString() };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function failure(status: number, code: string) {
  return json({ error: { code, message: "Server-internal text must not be shown." } }, status);
}

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { resolve, promise };
}

type Override = (url: URL, options: RequestInit) => Response | Promise<Response> | undefined;
function mockApi(override?: Override) {
  const transport = vi.fn<typeof fetch>(async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const custom = override?.(url, options);
    if (custom !== undefined) return custom;
    if (url.pathname === "/api/v1/replay/start") return json(moments());
    if (url.pathname === "/api/v1/replay/turn") return json(turn());
    return failure(404, "NOT_FOUND");
  });
  vi.stubGlobal("fetch", transport);
  return transport;
}

function ui() { return <I18nProvider><ThemeProvider><ReplayScreen lectureId={lectureId} /></ThemeProvider></I18nProvider>; }
function discussion() { return within(screen.getByRole("region", { name: "Net force" })); }

async function openAndBegin() {
  fireEvent.click(await screen.findByRole("button", { name: label("replay.find") }));
  fireEvent.click(await screen.findByRole("button", { name: /Open moment at .*Net force/ }));
  fireEvent.click(await screen.findByRole("button", { name: label("replay.begin") }));
}

beforeEach(async () => {
  await resetLocalDbForTests();
  await deleteDB("daris-local-v1");
  window.localStorage.clear();
  window.localStorage.setItem("daris.locale", "en");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetLocalDbForTests();
});

describe("ReplayScreen with real local storage and API client", () => {
  it("does not request Replay without local credentials or fabricate confirmed moments", async () => {
    const transport = mockApi();
    render(ui());
    expect(await screen.findByText(label("replay.noSession"))).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: label("replay.find") })).not.toBeInTheDocument();
  });

  it("uses only confirmed offsets and the Replay header, never Signal or professor credentials", async () => {
    await seed();
    await addPendingSignal({ id: `${lectureId}:2`, lectureId, clientSeq: 2, createdAt: Date.now(), clientTsMs: Date.now() });
    window.localStorage.setItem("daris.professor.session", JSON.stringify({ accessToken: "unrelated-professor-token" }));
    const transport = mockApi();
    render(ui());
    await screen.findByRole("button", { name: label("replay.find") });
    expect(transport).not.toHaveBeenCalled();
    await openAndBegin();
    await screen.findByRole("textbox", { name: label("replay.answer") });
    const start = transport.mock.calls[0];
    expect(JSON.parse(String(start?.[1]?.body))).toEqual({ lecture_id: lectureId, flagged_offsets_ms: [offset] });
    for (const [url, options] of transport.mock.calls) {
      expect(String(url)).not.toContain(replayToken);
      expect(String(url)).not.toContain(momentToken);
      expect(options).toMatchObject({ method: "POST", headers: { "X-Replay-Token": replayToken }, cache: "no-store" });
      expect((options?.headers as Record<string, string>).Authorization).toBeUndefined();
    }
    expect(discussion().getAllByText(label("replay.source.template")).length).toBeGreaterThan(0);
    expect(discussion().getByText(label("replay.templateNote"))).toBeInTheDocument();
    expect(discussion().getAllByText(citation.quote).length).toBeGreaterThan(0);
  });

  it("runs MCQ, free text and completion, persists dialogue and outcome without signed capabilities", async () => {
    await seed();
    let count = 0;
    const transport = mockApi((url) => {
      if (url.pathname === "/api/v1/replay/turn") {
        count += 1;
        return json(count === 1 ? turn("mcq") : count === 2 ? turn() : turn("reflection", true));
      }
      return undefined;
    });
    render(ui());
    await openAndBegin();
    const radio = await screen.findByRole("radio", { name: "Net force" });
    await waitFor(() => expect(radio).toBeEnabled());
    fireEvent.click(radio);
    fireEvent.click(discussion().getByRole("button", { name: label("replay.send") }));
    const answer = await screen.findByRole("textbox", { name: label("replay.answer") });
    await waitFor(() => expect(answer).toBeEnabled());
    fireEvent.change(answer, { target: { value: "Acceleration depends on the resultant force." } });
    fireEvent.click(discussion().getByRole("button", { name: label("replay.send") }));
    await waitFor(() => expect(discussion().getByRole("heading", { name: label("replay.complete") })).toBeInTheDocument());
    await waitFor(() => expect(discussion().getByRole("button", { name: label("replay.outcome.clear") })).toBeEnabled());
    fireEvent.click(discussion().getByRole("button", { name: label("replay.outcome.clear") }));
    await waitFor(async () => expect((await listReplayProgress(lectureId))[0]?.outcome).toBe("clear"));
    const progress = (await listReplayProgress(lectureId))[0];
    expect(progress?.completed).toBe(true);
    expect(progress?.messages).toHaveLength(5);
    for (const secret of [replayToken, momentToken, stateToken, "private-signal-token-test", "state_token", "stateToken", "moment_id"]) {
      expect(JSON.stringify(progress)).not.toContain(secret);
    }
    const turns = transport.mock.calls.filter(([url]) => String(url).endsWith("/turn")).map(([, options]) => JSON.parse(String(options?.body)));
    expect(turns[0]).toMatchObject({ stage: "mcq", state_token: null, input: null, history: [] });
    expect(turns[1]).toMatchObject({ stage: "socratic", state_token: stateToken, input: { choice_id: "a", text: "Net force" } });
    expect(turns[2]).toMatchObject({ state_token: stateToken, input: { text: "Acceleration depends on the resultant force." } });
    expect(screen.getByRole("link", { name: label("replay.gapcards") })).toHaveAttribute("href", `/gapcards/${lectureId}`);
  });

  it("sends the selected MCQ meaning within the server text and total input limits", async () => {
    await seed();
    const optionText = "Force changes acceleration. ".repeat(30);
    const optionId = "a".repeat(400);
    let count = 0;
    const transport = mockApi((url) => {
      if (!url.pathname.endsWith("/turn")) return undefined;
      const result = turn(++count === 1 ? "mcq" : "question");
      if (count === 1) result.turn.options = [{ id: optionId, text: optionText }, { id: "b", text: "Colour" }];
      return json(result);
    });
    render(ui());
    await openAndBegin();
    const radio = await screen.findByRole("radio", { name: optionText.trim() });
    await waitFor(() => expect(radio).toBeEnabled());
    fireEvent.click(radio);
    fireEvent.click(discussion().getByRole("button", { name: label("replay.send") }));
    await screen.findByRole("textbox", { name: label("replay.answer") });
    const [, options] = transport.mock.calls.filter(([url]) => String(url).endsWith("/turn"))[1] ?? [];
    const input = JSON.parse(String(options?.body)).input as Record<string, string>;
    expect(input).toEqual({ choice_id: optionId, text: optionText.trim().slice(0, 600) });
    expect(Object.values(input).reduce((sum, value) => sum + value.length, 0)).toBeLessThanOrEqual(1000);
  });

  it("never resends a consumed state after an uncertain reply and starts recovery with a fresh moment", async () => {
    await seed();
    let starts = 0;
    let turns = 0;
    const transport = mockApi((url) => {
      if (url.pathname.endsWith("/start")) return json(moments(++starts === 1 ? momentToken : "fresh-signed-moment-12345678"));
      if (url.pathname.endsWith("/turn")) {
        turns += 1;
        if (turns === 2) throw new TypeError("Network response lost");
        return json(turn());
      }
      return undefined;
    });
    render(ui());
    await openAndBegin();
    const answer = await screen.findByRole("textbox", { name: label("replay.answer") });
    await waitFor(() => expect(answer).toBeEnabled());
    fireEvent.change(answer, { target: { value: "My reasoning" } });
    const send = discussion().getByRole("button", { name: label("replay.send") });
    fireEvent.click(send); fireEvent.click(send);
    expect(await screen.findByRole("alert")).toHaveTextContent(label("replay.uncertain"));
    expect(discussion().queryByRole("button", { name: label("replay.send") })).not.toBeInTheDocument();
    expect(turns).toBe(2);
    fireEvent.click(discussion().getByRole("button", { name: label("replay.restart") }));
    fireEvent.click(await screen.findByRole("button", { name: label("replay.begin") }));
    await screen.findByRole("textbox", { name: label("replay.answer") });
    const bodies = transport.mock.calls.filter(([url]) => String(url).endsWith("/turn")).map(([, options]) => JSON.parse(String(options?.body)));
    expect(bodies.filter((body) => body.state_token === stateToken)).toHaveLength(1);
    expect(bodies[2]).toMatchObject({ moment_id: "fresh-signed-moment-12345678", state_token: null, input: null, history: [] });
  });

  it("shows saved dialogue offline with expired access and makes no network call", async () => {
    await seed();
    await saveSession(localSession({ replayTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }));
    await saveReplayProgress(stored());
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const transport = mockApi();
    render(ui());
    await screen.findByText(label("replay.saved"));
    expect(screen.getByText("Saved discussion question")).toBeInTheDocument();
    expect(screen.getByText(label("replay.expired"))).toBeInTheDocument();
    expect(screen.getByText(label("replay.offline"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label("replay.find") })).toBeDisabled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("shows transcript-unavailable and request-limit errors without inventing moments", async () => {
    await seed();
    let calls = 0;
    mockApi((url) => url.pathname.endsWith("/start") ? (++calls === 1 ? failure(409, "TRANSCRIPT_REQUIRED") : failure(429, "AI_RATE_LIMITED")) : undefined);
    render(ui());
    fireEvent.click(await screen.findByRole("button", { name: label("replay.find") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(label("replay.noTranscript"));
    expect(screen.queryByRole("button", { name: /Open moment at/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: label("replay.find") }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(label("replay.rateLimit")));
    expect(screen.queryByText("Server-internal text must not be shown.")).not.toBeInTheDocument();
  });

  it("renders a server refusal as completion without an answer form", async () => {
    await seed();
    mockApi((url) => url.pathname.endsWith("/turn") ? json(turn("refusal", true)) : undefined);
    render(ui());
    await openAndBegin();
    await waitFor(() => expect(discussion().getByText(label("replay.refusal"))).toBeInTheDocument());
    expect(discussion().queryByRole("textbox")).not.toBeInTheDocument();
    expect(discussion().queryByRole("button", { name: label("replay.send") })).not.toBeInTheDocument();
  });

  it.each([200, 401])("discards an old request returning %s after Replay access silently changes", async (status) => {
    await seed();
    const pending = deferred();
    const transport = mockApi((url) => url.pathname.endsWith("/start") ? pending.promise : undefined);
    render(ui());
    fireEvent.click(await screen.findByRole("button", { name: label("replay.find") }));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    await saveSession(localSession({ replayToken: "new-valid-replay-token" }));
    await act(async () => pending.resolve(status === 200 ? json(moments()) : failure(401, "UNAUTHORIZED")));
    await waitFor(() => expect(screen.getByText(label("replay.sessionChanged"))).toBeInTheDocument());
    expect((await getSession(lectureId))?.replayToken).toBe("new-valid-replay-token");
    expect(screen.queryByRole("button", { name: /Open moment at/ })).not.toBeInTheDocument();
  });

  it("aborts the current request when leaving the page", async () => {
    await seed();
    const pending = deferred();
    const transport = mockApi((url) => url.pathname.endsWith("/start") ? pending.promise : undefined);
    const view = render(ui());
    fireEvent.click(await screen.findByRole("button", { name: label("replay.find") }));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(json(moments())));
    expect(await listReplayProgress(lectureId)).toEqual([]);
  });

  it.each([200, 401])("discards a pending turn returning %s after history is cleared with the same access token", async (status) => {
    await seed();
    await saveReplayProgress(stored());
    const pending = deferred();
    const transport = mockApi((url) => url.pathname.endsWith("/turn") ? pending.promise : undefined);
    render(ui());
    await openAndBegin();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    const oldRevision = await getHistoryRevision(lectureId);
    expect(await clearLectureHistory(lectureId)).toBe(true);
    expect(await getHistoryRevision(lectureId)).toBe(oldRevision + 1);
    expect((await getSession(lectureId))?.replayToken).toBe(replayToken);
    await act(async () => pending.resolve(status === 200 ? json(turn()) : failure(401, "UNAUTHORIZED")));
    expect(await screen.findByText(label("replay.historyChanged"))).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Net force" })).not.toBeInTheDocument();
    expect(screen.queryByText("Saved discussion question")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: label("replay.find") })).not.toBeInTheDocument();
    expect(screen.queryByText(label("replay.expired"))).not.toBeInTheDocument();
    expect(await listReplayProgress(lectureId)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: label("replay.reload") }));
    expect(await screen.findByText(label("replay.noSignals"))).toBeInTheDocument();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("does not repopulate cleared dialogue through a stale self-assessment action", async () => {
    await seed();
    const transport = mockApi();
    render(ui());
    await openAndBegin();
    const outcome = await screen.findByRole("button", { name: label("replay.outcome.clear") });
    await waitFor(() => expect(outcome).toBeEnabled());
    expect(await listReplayProgress(lectureId)).toHaveLength(1);
    await clearLectureHistory(lectureId);
    fireEvent.click(outcome);
    expect(await screen.findByText(label("replay.historyChanged"))).toBeInTheDocument();
    expect(await listReplayProgress(lectureId)).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("checks the loaded history revision before requesting new moments", async () => {
    await seed();
    const transport = mockApi();
    render(ui());
    const find = await screen.findByRole("button", { name: label("replay.find") });
    await clearLectureHistory(lectureId);
    fireEvent.click(find);
    expect(await screen.findByText(label("replay.historyChanged"))).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("bounded replay context", () => {
  it("keeps actual recent messages in order within per-message and total server limits", () => {
    const result = boundedReplayHistory(Array.from({ length: 18 }, (_, index) => ({ role: index % 2 ? "student" : "axiom", text: `${index}:` + "x".repeat(2500) })));
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(4000);
    expect(result.every((item) => item.text.length <= 2000)).toBe(true);
    expect(result.at(-1)?.text).toMatch(/^17:/);
    expect(result[0]?.text).toMatch(/^16:/);
  });
});
