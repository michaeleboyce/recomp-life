import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { useAppliedTheme } from "./useAppliedTheme";
import { useAppliedTheme as fromIndex } from "./index";

const root = () => document.documentElement;

afterEach(() => {
  // Unmount first so no observer sees the reset.
  cleanup();
  root().classList.remove("dark");
});

describe("useAppliedTheme", () => {
  it("is exported from the hooks barrel", () => {
    expect(fromIndex).toBe(useAppliedTheme);
  });

  it("reads the dark class on <html>", () => {
    root().classList.add("dark");
    const { result } = renderHook(() => useAppliedTheme());
    expect(result.current).toBe("dark");
  });

  it("is light when <html> has no dark class", () => {
    const { result } = renderHook(() => useAppliedTheme());
    expect(result.current).toBe("light");
  });

  it("follows the class when the theme changes", async () => {
    root().classList.add("dark");
    const { result } = renderHook(() => useAppliedTheme());
    // The observer reports on a microtask; let it run inside act.
    await act(async () => {
      root().classList.remove("dark");
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toBe("light"));
    await act(async () => {
      root().classList.add("dark");
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toBe("dark"));
  });

  it("is dark during server rendering", () => {
    function Probe() {
      return createElement("span", null, useAppliedTheme());
    }
    expect(renderToString(createElement(Probe))).toContain("dark");
  });
});
