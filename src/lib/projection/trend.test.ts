import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import { fitTrend } from "./index";
import { MS_PER_WEEK } from "./trend";

const T0 = new Date(2026, 0, 5, 12).getTime();

function line(n: number, start: number, perWeek: number, stepWeeks = 1): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    t: T0 + i * stepWeeks * MS_PER_WEEK,
    v: start + perWeek * i * stepWeeks,
  }));
}

describe("fitTrend", () => {
  it("recovers an exact line with zero residual", () => {
    const fit = fitTrend(line(8, 200, 2.5))!;
    expect(fit.slopePerWeek).toBeCloseTo(2.5, 9);
    expect(fit.residualSd).toBeCloseTo(0, 9);
    expect(fit.pointsUsed).toBe(8);
    expect(fit.valueAt(T0)).toBeCloseTo(200, 9);
    expect(fit.valueAt(T0 + 10 * MS_PER_WEEK)).toBeCloseTo(225, 9);
  });

  it("does not depend on the order of the points", () => {
    const points = line(6, 180, -1.5, 0.5);
    const shuffled = [points[3], points[0], points[5], points[1], points[4], points[2]];
    const a = fitTrend(points)!;
    const b = fitTrend(shuffled)!;
    expect(b.slopePerWeek).toBeCloseTo(a.slopePerWeek, 9);
    expect(b.valueAt(T0)).toBeCloseTo(a.valueAt(T0), 9);
  });

  it("fits noisy data: slope near the truth, residual SD with an n-2 denominator", () => {
    const noise = [3, -3, 3, -3, 3, -3, 3, -3];
    const points = line(8, 200, 2).map((p, i) => ({ ...p, v: p.v + noise[i] }));
    const fit = fitTrend(points)!;
    expect(fit.slopePerWeek).toBeGreaterThan(1);
    expect(fit.slopePerWeek).toBeLessThan(3);

    const ssr = points.reduce((sum, p) => sum + (p.v - fit.valueAt(p.t)) ** 2, 0);
    expect(fit.residualSd).toBeCloseTo(Math.sqrt(ssr / (points.length - 2)), 9);
    expect(fit.residualSd).toBeGreaterThan(2);
    expect(fit.residualSd).toBeLessThan(4.5);
  });

  it("is the least-squares line: nudging slope or level never lowers the squared error", () => {
    const values = [201, 207, 204, 212, 209, 218, 214];
    const points = values.map((v, i) => ({ t: T0 + i * MS_PER_WEEK, v }));
    const fit = fitTrend(points)!;
    const sse = (slope: number, shift: number) =>
      points.reduce((sum, p) => {
        const weeks = (p.t - T0) / MS_PER_WEEK;
        const predicted = fit.valueAt(T0) + shift + slope * weeks;
        return sum + (p.v - predicted) ** 2;
      }, 0);
    const best = sse(fit.slopePerWeek, 0);
    for (const d of [-0.2, 0.2]) {
      expect(sse(fit.slopePerWeek + d, 0)).toBeGreaterThan(best);
      expect(sse(fit.slopePerWeek, d)).toBeGreaterThan(best);
    }
  });

  it("is null under four points", () => {
    expect(fitTrend([])).toBeNull();
    expect(fitTrend(line(3, 200, 2))).toBeNull();
    expect(fitTrend(line(4, 200, 2))).not.toBeNull();
  });

  it("is null when every point has the same timestamp", () => {
    expect(fitTrend([200, 205, 210, 215].map((v) => ({ t: T0, v })))).toBeNull();
  });

  it("ignores non-finite points when counting", () => {
    const points = [...line(3, 200, 2), { t: T0 + 9 * MS_PER_WEEK, v: NaN }];
    expect(fitTrend(points)).toBeNull();
  });
});
