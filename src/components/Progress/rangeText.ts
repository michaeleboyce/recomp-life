// Wording for a change over a span of points. Pure.
import type { Point } from "@/lib/metrics/types";

const WEEK_MS = 7 * 86_400_000;

/** "in 8 wk" for the span from the first to the last point (at least 1 week). */
export function rangeSuffix(points: Point[]): string {
  if (points.length < 2) return "";
  const weeks = Math.max(1, Math.round((points[points.length - 1].t - points[0].t) / WEEK_MS));
  return `in ${weeks} wk`;
}
