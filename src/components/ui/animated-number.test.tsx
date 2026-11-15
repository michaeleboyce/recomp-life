import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AnimatedNumber } from "./animated-number";

/** A matchMedia that answers the reduced-motion query with `reduce`. */
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const shown = () => Number(screen.getByTestId("n").textContent);

describe("AnimatedNumber", () => {
  it("counts up from `from` to the value with an ease-out, within the duration", () => {
    stubReducedMotion(false);
    render(<div data-testid="n"><AnimatedNumber value={250} from={200} duration={400} /></div>);
    expect(shown()).toBe(200);
    act(() => vi.advanceTimersByTime(100));
    const early = shown();
    expect(early).toBeGreaterThan(200);
    expect(early).toBeLessThan(250);
    // Ease-out: more than a quarter of the way after a quarter of the time.
    expect(early - 200).toBeGreaterThan(50 / 4);
    act(() => vi.advanceTimersByTime(400));
    expect(shown()).toBe(250);
  });

  it("shows the first value as it is without `from`", () => {
    stubReducedMotion(false);
    render(<div data-testid="n"><AnimatedNumber value={250} /></div>);
    expect(shown()).toBe(250);
  });

  it("counts to a new value from the one on screen", () => {
    stubReducedMotion(false);
    const { rerender } = render(<div data-testid="n"><AnimatedNumber value={10} /></div>);
    rerender(<div data-testid="n"><AnimatedNumber value={20} /></div>);
    act(() => vi.advanceTimersByTime(50));
    expect(shown()).toBeGreaterThan(10);
    expect(shown()).toBeLessThan(20);
    act(() => vi.advanceTimersByTime(400));
    expect(shown()).toBe(20);
  });

  it("shows the value at once under reduced motion", () => {
    stubReducedMotion(true);
    const { rerender } = render(<div data-testid="n"><AnimatedNumber value={250} from={200} /></div>);
    expect(shown()).toBe(250);
    rerender(<div data-testid="n"><AnimatedNumber value={260} from={200} /></div>);
    act(() => vi.advanceTimersByTime(0));
    expect(shown()).toBe(260);
  });
});
