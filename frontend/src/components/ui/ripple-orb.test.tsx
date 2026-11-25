import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RippleOrb } from "@/components/ui/ripple-orb";
import { I18nProvider } from "@/lib/i18n";

function renderOrb(
  props: Partial<React.ComponentProps<typeof RippleOrb>> = {},
) {
  return render(
    <I18nProvider>
      <RippleOrb
        state="connected"
        availability="ok"
        intensity={0}
        statusLabel="few_signals"
        {...props}
      />
    </I18nProvider>,
  );
}

describe("RippleOrb", () => {
  it("labels silence as few signals, never universal understanding", () => {
    renderOrb();
    expect(screen.getByText("Few signals")).toBeInTheDocument();
    expect(screen.queryByText(/everyone understands/i)).not.toBeInTheDocument();
  });

  it("renders a sustained cluster as a clarification prompt", () => {
    renderOrb({
      state: "cluster",
      intensity: 0.8,
      statusLabel: "clarification_may_be_helpful",
    });
    expect(screen.getByText("Clarification may be helpful")).toBeInTheDocument();
  });

  it("renders insufficient participation as insufficient data", () => {
    renderOrb({
      availability: "insufficient_participation",
      statusLabel: "insufficient_participation",
    });
    expect(screen.getByText("Insufficient participation to judge")).toBeInTheDocument();
  });

  it("uses an unavailable state when the connection is down", () => {
    renderOrb({ availability: "connection_unavailable" });
    expect(screen.getByText("Connection unavailable")).toBeInTheDocument();
  });
});
