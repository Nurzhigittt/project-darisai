import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LandingScreen } from "@/features/landing/landing-screen";
import { landingCopy } from "@/features/landing/landing-copy";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

function renderLanding() {
  return render(<I18nProvider><ThemeProvider><LandingScreen /></ThemeProvider></I18nProvider>);
}

describe("landing interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("daris.locale", "en");
    navigation.push.mockClear();
  });

  it("explains an incomplete code and returns focus to the code field", () => {
    renderLanding();
    const input = screen.getByLabelText(landingCopy.en.join.label);
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: landingCopy.en.join.button }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("normalizes a complete code and uses the existing join route", () => {
    renderLanding();
    fireEvent.change(screen.getByLabelText(landingCopy.en.join.label), { target: { value: "abc123" } });
    fireEvent.click(screen.getByRole("button", { name: landingCopy.en.join.button }));
    expect(navigation.push).toHaveBeenCalledWith("/join/ABC123");
  });

  it("keeps the student example local and does not change the audience chart", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = renderLanding();
    const chart = container.querySelector("figure svg[data-signal-chart] path:last-child");
    const pathBefore = chart?.getAttribute("d");
    fireEvent.click(screen.getByRole("button", { name: landingCopy.en.demo.signal }));
    const selected = screen.getByRole("button", { name: landingCopy.en.demo.signalSent });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).toHaveAccessibleDescription(landingCopy.en.demo.caption);
    expect(chart?.getAttribute("d")).toBe(pathBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(selected);
    expect(screen.getByRole("button", { name: landingCopy.en.demo.signal })).toHaveAttribute("aria-pressed", "false");
  });

  it.each(["trigger", "navigation link"])("closes mobile navigation with Escape from the %s and returns focus", (focusTarget) => {
    renderLanding();
    const menu = screen.getByRole("button", { name: landingCopy.en.nav.menu });
    fireEvent.click(menu);
    const panel = document.getElementById("landing-navigation");
    expect(panel).toBeInTheDocument();
    const target = focusTarget === "trigger"
      ? menu
      : within(panel!).getByRole("link", { name: landingCopy.en.nav.how });
    target.focus();
    expect(target).toHaveFocus();
    fireEvent.keyDown(target, { key: "Escape" });
    expect(document.getElementById("landing-navigation")).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
  });
});
