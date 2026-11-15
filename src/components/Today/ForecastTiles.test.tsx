import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TodayForecast } from "@/hooks";
import { ForecastTiles, forecastTiles } from "./ForecastTiles";
import { SETTLE_STEP_MS, resetSettled } from "./TodayHero";

const readiness = {
  score: 78,
  usual: 72,
  contributions: [],
  suggestSkippingAccessories: false,
};

const full: TodayForecast = {
  session: { minutes: 46, low: 41, high: 52 },
  newBest: {
    probability: 0.58,
    chance: "likely",
    repsNeeded: 5,
    approximate: false,
    estimate: 251,
    best: 248,
  },
  readiness,
};

describe("forecastTiles", () => {
  it("makes three tiles with the board's wording when everything is known", () => {
    expect(forecastTiles(full).map((t) => [t.label, t.value, t.sub])).toEqual([
      ["Session", "46 min", "41 to 52"],
      ["New best", "58%", "needs 5+ reps"],
      ["Readiness", "78", "train as planned"],
    ]);
  });

  it("says the reps are about, not exact, when they depend on the effort you log", () => {
    // The estimate credits a logged effort, so the count assumes the usual one.
    const tiles = forecastTiles({
      ...full,
      newBest: { ...full.newBest!, repsNeeded: 4, approximate: true },
    });
    expect(tiles[1].sub).toBe("needs about 4 reps");
  });

  it("never invents a number: no range, no probability or no history say so in words", () => {
    const tiles = forecastTiles({
      session: { minutes: 45 },
      newBest: {
        probability: null,
        chance: "stretch",
        repsNeeded: 6,
        approximate: false,
        estimate: 251,
        best: 248,
      },
      readiness: null,
    });
    expect(tiles.map((t) => [t.value, t.sub])).toEqual([
      ["45 min", "rough estimate"],
      ["Stretch", "needs 6+ reps"],
    ]);
    const unknown = forecastTiles({
      session: null,
      newBest: {
        probability: null,
        chance: "unknown",
        repsNeeded: 6,
        approximate: false,
        estimate: 251,
        best: 248.4,
      },
      readiness: null,
    });
    expect(unknown.map((t) => [t.value, t.sub])).toEqual([["6+ reps", "beats 248"]]);
  });

  it("leaves out tiles without a value", () => {
    expect(forecastTiles({ session: null, newBest: null, readiness: null })).toEqual([]);
  });
});

describe("ForecastTiles", () => {
  it("shares the row between the tiles it has", () => {
    const { rerender } = render(<ForecastTiles forecast={full} newBestHref="/progress/lift/squat" />);
    expect(screen.getByTestId("forecast-tiles")).toHaveClass("grid-cols-3");
    expect(screen.getByTestId("forecast-new-best").closest("a")).toHaveAttribute("href", "/progress/lift/squat?from=today");

    rerender(<ForecastTiles forecast={{ ...full, readiness: null }} />);
    expect(screen.getByTestId("forecast-tiles")).toHaveClass("grid-cols-2");
    expect(screen.queryByText("Readiness")).toBeNull();

    rerender(<ForecastTiles forecast={{ ...full, readiness: null, newBest: null }} />);
    expect(screen.getByTestId("forecast-tiles")).toHaveClass("grid-cols-1");
  });

  it("links each tile on and puts the evidence icon beside the link, never inside it", () => {
    render(<ForecastTiles forecast={full} newBestHref="/progress/lift/squat?as=goblet" />);
    const link = (testId: string) => screen.getByTestId(testId).closest("a");
    expect(link("forecast-session")).toHaveAttribute("href", "/progress/forecasts");
    expect(link("forecast-readiness")).toHaveAttribute("href", "/readiness?from=today");
    expect(link("forecast-new-best")).toHaveAttribute(
      "href",
      "/progress/lift/squat?as=goblet&from=today"
    );
    for (const ruleId of ["forecast-session-length", "forecast-reps", "readiness-score"]) {
      const icon = document.querySelector(`[data-evidence="${ruleId}"]`);
      expect(icon).not.toBeNull();
      expect(icon!.closest("a")).toBeNull();
    }
  });

  it("does not add from=today twice", () => {
    render(<ForecastTiles forecast={full} newBestHref="/progress/lift/squat?from=today" />);
    expect(screen.getByTestId("forecast-new-best").closest("a")).toHaveAttribute(
      "href",
      "/progress/lift/squat?from=today"
    );
  });

  it("renders nothing, heading included, with no tiles or while loading", () => {
    const { container, rerender } = render(
      <ForecastTiles forecast={{ session: null, newBest: null, readiness: null }} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<ForecastTiles forecast={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ForecastTiles first-load motion", () => {
  const tileOf = (key: string) =>
    screen.getByTestId(`forecast-${key}`).closest("[data-slot=stat-tile]")!.parentElement!;

  it("settles the tiles in one after another on first load only, never on a re-render", () => {
    resetSettled();
    const { rerender, unmount } = render(<ForecastTiles forecast={full} />);
    const tiles = ["session", "new-best", "readiness"].map(tileOf);
    tiles.forEach((tile, i) => {
      expect(tile).toHaveAttribute("data-settle", "true");
      // Only under motion-safe, so reduced motion shows the tiles still.
      expect(tile).toHaveClass("motion-safe:animate-settle-in");
      expect(tile.className).not.toMatch(/(^|\s)animate-/);
      // After the hero's two parts, a step apart; the last starts by 160 ms.
      expect(tile.style.animationDelay).toBe(`${(2 + i) * SETTLE_STEP_MS}ms`);
    });

    // A re-render keeps the same elements, so the animation does not start again.
    rerender(<ForecastTiles forecast={{ ...full, session: { minutes: 47, low: 42, high: 53 } }} />);
    expect(tileOf("session")).toBe(tiles[0]);
    unmount();

    // Coming back to Today later in the session: no motion.
    render(<ForecastTiles forecast={full} />);
    expect(tileOf("session")).not.toHaveAttribute("data-settle");
    expect(tileOf("session").className).not.toContain("animate-settle-in");
  });

  it("still settles in when the forecast arrives after the screen", () => {
    resetSettled();
    const { rerender } = render(<ForecastTiles forecast={undefined} />);
    rerender(<ForecastTiles forecast={full} />);
    expect(tileOf("session")).toHaveAttribute("data-settle", "true");
  });
});
