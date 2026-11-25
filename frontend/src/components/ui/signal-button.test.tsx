import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SignalButton } from "@/components/ui/signal-button";
import { I18nProvider } from "@/lib/i18n";

function renderButton(
  props: Partial<React.ComponentProps<typeof SignalButton>> = {},
) {
  return render(
    <I18nProvider>
      <SignalButton state="ready" onClick={() => {}} {...props} />
    </I18nProvider>,
  );
}

describe("SignalButton", () => {
  it("is actionable in the ready state", () => {
    const onClick = vi.fn();
    renderButton({ onClick });
    const button = screen.getByTestId("signal-button");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("data-state", "ready");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not claim acceptance before an acknowledgement", () => {
    renderButton({ state: "sending" });
    expect(screen.getByTestId("signal-button")).toHaveTextContent("Sending…");
    expect(screen.getByTestId("signal-button")).toHaveAttribute(
      "data-state",
      "sending",
    );
  });

  it("shows a disabled cooldown with remaining seconds", () => {
    renderButton({ state: "cooldown", cooldownRemainingMs: 8_000, cooldownTotalMs: 15_000 });
    expect(screen.getByTestId("signal-button")).toBeDisabled();
    expect(screen.getByTestId("signal-button")).toHaveTextContent("One moment");
    expect(screen.getByTestId("signal-button")).toHaveTextContent("8s");
  });

  it("shows paused and offline states with text, not colour alone", () => {
    const { rerender } = renderButton({ state: "paused" });
    expect(screen.getByTestId("signal-button")).toHaveTextContent("The lecture is paused");
    rerender(
      <I18nProvider>
        <SignalButton state="offline" onClick={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("signal-button")).toHaveTextContent("No connection");
    expect(screen.getByTestId("signal-button")).toBeDisabled();
  });
});
