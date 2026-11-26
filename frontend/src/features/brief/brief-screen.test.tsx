import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BriefScreen } from "@/features/brief/brief-screen";
import type { HandoffLink, Insight, Lecture } from "@/lib/api/client";
import { getProfessorSession, saveProfessorSession } from "@/lib/auth/professor";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ThemeProvider } from "@/lib/theme";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const lectureId = "11111111-1111-4111-8111-111111111111";
const insightId = "22222222-2222-4222-8222-222222222222";
const lecturePath = `/api/v1/lectures/${lectureId}`;
const insightPath = `${lecturePath}/insights/${insightId}`;
const accessToken = "test-professor-access-token";
const label = (key: string) => dictionaries.en[key] ?? key;

function lectureFixture(): Lecture {
  const earlier = new Date(Date.now() - 3_600_000).toISOString();
  return {
    lecture_id: lectureId,
    course_id: "33333333-3333-4333-8333-333333333333",
    course_title: "Mechanics",
    title: "Forces and motion",
    language: "en",
    status: "ended",
    join_code: "ABC123",
    join_url: "http://localhost:3000/join/ABC123",
    started_at: earlier,
    ended_at: new Date().toISOString(),
    offset_ms: 3_600_000,
    accepted_signals: 8,
    unique_participants: 5,
    created_at: earlier,
  };
}

function insightFixture(overrides: Partial<Insight> = {}): Insight {
  const now = new Date().toISOString();
  const kind = overrides.kind ?? "brief_next";
  return {
    insight_id: insightId,
    lecture_id: lectureId,
    kind,
    audience: kind === "handoff" ? "seminar_leader" : "professor",
    status: "pending_approval",
    source: "manual",
    content: {
      headline: "Review the force diagram",
      read_time_sec: 30,
      concepts: [{ title: "Net force", detail: "Resolve the components." }],
      task: kind === "handoff" ? {
        title: "Draw a free-body diagram",
        instructions: "Label the forces before applying Newton's second law.",
        duration_minutes: 10,
      } : null,
    },
    decision_reason: null,
    created_at: now,
    updated_at: now,
    decided_at: null,
    ...overrides,
  };
}

function generatedFixture(kind: Insight["kind"] = "brief_next", source: Insight["source"] = "template"): Insight {
  const insight = insightFixture({ kind, source });
  const citation = {
    segment_id: "66666666-6666-4666-8666-666666666666",
    start_ms: 60_000,
    end_ms: 75_000,
    quote: "<img src=x onerror=alert(1)> Net force determines acceleration.",
  };
  return {
    ...insight,
    content: {
      ...insight.content,
      concepts: [{ title: "Net force", detail: "Revisit the force diagram.", citations: [citation], window_start_ms: 50_000, window_end_ms: 80_000, unique_signals: 0 }],
      task: insight.content.task ? { ...insight.content.task, grounded_in: [citation] } : null,
    },
  };
}

const generateLabel = (kind = "brief_next") => label("brief.generate").replace("{kind}", label(`insight.kind.${kind}`));

