import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HandoffScreen } from "@/features/handoff/handoff-screen";
import { API_URL, type HandoffPublic } from "@/lib/api/client";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

// Fixtures stay in this test. The production screen only renders API data.
const token = "test_handoff_credential_012345678901234567890";
const published: HandoffPublic = {
  headline: "Apply the conservation principle",
  read_time_sec: 30,
  concepts: [{ title: "Conservation", detail: "Track the total before and after." }],
  task: {
    title: "Compare two systems",
    instructions: "Describe each system.\nExplain what remains constant.",
    duration_minutes: 15,
  },
  lecture_title: "Introduction to mechanics",
  language: "en",
  expires_at: "2026-12-01T10:00:00Z",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderHandoff() {
  return render(
    <StrictMode>
      <I18nProvider>
        <ThemeProvider>
          <HandoffScreen />
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/handoff");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

describe("public Handoff", () => {
  it("explains a missing fragment without requesting or requiring a login", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    renderHandoff();
    expect(screen.getByRole("alert")).toHaveTextContent("Open the full shared link");
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("does not accept a token from the query string", () => {
    window.history.replaceState(null, "", `/handoff?token=${token}`);
    const fetch = vi.spyOn(globalThis, "fetch");
    renderHandoff();
    expect(screen.getByRole("alert")).toHaveTextContent("Open the full shared link");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed or duplicated fragment credentials before sending them", () => {
    window.history.replaceState(null, "", `/handoff#token=${token}&token=another`);
    const fetch = vi.spyOn(globalThis, "fetch");
    renderHandoff();
    expect(screen.getByRole("alert")).toHaveTextContent("This link is incomplete");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("redeems once in StrictMode with the token only in the POST body", async () => {
    window.history.replaceState(null, "", `/handoff#token=${token}`);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(published));
    const store = vi.spyOn(Storage.prototype, "setItem");
    renderHandoff();

    expect(await screen.findByRole("heading", { name: published.headline })).toBeVisible();
    expect(screen.getByText(/Describe each system/)).toHaveTextContent("Explain what remains constant.");
    expect(screen.getByText("Published by the professor")).toBeVisible();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${API_URL}/api/v1/handoff/redeem`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token }),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(store).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(token);
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe(`#token=${token}`);
  });

  it("handles invalid, expired or revoked links without exposing server error details", async () => {
    window.history.replaceState(null, "", `/handoff#token=${token}`);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      error: { code: "NOT_FOUND", message: `Private diagnostic ${token}` },
    }, 404));
    renderHandoff();

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid, expired or revoked");
    expect(screen.queryByText(published.headline)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(token);
  });

  it("retries a failed network request without losing the fragment credential", async () => {
    window.history.replaceState(null, "", `/handoff#token=${token}`);
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response(published));
    renderHandoff();

    expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: published.headline })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("blocks offline redemption and enables retry when connectivity returns", async () => {
    window.history.replaceState(null, "", `/handoff#token=${token}`);
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(published));
    renderHandoff();

    expect(screen.getByText(/You’re offline/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    fireEvent(window, new Event("online"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: published.headline })).toBeVisible();
  });

  it("explains rate limits and leaves retry under the reader’s control", async () => {
    window.history.replaceState(null, "", `/handoff#token=${token}`);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { code: "RATE_LIMITED" } }, 429));
    renderHandoff();

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("aborts an old redemption and ignores its result after the fragment changes", async () => {
    window.history.replaceState(null, "", `/handoff#token=${token}`);
    let resolveOld: (value: Response) => void = () => {};
    const oldRequest = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce(response(published));
    renderHandoff();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const oldSignal = fetch.mock.calls[0]?.[1]?.signal;

    window.history.replaceState(null, "", "/handoff#token=next_credential_01234567890123456789");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("heading", { name: published.headline })).toBeVisible();
    expect(oldSignal?.aborted).toBe(true);

    await act(async () => { resolveOld(response({ ...published, headline: "Obsolete material" })); });
    expect(screen.queryByText("Obsolete material")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: published.headline })).toBeVisible();
  });
});
