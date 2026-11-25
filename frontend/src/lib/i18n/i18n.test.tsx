import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { I18nProvider, useI18n } from "@/lib/i18n";

function Probe() {
  const { t } = useI18n();
  return <h1>{t("landing.title")}</h1>;
}

describe("localisation", () => {
  it("switches the primary flow to Russian and Kazakh", async () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent(
        "Make understanding visible.",
      ),
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ru" } });
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent(
        "Сделайте понимание видимым.",
      ),
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "kk" } });
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent(
        "Түсінуді көрінетін етіңіз.",
      ),
    );
    expect(document.documentElement.lang).toBe("kk");
  });
});
