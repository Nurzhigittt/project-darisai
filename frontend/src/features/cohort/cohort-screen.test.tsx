import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CohortScreen } from "@/features/cohort/cohort-screen";
import type { CohortConceptMetric, CohortMemory, Course } from "@/lib/api/client";
import { clearProfessorSession, getProfessorSession, saveProfessorSession } from "@/lib/auth/professor";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ThemeProvider } from "@/lib/theme";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const courseId = "11111111-1111-4111-8111-111111111111";
const otherCourseId = "22222222-2222-4222-8222-222222222222";
const conceptId = "33333333-3333-4333-8333-333333333333";
const otherConceptId = "44444444-4444-4444-8444-444444444444";
const cohortPath = `/api/v1/courses/${courseId}/cohort-memory`;
const accessToken = "test-professor-access-token";
const label = (key: string) => dictionaries.en[key] ?? key;

function concept(overrides: Partial<CohortConceptMetric> = {}): CohortConceptMetric {
  return {
    concept_canonical_id: conceptId,
    status: "ready",
    observed_lectures: 8,
    mean_signal_events_per_lecture: 2.125,
    signal_observed_lecture_share: 0.625,
    cluster_observed_lecture_share: 0.25,
    mean_cluster_peak_intensity: 0.375,
    ...overrides,
  };
}

function memory(concepts: CohortConceptMetric[] = [concept()]): CohortMemory {
  return {
    minimum_lectures_required: 8,
    minimum_participants_per_lecture: 4,
    concepts,
    generated_at: "2026-11-25T12:00:00Z",
    interpretation_note: "Signal and Ripple cluster metrics are observed events, not comprehension measures. Absence of signals or clusters is not evidence of understanding.",
  };
}

