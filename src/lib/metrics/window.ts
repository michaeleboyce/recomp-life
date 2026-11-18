// A chart's time window: a preset range ending today, or a span picked by zooming.
// Pure. One notion of the window for a page: the chart and the stats beside it both
// read `windowBounds`.
import { DAY_MS } from "@/lib/dates";
import type { Point, RangeKey, Series } from "./types";

/** Days in each preset; "all" has no start. */
export const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = {
  "4w": 28,
  "3m": 91,
  "6m": 182,
  "1y": 365,
  "2y": 730,
};

/** Every preset, shortest first. */
export const ALL_RANGE_KEYS: readonly RangeKey[] = ["4w", "3m", "6m", "1y", "2y", "all"];

/** A span picked by zooming, epoch ms. */
export interface WindowSpan {
  from: number;
  to: number;
}

/** The preset in force and, while zoomed, the span that replaces it. */
export interface ChartWindow {
  range: RangeKey;
  span?: WindowSpan | null;
}

/** A range key alone is the window with no zoom. */
export function asWindow(window: RangeKey | ChartWindow): ChartWindow {
  return typeof window === "string" ? { range: window } : window;
}

/**
 * The instants the window covers: the zoomed span when there is one, else the preset
 * ending at `now` ("all" starts at minus infinity).
 */
export function windowBounds(window: RangeKey | ChartWindow, now: number): WindowSpan {
  const w = asWindow(window);
  if (w.span && w.span.to > w.span.from) return { from: w.span.from, to: w.span.to };
  if (w.range === "all") return { from: -Infinity, to: now };
  return { from: now - RANGE_DAYS[w.range] * DAY_MS, to: now };
}

/** The points inside the window. */
export function pointsInWindow<T extends Pick<Point, "t">>(points: readonly T[], window: RangeKey | ChartWindow, now: number): T[] {
  const { from, to } = windowBounds(window, now);
  return points.filter((p) => p.t >= from && p.t <= to);
}

/** The series cut to the window; "all" without a zoom returns it unchanged. */
export function inWindow(series: Series, window: RangeKey | ChartWindow, now: number): Series {
  const w = asWindow(window);
  if (w.range === "all" && !w.span) return series;
  return { ...series, points: pointsInWindow(series.points, w, now) };
}

/** True when the zoomed span is in force. */
export function isZoomed(window: RangeKey | ChartWindow): boolean {
  const w = asWindow(window);
  return !!w.span && w.span.to > w.span.from;
}
