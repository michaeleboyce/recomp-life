import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));

import { STATE_KEY, STORAGE_KEY, canGoBackInApp, getNavStack, resetNavHistoryForTests } from "./navHistory";
import { useNavHistory, usePreviousScreen } from "./useNavHistory";

/** AppChrome's hook plus what a back arrow reads. */
function track() {
  return renderHook(() => {
    useNavHistory();
    return usePreviousScreen();
  });
}

/** A push, as the router makes it. Subscribers hear of it after the current work (a microtask). */
async function go(url: string) {
  await act(async () => window.history.pushState({ __NA: true }, "", url));
}

/** history.back() or forward(), waiting for the popstate: jsdom moves through history asynchronously, as browsers do. */
async function traverse(direction: "back" | "forward") {
  await act(async () => {
    const landed = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    window.history[direction]();
    await landed;
  });
}

const back = () => traverse("back");

function setNavigationType(type: string) {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type } as unknown as PerformanceEntry]);
}

beforeEach(() => {
  resetNavHistoryForTests();
  sessionStorage.clear();
  window.history.replaceState({ __NA: true }, "", "/");
});

afterEach(() => {
  resetNavHistoryForTests();
  vi.restoreAllMocks();
});

describe("useNavHistory", () => {
  it("has no previous screen on the first screen of the session", async () => {
    const { result } = track();
    expect(result.current).toBeNull();
    expect(canGoBackInApp()).toBe(false);
  });

  it("records each in-app push, with the previous screen's name", async () => {
    const { result } = track();
    await go("/progress");
    expect(result.current).toEqual({ url: "/", name: "Today" });
    await go("/progress/forecasts");
    await go("/progress/lift/squat");
    expect(result.current).toEqual({ url: "/progress/forecasts", name: "Forecasts" });
    expect(canGoBackInApp()).toBe(true);
  });

  it("stamps each entry with its position, keeping the router's state", async () => {
    track();
    await go("/progress");
    expect(window.history.state).toEqual({ __NA: true, [STATE_KEY]: 1 });
  });

  it("follows back and forward", async () => {
    const { result } = track();
    await go("/progress");
    await go("/progress/forecasts");
    await go("/progress/lift/squat");

    await back();
    expect(window.location.pathname).toBe("/progress/forecasts");
    expect(result.current).toEqual({ url: "/progress", name: "Progress" });

    await back();
    expect(result.current).toEqual({ url: "/", name: "Today" });

    await traverse("forward");
    expect(window.location.pathname).toBe("/progress/forecasts");
    expect(result.current?.url).toBe("/progress");
  });

  it("does not add an entry for a replace (a tab switch or the why sheet)", async () => {
    const { result } = track();
    await go("/progress");
    await act(async () => window.history.replaceState(null, "", "/progress?tab=body"));
    await go("/progress/lift/squat");
    expect(result.current).toEqual({ url: "/progress?tab=body", name: "Progress" });
    expect(getNavStack()?.entries).toEqual(["/", "/progress?tab=body", "/progress/lift/squat"]);
  });

  it("keeps the list through a document the browser loads again from history", async () => {
    track();
    await go("/progress");
    await go("/progress/forecasts");
    resetNavHistoryForTests();

    // Back to an entry after leaving the app: same stamp, same saved list.
    setNavigationType("back_forward");
    const { result } = track();
    expect(result.current).toEqual({ url: "/progress", name: "Progress" });
  });

  it("starts over after a reload, so back uses the page's own target", async () => {
    track();
    await go("/progress");
    await go("/progress/forecasts");
    resetNavHistoryForTests();

    setNavigationType("reload");
    const { result } = track();
    expect(result.current).toBeNull();
    expect(getNavStack()).toEqual({ base: 0, entries: ["/progress/forecasts"], index: 0 });
  });

  it("starts over when a reload finds nothing saved", async () => {
    window.history.replaceState({ __NA: true, [STATE_KEY]: 4 }, "", "/progress/lift/squat");
    const { result } = track();
    expect(result.current).toBeNull();
    expect(window.history.state[STATE_KEY]).toBe(0);
  });

  it("saves the list in sessionStorage", async () => {
    track();
    await go("/progress");
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual({
      base: 0,
      entries: ["/", "/progress"],
      index: 1,
    });
  });

  it("still works, for this page load, when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = track();
    await go("/progress");
    await go("/progress/forecasts");
    expect(result.current?.url).toBe("/progress");
    await back();
    expect(result.current?.url).toBe("/");
  });
});
