"use client";

import { Moon, Sun } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function ThemeSwitcher({ light = false }: { light?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  return (
    <IconButton
      label={t("theme.toggle")}
      onClick={toggleTheme}
      className={light ? "text-white/80 hover:bg-white/10 hover:text-white" : undefined}
    >
      {theme === "light" ? (
        <Moon aria-hidden className="size-5" />
      ) : (
        <Sun aria-hidden className="size-5" />
      )}
    </IconButton>
  );
}
