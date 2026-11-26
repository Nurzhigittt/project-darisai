import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

afterEach(() => vi.unstubAllGlobals());

describe("API response failures", () => {
  it.each([401, 429, 503])("preserves HTTP %s when a proxy returns a non-JSON error", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Unavailable</html>", { status })));
    await expect(api.listConceptAutonomy("test-only-token", "lecture-id")).rejects.toMatchObject({
      name: "ApiError", status, code: "INVALID_RESPONSE",
    });
  });

  it("treats an unreadable successful mutation response as an uncertain server result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"mode":', { status: 200 })));
    await expect(api.updateConceptAutonomy("test-only-token", "lecture-id", "concept-id", { mode: "whitelisted" }))
      .rejects.toMatchObject({ name: "ApiError", status: 502, code: "INVALID_RESPONSE" });
  });
});

const lectureId = "11111111-1111-4111-8111-111111111111";
const replayToken = "test-only-replay-pass";
const momentToken = "test-only-signed-moment";
const stateToken = "test-only-signed-state";
const replayRequests = [
  {
    name: "Replay start", path: "/api/v1/replay/start",
    body: { lecture_id: lectureId, flagged_offsets_ms: [12000] },
    call: (signal: AbortSignal) => api.startReplay(replayToken, { lecture_id: lectureId, flagged_offsets_ms: [12000] }, signal),
  },
  {
    name: "Replay turn", path: "/api/v1/replay/turn",
    body: { lecture_id: lectureId, moment_id: momentToken, stage: "socratic", state_token: stateToken, input: { text: "My explanation" } },
    call: (signal: AbortSignal) => api.replayTurn(replayToken, { lecture_id: lectureId, moment_id: momentToken, stage: "socratic", state_token: stateToken, input: { text: "My explanation" } }, signal),
  },
  {
    name: "GapCards generation", path: "/api/v1/gapcards/generate",
    body: { lecture_id: lectureId, moments: [{ moment_id: momentToken, outcome: "partial" }] },
    call: (signal: AbortSignal) => api.generateGapCards(replayToken, { lecture_id: lectureId, moments: [{ moment_id: momentToken, outcome: "partial" }] }, signal),
  },
];

describe("AI API credential boundaries", () => {
  it.each(replayRequests)("$name sends only its Replay pass in a header and keeps signed credentials out of the URL", async ({ path, body, call }) => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const controller = new AbortController();
    await call(controller.signal);
    expect(mock).toHaveBeenCalledOnce();
    const [input, init] = mock.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.pathname).toBe(path);
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    for (const secret of [replayToken, momentToken, stateToken]) expect(String(input)).not.toContain(secret);
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Replay-Token")).toBe(replayToken);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", signal: controller.signal });
    expect(JSON.parse(String(init?.body))).toEqual(body);
    expect(String(init?.body)).not.toContain(replayToken);
  });

  it.each(replayRequests)("$name forwards cancellation without converting it to a network error", async ({ call }) => {
    const aborted = new DOMException("Cancelled", "AbortError");
    const mock = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(aborted), { once: true });
    }));
    vi.stubGlobal("fetch", mock);
    const controller = new AbortController();
    const request = call(controller.signal);
    const assertion = expect(request).rejects.toBe(aborted);
    controller.abort();
    await assertion;
    expect(mock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("uses professor Bearer authentication for insight generation, isolated from the student Replay pass", async () => {
    const professorToken = "test-only-professor-pass";
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const controller = new AbortController();
    await api.generateInsight(professorToken, lectureId, { kind: "brief_next", max_concepts: 3 }, controller.signal);
    const [input, init] = mock.mock.calls[0]!;
    expect(new URL(String(input)).pathname).toBe(`/api/v1/lectures/${lectureId}/insights/generate`);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${professorToken}`);
    expect(headers.has("X-Replay-Token")).toBe(false);
    expect(String(input)).not.toContain(professorToken);
    expect(String(init?.body)).not.toContain(professorToken);
    expect(JSON.parse(String(init?.body))).toEqual({ kind: "brief_next", max_concepts: 3 });
    expect(init?.signal).toBe(controller.signal);
  });
});
