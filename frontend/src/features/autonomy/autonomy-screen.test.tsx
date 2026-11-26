import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutonomyScreen } from "@/features/autonomy/autonomy-screen";
import type { ConceptAutonomy, Lecture } from "@/lib/api/client";
import { getProfessorSession, saveProfessorSession } from "@/lib/auth/professor";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ThemeProvider } from "@/lib/theme";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const lectureId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const conceptId = "33333333-3333-4333-8333-333333333333";
const lecturePath = `/api/v1/lectures/${lectureId}`;
const listPath = `${lecturePath}/concept-autonomy`;
const policyPath = `${listPath}/${conceptId}`;
const accessToken = "test-autonomy-professor-token";
const label = (key: string) => dictionaries.en[key] ?? key;

function lectureFixture(id = lectureId): Lecture {
  return {
    lecture_id: id, course_id: courseId, course_title: "Mechanics", title: "Forces and motion", language: "en",
    status: "ended", join_code: "ABC123", join_url: "http://localhost:3000/join/ABC123",
    started_at: "2026-11-26T10:00:00Z", ended_at: "2026-11-26T11:00:00Z", offset_ms: 3_600_000,
    accepted_signals: 8, unique_participants: 5, created_at: "2026-11-26T09:00:00Z",
  };
}

function policyFixture(overrides: Partial<ConceptAutonomy> = {}): ConceptAutonomy {
  return {
    lecture_id: lectureId, course_id: courseId, concept_canonical_id: conceptId,
    concept_title: "Net force", mode: "locked", approvals: 0, rejections: 0, updated_at: null,
    ...overrides,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function failure(status: number): Response {
  return json({ error: { code: "TEST_ERROR", message: "Request could not be completed." } }, status);
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

type Override = (url: URL, options: RequestInit) => Response | Promise<Response> | undefined;

// The real API client performs serialization, authentication and response parsing.
function mockApi(policies: () => ConceptAutonomy[], override?: Override) {
  const transport = vi.fn<typeof fetch>(async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const response = override?.(url, options);
    if (response !== undefined) return response;
    if ((options.method ?? "GET") === "GET" && url.pathname === lecturePath) return json(lectureFixture());
    if ((options.method ?? "GET") === "GET" && url.pathname === listPath) return json(policies());
    return failure(404);
  });
  vi.stubGlobal("fetch", transport);
  return transport;
}

function signIn(token = accessToken) {
  saveProfessorSession({ accessToken: token, professorId: "professor-fixture", name: "Test Professor", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
}

function view(id = lectureId) {
  return <I18nProvider><ThemeProvider><AutonomyScreen lectureId={id} /></ThemeProvider></I18nProvider>;
}

function article() {
  return within(screen.getByRole("article", { name: "Net force" }));
}

function dialog() {
  return within(screen.getByRole("dialog"));
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("daris.locale", "en");
  navigation.replace.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AutonomyScreen", () => {
  it("does not fetch protected settings without a valid professor session", async () => {
    const transport = mockApi(() => []);
    render(view());
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(transport).not.toHaveBeenCalled();
  });

  it("shows loading then the empty canonical concept state without invented policies", async () => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => [], (url) => url.pathname === listPath ? pending.promise : undefined);
    render(view());
    expect(screen.getByRole("status", { name: label("autonomy.loading") })).toBeInTheDocument();
    await act(async () => pending.resolve(json([])));
    expect(await screen.findByText(label("autonomy.emptyTitle"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: label("autonomy.allow") })).not.toBeInTheDocument();
    expect(transport.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
    expect(transport.mock.calls.every(([, options]) => (options?.headers as Record<string, string>).Authorization === `Bearer ${accessToken}`)).toBe(true);
  });

  it("shows locked default, course-wide effects and policy counters without claiming AI decisions", async () => {
    signIn();
    mockApi(() => [policyFixture()]);
    render(view());
    await screen.findByRole("article", { name: "Net force" });
    expect(article().getByText(label("autonomy.mode.locked"))).toBeInTheDocument();
    expect(article().getByText(label("autonomy.default"))).toBeInTheDocument();
    expect(article().getByText(label("autonomy.approvals"))).toBeInTheDocument();
    expect(screen.getByText(label("autonomy.counterNotice"))).toBeInTheDocument();
    expect(screen.getByText(label("autonomy.policyNotice"))).toBeInTheDocument();
    expect(screen.getAllByText(label("autonomy.courseNotice").replace("{course}", "Mechanics"))[0]).toBeInTheDocument();
  });

  it("requires confirmation, supports cancellation, and uses professor authorization with the exact PUT body", async () => {
    signIn();
    const transport = mockApi(() => [policyFixture()], (url, options) => {
      if (url.pathname === policyPath && options.method === "PUT") return json(policyFixture({ mode: "whitelisted", approvals: 7, rejections: 2, updated_at: "2026-11-26T12:30:00Z" }));
    });
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    expect(dialog().getByText(label("autonomy.courseNotice").replace("{course}", "Mechanics"))).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.cancel") }));
    expect(transport.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(0);

    fireEvent.click(article().getByRole("button", { name: label("autonomy.allow") }));
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    await screen.findByText(label("autonomy.saved"));
    const writes = transport.mock.calls.filter(([, options]) => options?.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(String(writes[0]?.[0])).toContain(policyPath);
    expect(writes[0]?.[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ mode: "whitelisted" }), headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
    expect(article().getByText(label("autonomy.mode.whitelisted"))).toBeInTheDocument();
    expect(article().getByText("7")).toBeInTheDocument();
    expect(article().getByText("2")).toBeInTheDocument();
    expect(article().queryByText(label("autonomy.default"))).not.toBeInTheDocument();
  });

  it("confirms revocation and displays only the returned mode and counters", async () => {
    signIn();
    const transport = mockApi(() => [policyFixture({ mode: "whitelisted", approvals: 3 })], (url, options) => {
      if (url.pathname === policyPath && options.method === "PUT") return json(policyFixture({ approvals: 3, rejections: 1, updated_at: "2026-11-26T12:30:00Z" }));
    });
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.revoke") }));
    expect(dialog().getByText(label("autonomy.revokeExplanation"))).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmRevoke") }));
    await screen.findByText(label("autonomy.saved"));
    expect(transport.mock.calls.find(([, options]) => options?.method === "PUT")?.[1]?.body).toBe(JSON.stringify({ mode: "locked" }));
    expect(article().getByText(label("autonomy.mode.locked"))).toBeInTheDocument();
    expect(article().getByText("3")).toBeInTheDocument();
    expect(article().getByText("1")).toBeInTheDocument();
  });

  it("prevents duplicate saves, keeps the dialog open while saving, and avoids optimistic state", async () => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => [policyFixture()], (_url, options) => options.method === "PUT" ? pending.promise : undefined);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    const confirm = dialog().getByRole("button", { name: label("autonomy.confirmAllow") });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(dialog().getByRole("button", { name: label("autonomy.cancel") })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(article().getByText(label("autonomy.mode.locked"))).toBeInTheDocument();
    expect(screen.queryByText(label("autonomy.saved"))).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
    await act(async () => pending.resolve(json(policyFixture({ mode: "whitelisted", approvals: 1 }))));
    expect(await screen.findByText(label("autonomy.saved"))).toBeInTheDocument();
  });

  it.each([[403, "autonomy.forbidden"], [404, "autonomy.notFound"], [422, "autonomy.validation"], [429, "autonomy.rateLimit"]] as const)("handles a %s read failure without exposing editable settings", async (status, key) => {
    signIn();
    mockApi(() => [policyFixture()], (url) => url.pathname === listPath ? failure(status) : undefined);
    render(view());
    expect(await screen.findByText(label(key))).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it.each([[403, "autonomy.forbidden"], [404, "autonomy.notFound"], [422, "autonomy.validation"], [429, "autonomy.rateLimit"]] as const)("keeps the previous state after a rejected %s mutation", async (status, key) => {
    signIn();
    const transport = mockApi(() => [policyFixture()], (_url, options) => options.method === "PUT" ? failure(status) : undefined);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    expect(await screen.findByText(label(key))).toBeInTheDocument();
    expect(article().getByText(label("autonomy.mode.locked"))).toBeInTheDocument();
    expect(screen.queryByText(label("autonomy.saved"))).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
  });

  it.each(["read", "write"])("clears expired authentication on a 401 during %s", async (phase) => {
    signIn();
    mockApi(() => [policyFixture()], (_url, options) => phase === "read" || options.method === "PUT" ? failure(401) : undefined);
    render(view());
    if (phase === "write") {
      fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
      fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    }
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(getProfessorSession()).toBeNull();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("reconciles a lost save response and blocks another save until an authoritative read succeeds", async () => {
    signIn();
    let saveAttempted = false;
    let readsAfterSave = 0;
    const transport = mockApi(() => [policyFixture()], (url, options) => {
      if (options.method === "PUT") { saveAttempted = true; return Promise.reject(new TypeError("Network unavailable")); }
      if (url.pathname === listPath && saveAttempted) {
        readsAfterSave += 1;
        return readsAfterSave === 1 ? failure(503) : json([policyFixture({ mode: "whitelisted", approvals: 1 })]);
      }
    });
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    expect(await screen.findByText(label("autonomy.uncertain"))).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: label("autonomy.retry") });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.queryByRole("button", { name: label("autonomy.allow") })).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByText(label("autonomy.resolved"))).toBeInTheDocument();
    expect(article().getByText(label("autonomy.mode.whitelisted"))).toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
    expect(readsAfterSave).toBe(2);
  });

  it.each(["server", "malformed", "unrelated"])("refetches after an uncertain %s save response without repeating the mutation", async (kind) => {
    signIn();
    let saveAttempted = false;
    const transport = mockApi(() => [policyFixture({ mode: saveAttempted ? "whitelisted" : "locked", approvals: saveAttempted ? 1 : 0 })], (_url, options) => {
      if (options.method !== "PUT") return undefined;
      saveAttempted = true;
      if (kind === "server") return failure(503);
      if (kind === "malformed") return new Response("not valid JSON", { status: 200 });
      return json(policyFixture({ concept_canonical_id: "unrelated-concept" }));
    });
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    expect(await screen.findByText(label("autonomy.resolved"))).toBeInTheDocument();
    expect(article().getByText(label("autonomy.mode.whitelisted"))).toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
    expect(transport.mock.calls.filter(([url]) => String(url).endsWith(listPath))).toHaveLength(2);
  });

  it("disables confirmation and refresh while offline without sending a mutation", async () => {
    signIn();
    const transport = mockApi(() => [policyFixture()]);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    const confirm = dialog().getByRole("button", { name: label("autonomy.confirmAllow") });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: label("autonomy.refresh") })).toBeDisabled();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(0);
  });

  it("aborts a stale lecture read and does not let its response replace the new lecture", async () => {
    signIn();
    const pending = deferredResponse();
    const newId = "55555555-5555-4555-8555-555555555555";
    const transport = mockApi(() => [], (url) => {
      if (url.pathname === listPath) return pending.promise;
      if (url.pathname === `/api/v1/lectures/${newId}`) return json({ ...lectureFixture(newId), title: "New lecture" });
      if (url.pathname === `/api/v1/lectures/${newId}/concept-autonomy`) return json([policyFixture({ lecture_id: newId, concept_title: "New concept" })]);
    });
    const rendered = render(view());
    const oldSignal = transport.mock.calls.find(([url]) => String(url).endsWith(listPath))?.[1]?.signal;
    rendered.rerender(view(newId));
    expect(await screen.findByRole("article", { name: "New concept" })).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(json([policyFixture()])));
    expect(screen.queryByRole("article", { name: "Net force" })).not.toBeInTheDocument();
  });

  it("aborts a pending mutation on unmount and ignores its late unauthorized response", async () => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => [policyFixture()], (_url, options) => options.method === "PUT" ? pending.promise : undefined);
    const rendered = render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    const mutationSignal = transport.mock.calls.find(([, options]) => options?.method === "PUT")?.[1]?.signal;
    rendered.unmount();
    expect(mutationSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(failure(401)));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(getProfessorSession()).not.toBeNull();
  });

  it.each(["daris.professor.session", null])("clears protected content and aborts a pending save on cross-tab logout (%s)", async (key) => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => [policyFixture()], (_url, options) => options.method === "PUT" ? pending.promise : undefined);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    const mutationSignal = transport.mock.calls.find(([, options]) => options?.method === "PUT")?.[1]?.signal;
    window.localStorage.removeItem("daris.professor.session");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
    expect(mutationSignal?.aborted).toBe(true);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith("/login");
    await act(async () => pending.resolve(json(policyFixture({ mode: "whitelisted", approvals: 1 }))));
    expect(screen.queryByText(label("autonomy.saved"))).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("aborts an old read and reloads safely when another tab changes accounts", async () => {
    signIn();
    const pending = deferredResponse();
    const nextRead = deferredResponse();
    const transport = mockApi(() => [], (url, options) => {
      if (url.pathname !== listPath) return undefined;
      const token = (options.headers as Record<string, string>).Authorization;
      return token === `Bearer ${accessToken}` ? pending.promise : nextRead.promise;
    });
    render(view());
    const previousSignal = transport.mock.calls.find(([url]) => String(url).endsWith(listPath))?.[1]?.signal;
    signIn("new-account-token");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "daris.professor.session" })));
    expect(previousSignal?.aborted).toBe(true);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    await act(async () => pending.resolve(failure(401)));
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => nextRead.resolve(json([policyFixture({ concept_title: "New account concept" })])));
    expect(await screen.findByRole("article", { name: "New account concept" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Net force" })).not.toBeInTheDocument();
  });

  it("discards an open decision when the session changed before confirmation", async () => {
    signIn();
    const transport = mockApi(() => [policyFixture()]);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
    signIn("new-account-token");
    // Same-tab storage changes do not dispatch the browser's storage event.
    fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    await screen.findByRole("article", { name: "Net force" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transport.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(0);
    expect(transport.mock.calls.filter(([url]) => String(url).endsWith(listPath))).toHaveLength(2);
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
  });

  it.each(["read", "write"])("ignores a late successful %s response after a silent session change", async (phase) => {
    signIn();
    const pending = deferredResponse();
    let firstRead = true;
    const transport = mockApi(() => [policyFixture({ concept_title: "New account concept" })], (url, options) => {
      if (phase === "read" && url.pathname === listPath && firstRead) { firstRead = false; return pending.promise; }
      if (phase === "write" && options.method === "PUT") return pending.promise;
    });
    render(view());
    if (phase === "write") {
      fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
      fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    }
    signIn("new-account-token");
    await act(async () => pending.resolve(json(phase === "read" ? [policyFixture()] : policyFixture({ mode: "whitelisted", approvals: 1 }))));
    expect(await screen.findByRole("article", { name: "New account concept" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Net force" })).not.toBeInTheDocument();
    expect(screen.queryByText(label("autonomy.saved"))).not.toBeInTheDocument();
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
    expect(transport.mock.calls.filter(([url]) => String(url).endsWith(listPath))).toHaveLength(2);
  });

  it.each(["read", "write"])("does not clear a new valid session when an old %s returns 401 without a storage event", async (phase) => {
    signIn();
    const pending = deferredResponse();
    let firstRead = true;
    mockApi(() => [policyFixture()], (url, options) => {
      if (phase === "read" && url.pathname === listPath && firstRead) { firstRead = false; return pending.promise; }
      if (phase === "write" && options.method === "PUT") return pending.promise;
    });
    render(view());
    if (phase === "write") {
      fireEvent.click(await screen.findByRole("button", { name: label("autonomy.allow") }));
      fireEvent.click(dialog().getByRole("button", { name: label("autonomy.confirmAllow") }));
    }
    signIn("new-account-token");
    await act(async () => pending.resolve(failure(401)));
    await screen.findByRole("article", { name: "Net force" });
    expect(getProfessorSession()?.accessToken).toBe("new-account-token");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
