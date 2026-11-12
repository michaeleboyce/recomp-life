// Straight-line trend through a series of points. Pure.
import type { Point } from "@/lib/metrics/types";

export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

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
    const x = (p.t - meanT) / MS_PER_WEEK;
    sxx += x * x;
    sxy += x * (p.v - meanV);
  }
  if (sxx === 0) return null;

  const slopePerWeek = sxy / sxx;
  const valueAt = (at: number) => meanV + (slopePerWeek * (at - meanT)) / MS_PER_WEEK;

  let ssr = 0;
  for (const p of usable) {
    const residual = p.v - valueAt(p.t);
    ssr += residual * residual;
  }

  return {
    slopePerWeek,
    valueAt,
    residualSd: Math.sqrt(ssr / (n - 2)),
    pointsUsed: n,
  };
}
