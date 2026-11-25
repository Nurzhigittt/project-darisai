import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SkipLink } from "@/components/ui/skip-link";
import { I18nProvider } from "@/lib/i18n";

describe("SkipLink", () => {
  it("focuses main without replacing a Handoff credential in the fragment", async () => {
    const tokenFragment = "#token=test_handoff_credential_012345678901234567890";
    window.localStorage.setItem("daris.locale", "en");
    window.history.replaceState(null, "", `/handoff${tokenFragment}`);
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <SkipLink />
        <main id="main">Published seminar material</main>
      </I18nProvider>,
    );
    const main = screen.getByRole("main");
    main.scrollIntoView = vi.fn();

    await user.click(screen.getByRole("link", { name: "Skip to content" }));

    expect(document.activeElement).toBe(main);
    expect(window.location.hash).toBe(tokenFragment);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/handoff");
  });
});
