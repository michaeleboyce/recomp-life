import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { UserSettings } from "@/types";

let settings: Partial<UserSettings> | null | undefined;
vi.mock("@/hooks", () => ({ useSettings: () => settings }));

import { THEME_COLORS, ThemeProvider } from "./ThemeProvider";

const root = document.documentElement;
const meta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

beforeEach(() => {
  // As the server renders it.
  root.className = "dark";
  meta()?.remove();
});
afterEach(cleanup);

describe("ThemeProvider", () => {
  it("keeps dark while the settings load and when there is no profile", () => {
    settings = undefined;
    const { rerender } = render(<ThemeProvider />);
    expect(root.classList.contains("dark")).toBe(true);
    expect(meta()?.content).toBe(THEME_COLORS.dark);
    settings = null;
    rerender(<ThemeProvider />);
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("removes and restores the dark class as the setting changes", () => {
    settings = { theme: "light" };
    const { rerender } = render(<ThemeProvider />);
    expect(root.classList.contains("dark")).toBe(false);
    expect(meta()?.content).toBe(THEME_COLORS.light);
    expect(root.style.colorScheme).toBe("light");

    settings = { theme: "dark" };
    rerender(<ThemeProvider />);
    expect(root.classList.contains("dark")).toBe(true);
    expect(meta()?.content).toBe(THEME_COLORS.dark);
  });

  it("updates an existing theme-color meta instead of adding another", () => {
    const existing = document.createElement("meta");
    existing.name = "theme-color";
    existing.content = "#000000";
    document.head.appendChild(existing);
    settings = { theme: "light" };
    render(<ThemeProvider />);
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(existing.content).toBe(THEME_COLORS.light);
  });
});