function linkFixture(): HandoffLink {
  return {
    insight_id: insightId,
    handoff_url: `https://classroom.example/handoff#token=${"a".repeat(43)}`,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function failure(status: number, code: string): Response {
  return json({ error: { code, message: "The request could not be completed.", request_id: "test-request" } }, status);
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

type Override = (url: URL, options: RequestInit) => Response | Promise<Response> | undefined;

/** Only the transport is mocked: the production API client serializes and parses every request. */
function mockApi(insights: () => Insight[], override?: Override) {
  const transport = vi.fn<typeof fetch>(async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const custom = override?.(url, options);
    if (custom !== undefined) return custom;
    if ((options.method ?? "GET") === "GET" && url.pathname === lecturePath) return json(lectureFixture());
    if ((options.method ?? "GET") === "GET" && url.pathname === `${lecturePath}/insights`) return json(insights());
    return failure(404, "NOT_FOUND");
  });
  vi.stubGlobal("fetch", transport);
  return transport;
}

function signIn(token = accessToken) {
  saveProfessorSession({
    accessToken: token,
    professorId: "44444444-4444-4444-8444-444444444444",
    name: "Test Professor",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
}

function view(id = lectureId) {
  return <I18nProvider><ThemeProvider><BriefScreen lectureId={id} /></ThemeProvider></I18nProvider>;
}

function renderBrief() {
  return render(view());
}

async function submitDraft(headline = "Old account draft") {
  fireEvent.click(await screen.findByRole("button", { name: label("brief.new") }));
  const editor = within(screen.getByRole("dialog", { name: label("insight.createTitle") }));
  fireEvent.change(editor.getByRole("textbox", { name: label("insight.headline") }), { target: { value: headline } });
  fireEvent.click(editor.getByRole("button", { name: label("insight.create") }));
}

function selectHandoff() {
  const escaped = label("insight.kind.handoff").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${escaped}`) }));
}

function card() {
  return within(screen.getByTestId(`insight-${insightId}`));
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("daris.locale", "en");
  navigation.replace.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  // jsdom does not implement modal dialog methods; keep the actual Dialog component.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("BriefScreen", () => {
  it.each([
    ["brief_next", "template"],
    ["brief_next", "prebaked"],
    ["handoff", "live"],
  ] as const)("generates %s with honest %s provenance and evidence, pending explicit approval", async (kind, source) => {
    signIn();
    const generated = generatedFixture(kind, source);
    const pending = deferredResponse();
    const transport = mockApi(() => [], (url, options) => options.method === "POST" && url.pathname === `${lecturePath}/insights/generate` ? pending.promise : undefined);
    renderBrief();
    await screen.findByRole("button", { name: label("brief.new") });
    if (kind === "handoff") selectHandoff();
    const button = screen.getByRole("button", { name: generateLabel(kind) });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: label("brief.new") })).toBeDisabled();
    await act(async () => pending.resolve(json({ insight: generated, source, selection: "persisted_clusters=1; selected=1" })));
    expect(await screen.findByText(label("brief.generated"))).toBeInTheDocument();
    expect(card().getByText(label(`insight.source.${source}`))).toBeInTheDocument();
    expect(card().getByText(label("insight.status.pending_approval"))).toBeInTheDocument();
    expect(card().getByRole("button", { name: label("insight.approve") })).toBeEnabled();
    expect(card().queryByRole("button", { name: label("insight.publish") })).not.toBeInTheDocument();
    const disclosures = card().getAllByText(label("insight.evidence"));
    disclosures.forEach((disclosure) => fireEvent.click(disclosure));
    expect(card().getAllByText(generated.content.concepts![0]!.citations![0]!.quote)).toHaveLength(kind === "handoff" ? 2 : 1);
    expect(card().getAllByText(label("insight.evidenceTime").replace("{start}", "01:00").replace("{end}", "01:15"))).toHaveLength(kind === "handoff" ? 2 : 1);
    expect(card().getByText(label("insight.signalWindow").replace("{start}", "00:50").replace("{end}", "01:20"))).toBeInTheDocument();
    expect(card().getByText(label("insight.uniqueSignals").replace("{count}", "0"))).toBeInTheDocument();
    expect(card().getByText(label("insight.signalCaution"))).toBeInTheDocument();
    expect(screen.getByTestId(`insight-${insightId}`).querySelector("img")).toBeNull();
    expect(screen.queryByText("persisted_clusters=1; selected=1")).not.toBeInTheDocument();
    const mutations = transport.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(mutations).toHaveLength(1);
    expect(new URL(String(mutations[0]![0])).pathname).toBe(`${lecturePath}/insights/generate`);
    expect(JSON.parse(String(mutations[0]![1]?.body))).toEqual({ kind, max_concepts: 3 });
    expect(new Headers(mutations[0]![1]?.headers).get("Authorization")).toBe(`Bearer ${accessToken}`);
    expect(mutations[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [409, "INSUFFICIENT_EVIDENCE", "brief.insufficientEvidence"],
    [409, "LECTURE_NOT_ENDED", "brief.notEnded"],
    [429, "AI_BUDGET_EXHAUSTED", "brief.generationLimit"],
  ] as const)("explains generation rejection %s/%s and keeps manual authoring available", async (status, code, key) => {
    signIn();
    const transport = mockApi(() => [], (_url, options) => options.method === "POST" ? failure(status, code) : undefined);
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: generateLabel() }));
    expect(await within(screen.getByRole("main")).findByText(label(key))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: label("brief.new") })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: label("brief.new") }));
    expect(screen.getByRole("dialog", { name: label("insight.createTitle") })).toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it("waits for the lecture to end before generation while allowing a manual draft", async () => {
    signIn();
    const transport = mockApi(() => [], (url) => url.pathname === lecturePath ? json({ ...lectureFixture(), status: "live" }) : undefined);
    renderBrief();
    const generate = await screen.findByRole("button", { name: generateLabel() });
    expect(generate).toBeDisabled();
    fireEvent.click(generate);
    expect(screen.getByText(label("brief.notEnded"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label("brief.new") })).toBeEnabled();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });

  it("reconciles generation saved before a lost response without generating it twice", async () => {
    signIn();
    const generated = generatedFixture();
    let stored = false;
    const transport = mockApi(() => stored ? [generated] : [], (url, options) => {
      if (options.method === "POST" && url.pathname.endsWith("/generate")) { stored = true; return failure(501, "RESPONSE_LOST"); }
    });
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: generateLabel() }));
    expect(await screen.findByText(label("brief.resolved"))).toBeInTheDocument();
    expect(card().getByText(label("insight.status.pending_approval"))).toBeInTheDocument();
    expect(screen.queryByText(label("brief.generated"))).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it("preserves transcript evidence and measured metadata when editing generated material", async () => {
    signIn();
    const generated = generatedFixture("handoff");
    const transport = mockApi(() => [generated], (url, options) => {
      if (options.method === "POST" && url.pathname.endsWith("/edit")) {
        const body = JSON.parse(String(options.body)) as { content: Insight["content"] };
        return json({ ...generated, content: body.content, status: "edited" });
      }
    });
    renderBrief();
    await screen.findByText("Forces and motion");
    selectHandoff();
    fireEvent.click(card().getByRole("button", { name: label("insight.edit") }));
    const editor = within(screen.getByRole("dialog", { name: label("insight.editTitle") }));
    expect(editor.getByText(label("insight.editEvidenceNotice"))).toBeInTheDocument();
    fireEvent.change(editor.getByRole("textbox", { name: `${label("insight.conceptDetail")} 1` }), { target: { value: "  Clarify the diagram before calculation.  " } });
    fireEvent.change(editor.getByRole("textbox", { name: label("insight.reason") }), { target: { value: "Clarify the task" } });
    fireEvent.click(editor.getByRole("button", { name: label("insight.save") }));
    expect(await screen.findByText(label("brief.updated"))).toBeInTheDocument();
    const mutation = transport.mock.calls.find(([, options]) => options?.method === "POST");
    const body = JSON.parse(String(mutation?.[1]?.body)) as { content: Insight["content"] };
    expect(body.content.concepts?.[0]).toEqual({ ...generated.content.concepts![0], detail: "Clarify the diagram before calculation." });
    expect(body.content.task?.grounded_in).toEqual(generated.content.task?.grounded_in);
    expect(card().getByText(label("insight.status.edited"))).toBeInTheDocument();
    expect(card().queryByRole("button", { name: label("insight.publish") })).not.toBeInTheDocument();
  });

  it.each(["read", "write"])("preserves a new login when an old %s returns 401 without a storage event", async (phase) => {
    signIn();
    const pending = deferredResponse();
    let firstRead = true;
    const transport = mockApi(() => [insightFixture()], (url, options) => {
      if (phase === "read" && url.pathname === `${lecturePath}/insights` && firstRead) { firstRead = false; return pending.promise; }
      if (phase === "write" && options.method === "POST") return pending.promise;
    });
    renderBrief();
    if (phase === "write") await submitDraft();
    signIn("new-account-token");
    await act(async () => pending.resolve(failure(401, "UNAUTHORIZED")));
    expect(await screen.findByText("Review the force diagram")).toBeInTheDocument();
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([url, options]) => options?.method === "GET" && new URL(String(url)).pathname.endsWith("/insights"))).toHaveLength(2);
  });

  it.each(["read", "create", "publish"])("discards an old successful %s response after a silent account change", async (phase) => {
    signIn();
    const pending = deferredResponse();
    const oldMaterial = insightFixture({ kind: phase === "publish" ? "handoff" : "brief_next", status: "approved" });
    const nextMaterial = { ...oldMaterial, content: { ...oldMaterial.content, headline: "New account material" } };
    const transport = mockApi(() => [], (url, options) => {
      const token = new Headers(options.headers).get("Authorization");
      if (options.method === "GET" && url.pathname === `${lecturePath}/insights`) {
        if (token === "Bearer new-account-token") return json([nextMaterial]);
        return phase === "read" ? pending.promise : json(phase === "publish" ? [oldMaterial] : []);
      }
      if (options.method === "POST") return pending.promise;
    });
    renderBrief();
    if (phase === "create") await submitDraft();
    if (phase === "publish") {
      await screen.findByText("Forces and motion");
      selectHandoff();
      fireEvent.click(card().getByRole("button", { name: label("insight.publish") }));
    }
    signIn("new-account-token");
    await act(async () => pending.resolve(json(phase === "read" ? [oldMaterial] : phase === "publish" ? linkFixture() : oldMaterial)));
    expect(await screen.findByText("New account material")).toBeInTheDocument();
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: label("brief.link") })).not.toBeInTheDocument();
    expect(screen.queryByText(label(phase === "publish" ? "brief.published" : "brief.saved"))).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
    expect(transport.mock.calls.filter(([url, options]) => options?.method === "GET" && new URL(String(url)).pathname.endsWith("/insights"))).toHaveLength(2);
  });

  it("discards an old draft without submitting it with a newly signed-in account", async () => {
    signIn();
    const transport = mockApi(() => []);
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: label("brief.new") }));
    const editor = within(screen.getByRole("dialog", { name: label("insight.createTitle") }));
    fireEvent.change(editor.getByRole("textbox", { name: label("insight.headline") }), { target: { value: "Previous professor's draft" } });
    signIn("new-account-token");
    fireEvent.click(editor.getByRole("button", { name: label("insight.create") }));
    await waitFor(() => expect(screen.getByRole("button", { name: label("brief.new") })).toBeEnabled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
  });

  it.each(["daris.professor.session", null])("clears links and drafts and aborts a pending edit on cross-tab logout (%s)", async (key) => {
    signIn();
    const pending = deferredResponse();
    const material = insightFixture({ kind: "handoff", status: "published" });
    const transport = mockApi(() => [material], (url, options) => {
      if (options.method === "POST" && url.pathname.endsWith("/publish")) return json(linkFixture());
      if (options.method === "POST" && url.pathname.endsWith("/edit")) return pending.promise;
    });
    renderBrief();
    await screen.findByText("Forces and motion");
    selectHandoff();
    fireEvent.click(card().getByRole("button", { name: label("brief.createLink") }));
    expect(await screen.findByRole("textbox", { name: label("brief.link") })).toHaveValue(linkFixture().handoff_url);
    fireEvent.click(card().getByRole("button", { name: label("insight.edit") }));
    const editor = within(screen.getByRole("dialog", { name: label("insight.editTitle") }));
    fireEvent.change(editor.getByRole("textbox", { name: label("insight.reason") }), { target: { value: "Clarify this example" } });
    fireEvent.click(editor.getByRole("button", { name: label("insight.save") }));
    const mutationSignal = transport.mock.calls.find(([url]) => String(url).endsWith("/edit"))?.[1]?.signal;
    window.localStorage.removeItem("daris.professor.session");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
    expect(mutationSignal?.aborted).toBe(true);
    expect(screen.queryByRole("textbox", { name: label("brief.link") })).not.toBeInTheDocument();
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith("/login");
    await act(async () => pending.resolve(json({ ...material, status: "edited" })));
    expect(screen.queryByText(label("brief.updated"))).not.toBeInTheDocument();
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();
  });

  it("aborts an old read and reloads when another tab changes accounts", async () => {
    signIn();
    const pending = deferredResponse();
    const nextRead = deferredResponse();
    const transport = mockApi(() => [], (url, options) => {
      if (url.pathname !== `${lecturePath}/insights`) return undefined;
      return new Headers(options.headers).get("Authorization") === `Bearer ${accessToken}` ? pending.promise : nextRead.promise;
    });
    renderBrief();
    const previousSignal = transport.mock.calls.find(([url]) => new URL(String(url)).pathname.endsWith("/insights"))?.[1]?.signal;
    signIn("new-account-token");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "daris.professor.session" })));
    expect(previousSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(failure(401, "UNAUTHORIZED")));
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
    expect(navigation.replace).not.toHaveBeenCalled();
    const material = insightFixture();
    await act(async () => nextRead.resolve(json([{ ...material, content: { ...material.content, headline: "New account material" } }])));
    expect(await screen.findByText("New account material")).toBeInTheDocument();
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();
  });

  it("aborts a pending creation on unmount and ignores its late unauthorized response", async () => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => [], (_url, options) => options.method === "POST" ? pending.promise : undefined);
    const rendered = renderBrief();
    await submitDraft();
    const mutationSignal = transport.mock.calls.find(([, options]) => options?.method === "POST")?.[1]?.signal;
    rendered.unmount();
    expect(mutationSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(failure(401, "UNAUTHORIZED")));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(getProfessorSession()?.accessToken).toBe(accessToken);
  });

  it.each(["read", "write"])("isolates a new lecture from a previous lecture's pending %s", async (phase) => {
    signIn();
    const pending = deferredResponse();
    const newId = "55555555-5555-4555-8555-555555555555";
    const transport = mockApi(() => [], (url, options) => {
      if (url.pathname === `/api/v1/lectures/${newId}`) return json({ ...lectureFixture(), lecture_id: newId, title: "New lecture" });
      if (url.pathname === `/api/v1/lectures/${newId}/insights`) return json([]);
      if (phase === "read" && url.pathname === `${lecturePath}/insights`) return pending.promise;
      if (phase === "write" && options.method === "POST") return pending.promise;
    });
    const rendered = renderBrief();
    if (phase === "write") await submitDraft();
    const oldSignal = transport.mock.calls.find(([url, options]) => phase === "write" ? options?.method === "POST" : new URL(String(url)).pathname.endsWith("/insights"))?.[1]?.signal;
    rendered.rerender(view(newId));
    expect(await screen.findByText("New lecture")).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(phase === "read" ? json([insightFixture()]) : failure(401, "UNAUTHORIZED")));
    expect(screen.getByText("New lecture")).toBeInTheDocument();
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(getProfessorSession()?.accessToken).toBe(accessToken);
  });

  it("does not show reconciliation success from a mutation belonging to an old account", async () => {
    signIn();
    const pending = deferredResponse();
    let mutationStarted = false;
    mockApi(() => [], (url, options) => {
      if (options.method === "POST") { mutationStarted = true; return failure(503, "RESPONSE_LOST"); }
      if (url.pathname === `${lecturePath}/insights` && mutationStarted && new Headers(options.headers).get("Authorization") === `Bearer ${accessToken}`) return pending.promise;
    });
    renderBrief();
    await submitDraft();
    await within(screen.getByRole("main")).findByText(label("brief.uncertain"));
    signIn("new-account-token");
    await act(async () => pending.resolve(json([insightFixture()])));
    await waitFor(() => expect(screen.getByRole("button", { name: label("brief.new") })).toBeEnabled());
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();
    expect(screen.queryByText(label("brief.resolved"))).not.toBeInTheDocument();
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
  });

  it.each(["network", "server", "malformed", "unknown"])("reconciles an uncertain %s creation without retaining or replaying the draft", async (outcome) => {
    signIn();
    let created: Insight | null = null;
    const reconciliation = deferredResponse();
    const transport = mockApi(() => [], (url, options) => {
      if (options.method === "POST" && url.pathname === `${lecturePath}/insights`) {
        const body = JSON.parse(String(options.body)) as { content: Insight["content"] };
        created = insightFixture({ content: body.content });
        if (outcome === "network") return Promise.reject(new TypeError("Response lost"));
        if (outcome === "server") return failure(501, "UPSTREAM_ERROR");
        if (outcome === "malformed") return new Response("truncated JSON", { status: 201 });
        return json(null, 201);
      }
      if (options.method === "GET" && url.pathname === `${lecturePath}/insights` && created) return reconciliation.promise;
    });
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: label("brief.new") }));
    const editor = within(screen.getByRole("dialog", { name: label("insight.createTitle") }));
    fireEvent.change(editor.getByRole("textbox", { name: label("insight.headline") }), { target: { value: "Saved despite lost response" } });
    fireEvent.click(editor.getByRole("button", { name: label("insight.create") }));

    expect(await within(screen.getByRole("main")).findByText(label("brief.uncertain"))).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: label("insight.createTitle") })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("button", { name: label("brief.new") })).not.toBeInTheDocument());
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    await act(async () => reconciliation.resolve(json([created])));

    expect(await screen.findByText("Saved despite lost response")).toBeInTheDocument();
    expect(screen.getByText(label("brief.resolved"))).toBeInTheDocument();
    expect(transport.mock.calls.filter(([url, options]) => options?.method === "GET" && new URL(String(url)).pathname === `${lecturePath}/insights`)).toHaveLength(2);
    // A new creation is a deliberate fresh draft, not a retry of the saved one.
    fireEvent.click(screen.getByRole("button", { name: label("brief.new") }));
    expect(within(screen.getByRole("dialog", { name: label("insight.createTitle") })).getByRole("textbox", { name: label("insight.headline") })).toHaveValue("");
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it("blocks publication after failed reconciliation until a manual refresh confirms server state", async () => {
    signIn();
    let current = insightFixture({ kind: "handoff", status: "approved" });
    let failedPublish = false;
    let reconciliationReads = 0;
    const transport = mockApi(() => [current], (url, options) => {
      if (options.method === "POST" && url.pathname === `${insightPath}/publish`) {
        current = { ...current, status: "published" };
        failedPublish = true;
        return failure(503, "RESPONSE_LOST");
      }
      if (options.method === "GET" && url.pathname === `${lecturePath}/insights` && failedPublish) {
        reconciliationReads += 1;
        if (reconciliationReads === 1) return failure(503, "UNAVAILABLE");
      }
    });
    renderBrief();
    await screen.findByText("Forces and motion");
    selectHandoff();
    fireEvent.click(card().getByRole("button", { name: label("insight.publish") }));
    const retry = await screen.findByRole("button", { name: label("brief.retry") });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(within(screen.getByRole("main")).getByText(label("brief.uncertain"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: label("brief.new") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: label("insight.publish") })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: label("brief.link") })).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);

    fireEvent.click(retry);
    expect(await screen.findByText(label("brief.resolved"))).toBeInTheDocument();
    expect(card().getByText(label("insight.status.published"))).toBeInTheDocument();
    expect(card().getByRole("button", { name: label("brief.createLink") })).toBeEnabled();
    expect(screen.queryByText(label("brief.uncertain"))).not.toBeInTheDocument();
    expect(reconciliationReads).toBe(2);
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it.each(["edit", "reject"])("closes an uncertain %s dialog and shows the reconciled material", async (action) => {
    signIn();
    let current = insightFixture();
    const transport = mockApi(() => [current], (url, options) => {
      if (options.method === "POST" && url.pathname === `${insightPath}/${action}`) {
        current = { ...current, status: action === "edit" ? "edited" : "rejected", decision_reason: "Clarify this example." };
        return failure(503, "RESPONSE_LOST");
      }
    });
    renderBrief();
    await screen.findByText("Review the force diagram");
    fireEvent.click(card().getByRole("button", { name: label(`insight.${action}`) }));
    const dialogTitle = label(action === "edit" ? "insight.editTitle" : "insight.rejectTitle");
    const editor = within(screen.getByRole("dialog", { name: dialogTitle }));
    fireEvent.change(editor.getByRole("textbox", { name: label("insight.reason") }), { target: { value: "Clarify this example." } });
    fireEvent.click(editor.getByRole("button", { name: label(action === "edit" ? "insight.save" : "insight.confirmReject") }));
    expect(await screen.findByText(label("brief.resolved"))).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: dialogTitle })).not.toBeInTheDocument();
    expect(card().getByText(label(action === "edit" ? "insight.status.edited" : "insight.status.rejected"))).toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it("preserves a draft after a known validation rejection without unnecessary reconciliation", async () => {
    signIn();
    const transport = mockApi(() => [], (_url, options) => options.method === "POST" ? failure(422, "VALIDATION_ERROR") : undefined);
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: label("brief.new") }));
    const editor = within(screen.getByRole("dialog", { name: label("insight.createTitle") }));
    fireEvent.change(editor.getByRole("textbox", { name: label("insight.headline") }), { target: { value: "Keep this draft" } });
    fireEvent.click(editor.getByRole("button", { name: label("insight.create") }));
    expect(await editor.findByRole("alert")).toHaveTextContent(label("insight.validation"));
    expect(editor.getByRole("textbox", { name: label("insight.headline") })).toHaveValue("Keep this draft");
    expect(screen.queryByText(label("brief.uncertain"))).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([url, options]) => options?.method === "GET" && new URL(String(url)).pathname === `${lecturePath}/insights`)).toHaveLength(1);
  });

  it("redirects to login without requesting protected content when no professor session exists", async () => {
    const transport = mockApi(() => []);
    renderBrief();

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(transport).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`insight-${insightId}`)).not.toBeInTheDocument();
  });

  it("clears an expired server session and redirects instead of exposing protected content", async () => {
    signIn();
    mockApi(() => [insightFixture()], () => failure(401, "UNAUTHORIZED"));
    renderBrief();

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(getProfessorSession()).toBeNull();
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();
  });

  it("shows loading, reports an initial failure, and retries the real read requests", async () => {
    signIn();
    const pending = deferredResponse();
    let firstRead = true;
    const transport = mockApi(() => [insightFixture()], (url) => {
      if (url.pathname === `${lecturePath}/insights` && firstRead) {
        firstRead = false;
        return pending.promise;
      }
    });
    renderBrief();
    expect(screen.getByRole("status", { name: label("brief.loading") })).toBeInTheDocument();
    expect(screen.queryByText("Review the force diagram")).not.toBeInTheDocument();

    await act(async () => pending.resolve(failure(503, "SERVICE_UNAVAILABLE")));
    fireEvent.click(await screen.findByRole("button", { name: label("brief.retry") }));

    expect(await screen.findByText("Review the force diagram")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: label("brief.loading") })).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([url]) => String(url).includes("/insights"))).toHaveLength(2);
    expect(transport.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
    });
  });

  it("labels manual BriefNext content and never offers publication even after approval", async () => {
    signIn();
    mockApi(() => [insightFixture({ status: "approved" })]);
    renderBrief();

    await screen.findByText("Review the force diagram");
    expect(card().getByText(label("insight.source.manual"))).toBeInTheDocument();
    expect(card().getByRole("button", { name: label("insight.edit") })).toBeEnabled();
    expect(card().getByRole("button", { name: label("insight.reject") })).toBeEnabled();
    expect(card().queryByRole("button", { name: label("insight.publish") })).not.toBeInTheDocument();
    expect(card().queryByRole("button", { name: label("brief.createLink") })).not.toBeInTheDocument();
  });

  it("requires Handoff approval before publishing and displays the server-issued capability link", async () => {
    signIn();
    let current = insightFixture({ kind: "handoff" });
    const link = linkFixture();
    const transport = mockApi(() => [current], (url, options) => {
      if (options.method === "POST" && url.pathname === `${insightPath}/approve`) {
        current = { ...current, status: "approved" };
        return json(current);
      }
      if (options.method === "POST" && url.pathname === `${insightPath}/publish`) return json(link);
    });
    renderBrief();
    await screen.findByText("Forces and motion");
    selectHandoff();
    expect(card().queryByRole("button", { name: label("insight.publish") })).not.toBeInTheDocument();
    fireEvent.click(card().getByRole("button", { name: label("insight.approve") }));
    fireEvent.click(await screen.findByRole("button", { name: label("insight.publish") }));

    expect(await screen.findByRole("textbox", { name: label("brief.link") })).toHaveValue(link.handoff_url);
    expect(card().getByText(label("insight.status.published"))).toBeInTheDocument();
    expect(card().getByRole("link", { name: label("insight.view") })).toHaveAttribute("href", link.handoff_url);
    const mutations = transport.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(mutations.map(([url]) => new URL(String(url)).pathname)).toEqual([
      `${insightPath}/approve`, `${insightPath}/publish`,
    ]);
    for (const [, options] of mutations) {
      expect(options).toMatchObject({ headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      expect(options?.body).toBeUndefined();
    }
  });

  it("requires a nonblank edit reason, removes the old link, and requires reapproval", async () => {
    signIn();
    let current = insightFixture({ kind: "handoff", status: "published" });
    const link = linkFixture();
    const transport = mockApi(() => [current], (url, options) => {
      if (options.method === "POST" && url.pathname === `${insightPath}/publish`) return json(link);
      if (options.method === "POST" && url.pathname === `${insightPath}/edit`) {
        const body = JSON.parse(String(options.body)) as { content: Insight["content"]; reason: string };
        current = { ...current, content: body.content, decision_reason: body.reason, status: "edited" };
        return json(current);
      }
    });
    renderBrief();
    await screen.findByText("Forces and motion");
    selectHandoff();
    fireEvent.click(card().getByRole("button", { name: label("brief.createLink") }));
    await screen.findByRole("textbox", { name: label("brief.link") });
    fireEvent.click(card().getByRole("button", { name: label("insight.edit") }));
    const dialog = within(screen.getByRole("dialog", { name: label("insight.editTitle") }));
    const reason = dialog.getByRole("textbox", { name: label("insight.reason") });
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.click(dialog.getByRole("button", { name: label("insight.save") }));
    expect(dialog.getByRole("alert")).toHaveTextContent(label("insight.validation"));
    expect(transport.mock.calls.filter(([url]) => String(url).endsWith("/edit"))).toHaveLength(0);

    fireEvent.change(reason, { target: { value: "  Corrected the exercise.  " } });
    fireEvent.click(dialog.getByRole("button", { name: label("insight.save") }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: label("insight.editTitle") })).not.toBeInTheDocument());
    expect(card().getByText(label("insight.status.edited"))).toBeInTheDocument();
    expect(card().getByRole("button", { name: label("insight.approve") })).toBeEnabled();
    expect(card().queryByRole("textbox", { name: label("brief.link") })).not.toBeInTheDocument();
    expect(card().queryByRole("button", { name: label("insight.publish") })).not.toBeInTheDocument();
    expect(card().queryByRole("button", { name: label("brief.createLink") })).not.toBeInTheDocument();
    const edits = transport.mock.calls.filter(([url]) => String(url).endsWith("/edit"));
    expect(edits).toHaveLength(1);
    expect(JSON.parse(String(edits[0]?.[1]?.body))).toEqual({ content: current.content, reason: "Corrected the exercise." });
  });

  it("discards a saved capability after refreshing a Handoff edited and republished elsewhere", async () => {
    signIn();
    let current = insightFixture({ kind: "handoff", status: "approved" });
    const link = linkFixture();
    mockApi(() => [current], (url, options) => {
      if (options.method === "POST" && url.pathname === `${insightPath}/publish`) return json(link);
    });
    renderBrief();
    await screen.findByText("Forces and motion");
    selectHandoff();
    fireEvent.click(card().getByRole("button", { name: label("insight.publish") }));
    expect(await screen.findByRole("textbox", { name: label("brief.link") })).toHaveValue(link.handoff_url);

    // Another tab edited the content (revoking the old capability), then approved
    // and republished it. Published status alone cannot validate the saved URL.
    current = {
      ...current,
      status: "published",
      updated_at: new Date(Date.now() + 1000).toISOString(),
      content: { ...current.content, headline: "Updated exercise from another session" },
    };
    fireEvent.click(screen.getByRole("button", { name: label("insight.refresh") }));

    await screen.findByText("Updated exercise from another session");
    expect(card().getByText(label("insight.status.published"))).toBeInTheDocument();
    expect(card().queryByRole("textbox", { name: label("brief.link") })).not.toBeInTheDocument();
    expect(card().queryByRole("link", { name: label("insight.view") })).not.toBeInTheDocument();
    expect(card().getByRole("button", { name: label("brief.createLink") })).toBeEnabled();
  });

  it("creates a manual draft through the API and requires a reason to reject it", async () => {
    signIn();
    let current: Insight | null = null;
    const transport = mockApi(() => current ? [current] : [], (url, options) => {
      if (options.method === "POST" && url.pathname === `${lecturePath}/insights`) {
        const body = JSON.parse(String(options.body)) as { kind: Insight["kind"]; content: Insight["content"] };
        current = insightFixture({ kind: body.kind, content: body.content });
        return json(current, 201);
      }
      if (options.method === "POST" && url.pathname === `${insightPath}/reject` && current) {
        const body = JSON.parse(String(options.body)) as { reason: string };
        current = { ...current, status: "rejected", decision_reason: body.reason };
        return json(current);
      }
    });
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: label("brief.new") }));
    const createDialog = within(screen.getByRole("dialog", { name: label("insight.createTitle") }));
    fireEvent.change(createDialog.getByRole("textbox", { name: label("insight.headline") }), {
      target: { value: "  A clearer opening  " },
    });
    fireEvent.click(createDialog.getByRole("button", { name: label("insight.create") }));

    await screen.findByText("A clearer opening");
    expect(card().getByText(label("insight.status.pending_approval"))).toBeInTheDocument();
    expect(card().getByText(label("insight.source.manual"))).toBeInTheDocument();
    const creates = transport.mock.calls.filter(([url, options]) =>
      options?.method === "POST" && new URL(String(url)).pathname === `${lecturePath}/insights`,
    );
    expect(creates).toHaveLength(1);
    expect(JSON.parse(String(creates[0]?.[1]?.body))).toEqual({
      kind: "brief_next",
      content: { headline: "A clearer opening", read_time_sec: 20, concepts: [], task: null },
    });

    fireEvent.click(card().getByRole("button", { name: label("insight.reject") }));
    const rejectDialog = within(screen.getByRole("dialog", { name: label("insight.rejectTitle") }));
    const reason = rejectDialog.getByRole("textbox", { name: label("insight.reason") });
    const confirm = rejectDialog.getByRole("button", { name: label("insight.confirmReject") });
    fireEvent.change(reason, { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(transport.mock.calls.filter(([url]) => String(url).endsWith("/reject"))).toHaveLength(0);
    fireEvent.change(reason, { target: { value: "  Needs a different example.  " } });
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: label("insight.rejectTitle") })).not.toBeInTheDocument());
    expect(card().getByText(label("insight.status.rejected"))).toBeInTheDocument();
    expect(card().getByText("Needs a different example.")).toBeInTheDocument();
    expect(card().queryAllByRole("button")).toHaveLength(0);
    const rejects = transport.mock.calls.filter(([url]) => String(url).endsWith("/reject"));
    expect(rejects).toHaveLength(1);
    expect(JSON.parse(String(rejects[0]?.[1]?.body))).toEqual({ reason: "Needs a different example." });
  });

  it("shows the recorded rejection reason without offering any further workflow action", async () => {
    signIn();
    mockApi(() => [insightFixture({ status: "rejected", decision_reason: "Needs a different example." })]);
    renderBrief();

    await screen.findByText("Review the force diagram");
    expect(card().getByText("Needs a different example.")).toBeInTheDocument();
    expect(card().getByText(label("insight.status.rejected"))).toBeInTheDocument();
    expect(card().queryAllByRole("button")).toHaveLength(0);
  });

  it("reloads on a 409 conflict and does not replay or double-submit the mutation", async () => {
    signIn();
    let current = insightFixture({ kind: "handoff" });
    const pending = deferredResponse();
    const transport = mockApi(() => [current], (url, options) => {
      if (options.method === "POST" && url.pathname === `${insightPath}/approve`) return pending.promise;
    });
    renderBrief();
    await screen.findByText("Forces and motion");
    selectHandoff();
    const approve = card().getByRole("button", { name: label("insight.approve") });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(approve).toBeDisabled();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);

    current = { ...current, status: "approved" };
    await act(async () => pending.resolve(failure(409, "INSIGHT_STATE_CONFLICT")));
    expect(await screen.findByRole("button", { name: label("insight.publish") })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(label("brief.conflict"));
    expect(card().queryByRole("button", { name: label("insight.approve") })).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(transport.mock.calls.filter(([url, options]) =>
      options?.method === "GET" && new URL(String(url)).pathname === `${lecturePath}/insights`,
    )).toHaveLength(2);
  });

  it("shows the server decision trail and revokes a published Handoff link without claiming a new status", async () => {
    signIn();
    const published = insightFixture({ kind: "handoff", status: "published", source: "template" });
    const decisionsPath = `${insightPath}/decisions`;
    const publishPath = `${insightPath}/publish`;
    const revokePath = `${insightPath}/handoff/revoke`;
    const decision = {
      decision_id: "55555555-5555-4555-8555-555555555555",
      insight_id: insightId,
      action: "publish" as const,
      from_status: "approved",
      to_status: "published",
      reason: null,
      concept_canonical_id: null,
      created_at: new Date().toISOString(),
    };
    const transport = mockApi(() => [published], (url, options) => {
      if ((options.method ?? "GET") === "GET" && url.pathname === decisionsPath) return json([decision]);
      if (options.method === "POST" && url.pathname === publishPath) return json(linkFixture());
      if (options.method === "POST" && url.pathname === revokePath) {
        return json({ insight_id: insightId, revoked: 1, status: "published" });
      }
      return undefined;
    });
    renderBrief();
    await screen.findByRole("button", { name: label("brief.new") });
    selectHandoff();
    fireEvent.click(await screen.findByRole("button", { name: label("brief.decisionHistory") }));
    const historyDialog = within(await screen.findByRole("dialog", { name: label("brief.decisionHistory") }));
    expect(historyDialog.getByText(label("insight.decision.publish"))).toBeInTheDocument();
    expect(historyDialog.getByText(label("brief.decisionTransition").replace("{from}", label("insight.status.approved")).replace("{to}", label("insight.status.published")))).toBeInTheDocument();
    const closeButtons = historyDialog.getAllByRole("button", { name: label("common.close") });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    fireEvent.click(await screen.findByRole("button", { name: label("brief.createLink") }));
    expect(await screen.findByText(label("brief.published"))).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: label("brief.revokeLink") }));
    const revokeDialog = within(await screen.findByRole("dialog", { name: label("brief.revokeLinkTitle") }));
    fireEvent.change(revokeDialog.getByRole("textbox", { name: label("insight.reason") }), { target: { value: "Link leaked" } });
    fireEvent.click(revokeDialog.getByRole("button", { name: label("brief.confirmRevoke") }));
    expect((await screen.findAllByText(label("brief.revoked"))).length).toBeGreaterThan(0);
    expect(card().getByText(label("insight.linkRevoked"))).toBeInTheDocument();
    expect(card().queryByRole("button", { name: label("brief.revokeLink") })).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2);
    expect(transport.mock.calls.some(([url, options]) => options?.method === "POST" && new URL(String(url)).pathname === revokePath)).toBe(true);
  });
});
