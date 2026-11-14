"use client";

import { useEffect } from "react";
import { useSettings } from "@/hooks";

/**
 * The browser chrome colour for each theme: the `--background` token of that theme
 * (globals.css), converted from oklch to sRGB hex.
 */
export const THEME_COLORS = { dark: "#060709", light: "#f5f7f9" } as const;

/**
 * Applies the theme setting. The server HTML always has `class="dark"`, so dark users
 * (and everyone while the settings load) never see a flash; the class comes off only
 * once the stored setting says "light". Also keeps the `theme-color` meta in step.
 * Renders nothing.
 */
export function ThemeProvider() {
  const settings = useSettings();
  const theme = settings?.theme === "light" ? "light" : "dark";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLORS[theme];
  }, [theme]);

  return null;
}