function courses(): Course[] {
  return [
    { id: courseId, title: "Mechanics", created_at: "2026-11-01T12:00:00Z" },
    { id: otherCourseId, title: "Geometry", created_at: "2026-11-01T12:00:00Z" },
  ];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function failure(status: number): Response {
  return json({ error: { code: "TEST_ERROR", message: "Internal error detail should not be displayed." } }, status);
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

type Override = (url: URL, options: RequestInit) => Response | Promise<Response> | undefined;

/** Mock only fetch: every test exercises the real API client's auth, URL and parsing. */
function mockApi(report: () => CohortMemory, override?: Override) {
  const transport = vi.fn<typeof fetch>(async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const custom = override?.(url, options);
    if (custom !== undefined) return custom;
    if (url.pathname === "/api/v1/courses") return json(courses());
    if (url.pathname === cohortPath) return json(report());
    return failure(404);
  });
  vi.stubGlobal("fetch", transport);
  return transport;
}

function signIn() {
  saveProfessorSession({ accessToken, professorId: "professor-test", name: "Test Professor", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
}

function ui(id = courseId) {
  return <I18nProvider><ThemeProvider><CohortScreen courseId={id} /></ThemeProvider></I18nProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("daris.locale", "en");
  navigation.replace.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("CohortScreen", () => {
  it("redirects without fetching protected data when there is no professor session", async () => {
    const transport = mockApi(() => memory());
    render(ui());
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(transport).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("reads the real course endpoint with auth and distinguishes observed zero from missing intensity", async () => {
    signIn();
    const transport = mockApi(() => memory([
      concept(),
      concept({ concept_canonical_id: otherConceptId, mean_signal_events_per_lecture: 0, signal_observed_lecture_share: 0, cluster_observed_lecture_share: 0, mean_cluster_peak_intensity: null }),
    ]));
    render(ui());

    expect(await screen.findByText("Mechanics")).toBeInTheDocument();
    const row = within(screen.getByRole("row", { name: new RegExp(conceptId) }));
    expect(row.getByRole("cell", { name: "8" })).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "2.125" })).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "62.5%" })).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "25%" })).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "0.375" })).toBeInTheDocument();
    const zeroRow = within(screen.getByRole("row", { name: new RegExp(otherConceptId) }));
    expect(zeroRow.getByRole("cell", { name: "0" })).toBeInTheDocument();
    expect(zeroRow.getAllByRole("cell", { name: "0%" })).toHaveLength(2);
    expect(zeroRow.getByRole("cell", { name: label("cohort.noValue") })).toBeInTheDocument();
    expect(screen.getByText(label("cohort.interpretation"))).toBeInTheDocument();
    expect(screen.getByText(label("cohort.thresholds").replace("{lectures}", "8").replace("{participants}", "4"))).toBeInTheDocument();
    expect(screen.getByRole("region", { name: label("cohort.tableRegion") })).toHaveAttribute("tabindex", "0");
    const reportRequest = transport.mock.calls.find(([url]) => new URL(String(url)).pathname === cohortPath);
    expect(new URL(String(reportRequest?.[0])).searchParams.get("limit")).toBe("200");
    for (const [, options] of transport.mock.calls) {
      expect(options).toMatchObject({ method: "GET", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("suppresses every metric for insufficient history even if the response contains forbidden values", async () => {
    signIn();
    mockApi(() => memory([concept({ status: "insufficient_history", observed_lectures: 91, mean_signal_events_per_lecture: 73, signal_observed_lecture_share: 0.93, cluster_observed_lecture_share: 0.87, mean_cluster_peak_intensity: 0.914 })]));
    render(ui());

    await screen.findByText(conceptId);
    const row = within(screen.getByRole("row", { name: new RegExp(conceptId) }));
    expect(row.getByText(label("cohort.insufficient"))).toBeInTheDocument();
    expect(row.getAllByRole("cell")).toHaveLength(1);
    expect(row.getByRole("cell")).toHaveTextContent(label("cohort.suppressed"));
    expect(row.getByRole("cell")).toHaveAttribute("colspan", "5");
    for (const value of ["91", "73", "93%", "87%", "0.914"]) expect(row.queryByText(value)).not.toBeInTheDocument();
  });

  it("shows a truthful empty state instead of a fabricated table", async () => {
    signIn();
    mockApi(() => memory([]));
    render(ui());
    expect(await screen.findByText(label("cohort.emptyTitle"))).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(label("cohort.interpretation"))).toBeInTheDocument();
  });

  it("shows loading, handles rate limiting, and retries without changing any data", async () => {
    signIn();
    const pending = deferredResponse();
    let first = true;
    const transport = mockApi(() => memory(), (url) => {
      if (url.pathname === cohortPath && first) { first = false; return pending.promise; }
    });
    render(ui());
    expect(screen.getByRole("status", { name: label("cohort.loading") })).toBeInTheDocument();
    await act(async () => pending.resolve(failure(429)));
    expect(await screen.findByRole("alert")).toHaveTextContent(label("cohort.rateLimit"));
    expect(screen.queryByText("Internal error detail should not be displayed.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: label("cohort.retry") }));
    await screen.findByRole("table");
    expect(transport.mock.calls.filter(([url]) => new URL(String(url)).pathname === cohortPath)).toHaveLength(2);
    expect(transport.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });

  it.each([403, 404])("clears the previous report when refresh returns %s", async (status) => {
    signIn();
    let unavailable = false;
    mockApi(() => memory(), (url) => url.pathname === cohortPath && unavailable ? failure(status) : undefined);
    render(ui());
    await screen.findByRole("table");
    unavailable = true;
    fireEvent.click(screen.getByRole("button", { name: label("cohort.refresh") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(label("cohort.unavailable"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Mechanics")).not.toBeInTheDocument();
  });

  it("clears protected values and the expired session on a server 401", async () => {
    signIn();
    let expired = false;
    mockApi(() => memory(), (url) => url.pathname === cohortPath && expired ? failure(401) : undefined);
    render(ui());
    await screen.findByRole("table");
    expired = true;
    fireEvent.click(screen.getByRole("button", { name: label("cohort.refresh") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(getProfessorSession()).toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("aborts a previous course read and ignores its late response", async () => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => memory(), (url) => {
      if (url.pathname === cohortPath) return pending.promise;
      if (url.pathname === `/api/v1/courses/${otherCourseId}/cohort-memory`) return json(memory([concept({ concept_canonical_id: otherConceptId })]));
    });
    const view = render(ui());
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    view.rerender(ui(otherCourseId));
    expect(await screen.findByText("Geometry")).toBeInTheDocument();
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(json(memory())));
    expect(screen.queryByText(conceptId)).not.toBeInTheDocument();
    expect(screen.getByText(otherConceptId)).toBeInTheDocument();
    expect(screen.queryByText("Mechanics")).not.toBeInTheDocument();
  });

  it.each([200, 401])("preserves a silently replaced valid session when the previous read returns %s", async (status) => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => memory(), (url) => url.pathname === cohortPath ? pending.promise : undefined);
    render(ui());
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    saveProfessorSession({ accessToken: "new-professor-token", professorId: "new-professor", name: "New Professor", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    // Deliberately omit a storage event: the response path must check the session itself.
    await act(async () => pending.resolve(status === 200 ? json(memory()) : failure(status)));
    expect(getProfessorSession()?.accessToken).toBe("new-professor-token");
    expect(navigation.replace).toHaveBeenCalledWith("/professor");
    expect(navigation.replace).not.toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Mechanics")).not.toBeInTheDocument();
  });

  it("clears the report when signing out in another tab", async () => {
    signIn();
    mockApi(() => memory());
    render(ui());
    await screen.findByRole("table");
    act(() => {
      clearProfessorSession();
      window.dispatchEvent(new StorageEvent("storage", { key: "daris.professor.session" }));
    });
    expect(navigation.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Mechanics")).not.toBeInTheDocument();
  });

  it("aborts an in-flight read on sign out so a late response cannot restore the report", async () => {
    signIn();
    const pending = deferredResponse();
    const transport = mockApi(() => memory(), (url) => url.pathname === cohortPath ? pending.promise : undefined);
    render(ui());
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: label("cohort.logout") }));
    await act(async () => pending.resolve(json(memory())));
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(getProfessorSession()).toBeNull();
    expect(navigation.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("disables refresh offline and identifies network failure when a read cannot reach the server", async () => {
    signIn();
    mockApi(() => memory(), (url) => {
      if (url.pathname === cohortPath) throw new TypeError("Failed to fetch");
      return undefined;
    });
    render(ui());
    expect(await screen.findByRole("alert")).toHaveTextContent(label("cohort.network"));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByText(label("cohort.offline"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label("cohort.refresh") })).toBeDisabled();
    expect(screen.getByRole("button", { name: label("cohort.retry") })).toBeDisabled();
  });
});
