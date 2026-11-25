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

function signIn() {
  saveProfessorSession({
    accessToken,
    professorId: "44444444-4444-4444-8444-444444444444",
    name: "Test Professor",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
}

function renderBrief() {
  return render(<I18nProvider><ThemeProvider><BriefScreen lectureId={lectureId} /></ThemeProvider></I18nProvider>);
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
});
