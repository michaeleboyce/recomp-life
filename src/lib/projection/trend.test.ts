import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import { fitTrend } from "./index";
import { WEEK_MS } from "@/lib/dates";

const T0 = new Date(2026, 0, 5, 12).getTime();

function line(n: number, start: number, perWeek: number, stepWeeks = 1): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    t: T0 + i * stepWeeks * WEEK_MS,
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
    expect(fit.valueAt(T0 + 10 * WEEK_MS)).toBeCloseTo(225, 9);
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
    const points = values.map((v, i) => ({ t: T0 + i * WEEK_MS, v }));
    const fit = fitTrend(points)!;
    const sse = (slope: number, shift: number) =>
      points.reduce((sum, p) => {
        const weeks = (p.t - T0) / WEEK_MS;
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
    const points = [...line(3, 200, 2), { t: T0 + 9 * WEEK_MS, v: NaN }];
    expect(fitTrend(points)).toBeNull();
  });
});

describe("fitTrend: how sure the line is away from the data", () => {
  // Four weekly points: mean time 1.5 weeks in, sum of squares 5 weeks squared.
  const noisy = line(4, 200, 2).map((p, i) => ({ ...p, v: p.v + [1, -1, -1, 1][i] }));
  const fit = fitTrend(noisy)!;

  it("reports the mean time of the points", () => {
    expect(fit.meanTime).toBeCloseTo(T0 + 1.5 * WEEK_MS, 3);
    expect(fit.timeSumSquares).toBeCloseTo(5, 9);
  });

  it("gives the scatter of one new result: sd x sqrt(1 + 1/n + d^2 / Sxx)", () => {
    expect(fit.residualSd).toBeGreaterThan(0);
    // At the mean time only the level is uncertain.
    expect(fit.predictionSd(fit.meanTime)).toBeCloseTo(fit.residualSd * Math.sqrt(1 + 1 / 4), 9);
    // One step past the last point: d = 2.5 weeks.
    expect(fit.predictionSd(T0 + 4 * WEEK_MS)).toBeCloseTo(
      fit.residualSd * Math.sqrt(1 + 1 / 4 + 6.25 / 5),
      9
    );
  });

  it("grows the further from the data it is read, the same either side", () => {
    const near = fit.predictionSd(T0 + 4 * WEEK_MS);
    const far = fit.predictionSd(T0 + 8 * WEEK_MS);
    expect(far).toBeGreaterThan(near);
    expect(fit.predictionSd(fit.meanTime - 3 * WEEK_MS)).toBeCloseTo(
      fit.predictionSd(fit.meanTime + 3 * WEEK_MS),
      9
    );
  });

  it("takes a scatter to use in place of the residual one", () => {
    expect(fit.predictionSd(fit.meanTime, 10)).toBeCloseTo(10 * Math.sqrt(1.25), 9);
    const exact = fitTrend(line(4, 200, 2))!;
    expect(exact.predictionSd(T0 + 4 * WEEK_MS)).toBeCloseTo(0, 9);
    expect(exact.predictionSd(T0 + 4 * WEEK_MS, 6)).toBeGreaterThan(6);
  });

  it("is tighter with more points over a longer stretch", () => {
    const long = fitTrend(line(12, 200, 2))!;
    const short = fitTrend(line(4, 200, 2))!;
    const oneStepOn = (f: typeof long, n: number) => f.predictionSd(T0 + n * WEEK_MS, 5);
    expect(oneStepOn(long, 12)).toBeLessThan(oneStepOn(short, 4));
  });
});
