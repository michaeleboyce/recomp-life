import { useSyncExternalStore } from "react";

export type AppliedTheme = "dark" | "light";

/**
 * The theme actually on screen, read from the `dark` class that ThemeProvider puts on
 * `<html>`. Only for code that needs concrete colours in JavaScript (three.js scenes);
 * everything else should use the CSS tokens, which switch with no JavaScript at all.
 * "dark" during server rendering, matching the server HTML.
 */
export function useAppliedTheme(): AppliedTheme {
  return useSyncExternalStore(subscribe, readTheme, () => "dark");
}

function readTheme(): AppliedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
