import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TodayForecast } from "@/hooks";
import { ForecastTiles, forecastTiles } from "./ForecastTiles";

const readiness = {
  score: 78,
  usual: 72,
  contributions: [],
  suggestSkippingAccessories: false,
};

const full: TodayForecast = {
  session: { minutes: 46, low: 41, high: 52 },
  newBest: { probability: 0.58, chance: "likely", repsNeeded: 5, estimate: 251, best: 248 },
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

  it("never invents a number: no range, no probability or no history say so in words", () => {
    const tiles = forecastTiles({
      session: { minutes: 45 },
      newBest: { probability: null, chance: "stretch", repsNeeded: 6, estimate: 251, best: 248 },
      readiness: null,
    });
    expect(tiles.map((t) => [t.value, t.sub])).toEqual([
      ["45 min", "rough estimate"],
      ["Stretch", "needs 6+ reps"],
    ]);
    const unknown = forecastTiles({
      session: null,
      newBest: { probability: null, chance: "unknown", repsNeeded: 6, estimate: 251, best: 248.4 },
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
    expect(screen.getByTestId("forecast-new-best").closest("a")).toHaveAttribute("href", "/progress/lift/squat");

    rerender(<ForecastTiles forecast={{ ...full, readiness: null }} />);
    expect(screen.getByTestId("forecast-tiles")).toHaveClass("grid-cols-2");
    expect(screen.queryByText("Readiness")).toBeNull();

    rerender(<ForecastTiles forecast={{ ...full, readiness: null, newBest: null }} />);
    expect(screen.getByTestId("forecast-tiles")).toHaveClass("grid-cols-1");
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
