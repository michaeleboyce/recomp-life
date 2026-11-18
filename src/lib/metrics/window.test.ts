import { describe, expect, it } from "vitest";
import { DAY_MS } from "@/lib/dates";
import { inRange } from "./index";
import { ALL_RANGE_KEYS, RANGE_DAYS, asWindow, inWindow, isZoomed, pointsInWindow, windowBounds } from "./window";
import type { Series } from "./types";

const NOW = Date.UTC(2026, 10, 17);
const series: Series = {
  metric: "e1rm",
  params: {},
  unit: "lbs",
  better: "up",
  points: [800, 400, 200, 100, 20, 1].map((d, i) => ({ t: NOW - d * DAY_MS, v: i })),
};

describe("chart window", () => {
  it("has six presets, shortest first", () => {
    expect(ALL_RANGE_KEYS).toEqual(["4w", "3m", "6m", "1y", "2y", "all"]);
    expect(RANGE_DAYS["6m"]).toBe(182);
    expect(RANGE_DAYS["2y"]).toBe(730);
  });

  it("cuts a series to each preset ending now", () => {
    expect(inRange(series, "6m", NOW).points.map((p) => p.v)).toEqual([3, 4, 5]);
    expect(inRange(series, "2y", NOW).points.map((p) => p.v)).toEqual([1, 2, 3, 4, 5]);
    expect(inRange(series, "all", NOW)).toBe(series);
  });

  it("uses a zoomed span instead of the preset", () => {
    const span = { from: NOW - 450 * DAY_MS, to: NOW - 50 * DAY_MS };
    expect(isZoomed({ range: "3m", span })).toBe(true);
    expect(windowBounds({ range: "3m", span }, NOW)).toEqual(span);
    expect(inWindow(series, { range: "all", span }, NOW).points.map((p) => p.v)).toEqual([1, 2, 3]);
    expect(pointsInWindow(series.points, { range: "3m", span }, NOW)).toHaveLength(3);
  });

  it("ignores an empty span", () => {
    expect(isZoomed({ range: "4w", span: { from: 5, to: 5 } })).toBe(false);
    expect(windowBounds({ range: "4w", span: { from: 5, to: 5 } }, NOW).from).toBe(NOW - 28 * DAY_MS);
    expect(asWindow("1y")).toEqual({ range: "1y" });
    expect(windowBounds("all", NOW).from).toBe(-Infinity);
  });
});
