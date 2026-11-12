import { describe, expect, it } from "vitest";
import { niceScale, sparklineCoords, timeTicks, formatShortDate } from "./scale";

describe("niceScale", () => {
  it("pads the range and does not start at zero for a weight series", () => {
    const { domain, ticks } = niceScale([192, 237]);
    expect(domain[0]).toBeGreaterThan(150);
    expect(domain[0]).toBeLessThan(192);
    expect(domain[1]).toBeGreaterThan(237);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
  });

  it("uses clean steps", () => {
    const { ticks } = niceScale([731, 792]);
    const step = ticks[1] - ticks[0];
    expect([5, 10, 20, 25, 50]).toContain(step);
  });

  it("gives a flat or single value a visible range", () => {
    const { domain, ticks } = niceScale([180]);
    expect(domain[0]).toBeLessThan(180);
    expect(domain[1]).toBeGreaterThan(180);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("handles small fractional values such as a loss rate", () => {
    const { domain, ticks } = niceScale([-1.4, -0.2]);
    expect(domain[0]).toBeLessThanOrEqual(-1.4);
    expect(domain[1]).toBeGreaterThanOrEqual(-0.2);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(4);
  });

  it("returns a default domain when there are no values", () => {
    expect(niceScale([]).domain).toEqual([0, 1]);
  });
});

describe("timeTicks", () => {
  it("returns first, middle and last", () => {
    expect(timeTicks(0, 100)).toEqual([0, 50, 100]);
  });
  it("returns one tick for a single instant", () => {
    expect(timeTicks(5, 5)).toEqual([5]);
  });
});

describe("formatShortDate", () => {
  it("formats month and day", () => {
    expect(formatShortDate(new Date(2026, 9, 26).getTime())).toBe("Oct 26");
  });
});

describe("sparklineCoords", () => {
  it("maps min to the bottom and max to the top of the box, inset by the stroke", () => {
    const pts = sparklineCoords([10, 20, 15], 64, 24, 1);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 1, y: 23 });
    expect(pts[1]).toEqual({ x: 32, y: 1 });
    expect(pts[2]).toEqual({ x: 63, y: 12 });
  });

  it("centres a single point", () => {
    expect(sparklineCoords([5], 64, 24, 1)).toEqual([{ x: 32, y: 12 }]);
  });

  it("draws a flat series along the middle", () => {
    const pts = sparklineCoords([7, 7, 7, 7], 64, 24, 1);
    expect(pts.every((p) => p.y === 12)).toBe(true);
    expect(pts[0].x).toBe(1);
    expect(pts[3].x).toBe(63);
  });

  it("returns nothing for no values", () => {
    expect(sparklineCoords([], 64, 24, 1)).toEqual([]);
  });
});
