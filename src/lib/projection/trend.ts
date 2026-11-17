// Straight-line trend through a series of points. Pure.
import { WEEK_MS } from "@/lib/dates";
import type { Point } from "@/lib/metrics/types";

/** A line through fewer points than this says too little to project from. */
export const MIN_TREND_POINTS = 4;

export interface TrendFit {
  /** lbs per week. */
  slopePerWeek: number;
  /** Fitted value at `at` (epoch milliseconds). */
  valueAt(at: number): number;
  /** Standard deviation of the residuals, in lbs. */
  residualSd: number;
  pointsUsed: number;
  /**
   * Standard error of the slope, lbs per week: residualSd / sqrt(timeSumSquares).
   * Few points, or points close together in time, make it large.
   */
  slopeSe: number;
  /** Sum of squared distances of the point times from their mean, in weeks squared. */
  timeSumSquares: number;
  /** Weeks from the earliest point to the latest. */
  spanWeeks: number;
  /** Mean time of the fitted points, epoch milliseconds: where the line is best known. */
  meanTime: number;
  /**
   * Standard deviation of one new result at `at` around the line, given a scatter of
   * `sd` per result (default: `residualSd`): sd x sqrt(1 + 1/n + d^2 / timeSumSquares),
   * with d the weeks between `at` and `meanTime`. It adds the uncertainty of the
   * fitted level and slope to the scatter itself, so it grows away from the data.
   */
  predictionSd(at: number, sd?: number): number;
}

/**
 * Ordinary least-squares line of value on time through the given points (the caller
 * chooses the window; order does not matter; non-finite points are dropped).
 *
 * `residualSd` uses an n-2 denominator (two fitted parameters). Returns null with
 * fewer than MIN_TREND_POINTS points or when every point has the same timestamp,
 * because no slope can be fitted.
 */
export function fitTrend(points: Point[]): TrendFit | null {
  const usable = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  const n = usable.length;
  if (n < MIN_TREND_POINTS) return null;

  // Centre on the mean time so the sums stay small and the intercept is the mean value.
  const meanT = usable.reduce((sum, p) => sum + p.t, 0) / n;
  const meanV = usable.reduce((sum, p) => sum + p.v, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (const p of usable) {
    const x = (p.t - meanT) / WEEK_MS;
    sxx += x * x;
    sxy += x * (p.v - meanV);
  }
  if (sxx === 0) return null;

  const slopePerWeek = sxy / sxx;
  const valueAt = (at: number) => meanV + (slopePerWeek * (at - meanT)) / WEEK_MS;

  let ssr = 0;
  for (const p of usable) {
    const residual = p.v - valueAt(p.t);
    ssr += residual * residual;
  }

  const residualSd = Math.sqrt(ssr / (n - 2));
  const times = usable.map((p) => p.t);
  const predictionSd = (at: number, sd: number = residualSd) => {
    const weeksFromMean = (at - meanT) / WEEK_MS;
    return sd * Math.sqrt(1 + 1 / n + (weeksFromMean * weeksFromMean) / sxx);
  };

  return {
    slopePerWeek,
    valueAt,
    residualSd,
    pointsUsed: n,
    slopeSe: residualSd / Math.sqrt(sxx),
    timeSumSquares: sxx,
    spanWeeks: (Math.max(...times) - Math.min(...times)) / WEEK_MS,
    meanTime: meanT,
    predictionSd,
  };
}
