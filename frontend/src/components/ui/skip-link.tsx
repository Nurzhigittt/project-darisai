"use client";

import { useI18n } from "@/lib/i18n";

export function SkipLink() {
  const { t } = useI18n();
  return <a
    href="#main"
    className="sr-only-focusable fixed left-3 top-3 z-[200] rounded-lg bg-primary px-4 py-2 font-semibold text-surface"
    onClick={(event) => {
      const main = document.getElementById("main");
      if (!main) return;
      // Fragment credentials (Handoff) must survive keyboard navigation.
      event.preventDefault();
      if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
      main.focus();
      main.scrollIntoView({ block: "start", behavior: "instant" });
    }}
  >
    {t("common.skipContent")}
  </a>;
}
