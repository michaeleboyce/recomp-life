// The metrics layer: every trend the app shows is a Series produced by a registered
// metric from plain records. Pure: no React, no database, no clock.
import { bodyweight, bodyweight7d, lossRate } from "./body";
import { DAY_MS, count, mean, monthStartMs, weekStartMs } from "./helpers";
import { amrapReps, avgRpe, e1rm, liftVolume, workingWeight } from "./lift";
import { sleep, stress } from "./readiness";
import { runDistance, runDuration, runEffort, runPace } from "./runs";
import { sessionsPerWeek, tonnage, weeklySets } from "./training";
import type {
  MetricDef,
  MetricId,
  MetricParams,
  MetricSource,
  Point,
  RangeKey,
  Series,
  SeriesSummary,
} from "./types";

export * from "./types";
export { SLEEP_LEVELS, STRESS_LEVELS } from "./readiness";

/** Every metric the app knows, keyed by id. Adding a trend means adding an entry here. */
export const METRICS: Record<MetricId, MetricDef> = {
  e1rm,
  workingWeight,
  amrapReps,
  avgRpe,
  liftVolume,
  weeklySets,
  bodyweight,
  bodyweight7d,
  lossRate,
  sessionsPerWeek,
  tonnage,
  runDistance,
  runDuration,
  runPace,
  runEffort,
  sleep,
  stress,
};

export function getMetric(id: MetricId): MetricDef {
  const def = Object.prototype.hasOwnProperty.call(METRICS, id) ? METRICS[id] : undefined;
  if (!def) throw new Error(`Unknown metric: ${String(id)}`);
  return def;
}

/** Convenience for `getMetric(id).compute(source, params)`. */
export function computeMetric(
  id: MetricId,
  source: MetricSource,
  params: MetricParams = {}
): Series {
  return getMetric(id).compute(source, params);
}

const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = { "4w": 28, "3m": 91, "1y": 365 };

/** The points of `series` inside the range ending at `now`; "all" returns it unchanged. */
export function inRange(series: Series, range: RangeKey, now: number): Series {
  if (range === "all") return series;
  const from = now - RANGE_DAYS[range] * DAY_MS;
  return { ...series, points: series.points.filter((p) => p.t >= from && p.t <= now) };
}

/** First and latest point, the change between them, and the extremes (ties: earliest). */
export function summarize(series: Series): SeriesSummary {
  const points = series.points;
  if (points.length === 0) {
    return { first: null, latest: null, change: null, changePct: null, min: null, max: null };
  }
  const first = points[0];
  const latest = points[points.length - 1];
  let min = first;
  let max = first;
  for (const p of points) {
    if (p.v < min.v) min = p;
    if (p.v > max.v) max = p;
  }
  const change = points.length < 2 ? null : latest.v - first.v;
  const changePct = change === null || first.v === 0 ? null : change / first.v;
  return { first, latest, change, changePct, min, max };
}

/**
 * Collapses a series to one point per calendar week (Monday start) or month.
 * "sum" adds values, "mean" averages them, "last" keeps the latest value in the bucket.
 * Each point's `t` is the start of its bucket. Empty buckets are omitted.
 */
export function bucket(
  series: Series,
  period: "week" | "month",
  aggregate: "sum" | "mean" | "last"
): Series {
  const startOf = period === "week" ? weekStartMs : monthStartMs;
  const buckets = new Map<number, Point[]>();
  for (const p of [...series.points].sort((a, b) => a.t - b.t)) {
    const key = startOf(p.t);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }
  const points: Point[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, members]) => {
      if (aggregate === "last") {
        // The surviving point keeps its label and drill-down reference.
        return { ...members[members.length - 1], t };
      }
      const values = members.map((m) => m.v);
      const v = aggregate === "sum" ? values.reduce((a, b) => a + b, 0) : mean(values);
      return { t, v, label: count(members.length, "point") };
    });
  return { ...series, points };
}
