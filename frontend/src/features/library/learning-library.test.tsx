import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LearningLibrary } from "@/features/library/learning-library";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import * as storage from "@/lib/storage/db";
import { ThemeProvider } from "@/lib/theme";

const lectureId = "local-library-test-lecture";
const label = (key: string) => dictionaries.en[key] ?? key;

beforeEach(async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); },
  });
  localStorage.clear(); localStorage.setItem("daris.locale", "en");
  await storage.resetLocalDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("daris-local-v1");
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  await storage.saveSession({
    lectureId, joinCode: "TEST01", signalToken: "test-signal-pass", replayToken: "test-replay-pass",
    lecture: { id: lectureId, title: "Local mechanics lecture", course_title: "Physics", status: "ended", language: "en" },
    wsUrl: "ws://localhost/ws", joinedAt: "2026-11-26T10:00:00Z", signalTokenExpiresAt: "2026-11-26T11:00:00Z", replayTokenExpiresAt: "2026-11-27T10:00:00Z", nextSeq: 1, cooldownUntil: 0,
  });
});
afterEach(() => vi.restoreAllMocks());

function view() { return <I18nProvider><ThemeProvider><LearningLibrary /></ThemeProvider></I18nProvider>; }

describe("local learning history removal", () => {
  it("requires confirmation and preserves local history when cancelled", async () => {
    await storage.saveStoredGapCards(lectureId, [{ id: "saved-card", lectureId, front: "Recall force", quote: "Force changes acceleration", offsetMs: 12000, createdAt: "2026-11-26T10:00:00Z" }]);
    const clear = vi.spyOn(storage, "clearLectureHistory");
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("library.clear") }));
    const dialog = screen.getByRole("dialog", { name: label("library.confirmTitle") });
    expect(within(dialog).getByText(label("library.confirmBody"))).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: label("library.cancel") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(clear).not.toHaveBeenCalled();
    expect(await storage.listStoredGapCards(lectureId)).toHaveLength(1);
    expect(screen.queryByText(label("library.cleared"))).not.toBeInTheDocument();
  });

  it("reports a failed clear even when visible signal/card counts are already zero", async () => {
    // The failure could be in another history store; empty displayed counts are
    // insufficient proof that the database transaction committed.
    const clear = vi.spyOn(storage, "clearLectureHistory").mockResolvedValue(false);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: label("library.clear") }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label("library.clear") }));
    expect(await screen.findByText(label("library.clearFailed"))).toBeInTheDocument();
    expect(clear).toHaveBeenCalledExactlyOnceWith(lectureId);
    expect(screen.queryByText(label("library.cleared"))).not.toBeInTheDocument();
  });
});
