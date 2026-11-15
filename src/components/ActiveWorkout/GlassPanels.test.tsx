import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LastSetBanner, NEW_BEST_COUNT_MS } from "./GlassPanels";
import type { LastSetVerdict } from "./glassForecast";

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

const newBest: LastSetVerdict = {
  title: "New best · Squat 215 × 6",
  body: "Forecast was 5 (4 to 6). You got 6. Inside the expected range.",
  newBest: 258,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LastSetBanner", () => {
  it("counts a new best up from the old one, finishing within the count time", () => {
    stubReducedMotion(false);
    render(<LastSetBanner verdict={newBest} previousBest={250} />);
    const banner = screen.getByTestId("last-set-banner");
    expect(banner).toHaveTextContent("250");
    act(() => vi.advanceTimersByTime(NEW_BEST_COUNT_MS / 4));
    expect(banner).not.toHaveTextContent(/\b250\b/);
    act(() => vi.advanceTimersByTime(NEW_BEST_COUNT_MS));
    expect(banner).toHaveTextContent("258");
    expect(NEW_BEST_COUNT_MS).toBeGreaterThanOrEqual(150);
    expect(NEW_BEST_COUNT_MS).toBeLessThanOrEqual(400);
  });

  it("shows the new best at once under reduced motion", () => {
    stubReducedMotion(true);
    render(<LastSetBanner verdict={newBest} previousBest={250} />);
    expect(screen.getByTestId("last-set-banner")).toHaveTextContent("258");
  });

  it("shows no number when the set made no new best", () => {
    stubReducedMotion(false);
    render(<LastSetBanner verdict={{ ...newBest, title: "Squat 215 × 4", newBest: null }} />);
    expect(screen.getByTestId("last-set-banner")).not.toHaveTextContent(/est\. max/);
  });
});
