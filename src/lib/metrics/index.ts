// Contract stubs for the metrics layer. The `metrics` package implements these and may
// split the definitions into files under src/lib/metrics/, keeping these exports.
import type {
  MetricDef,
  MetricId,
  MetricParams,
  MetricSource,
  RangeKey,
  Series,
  SeriesSummary,
} from "./types";

export * from "./types";

const NOT_IMPLEMENTED = "not implemented: src/lib/metrics contract stub";

/** Every metric the app knows, keyed by id. Adding a trend means adding an entry here. */
export const METRICS: Record<MetricId, MetricDef> = {} as Record<MetricId, MetricDef>;

export function getMetric(id: MetricId): MetricDef {
  void id;
  throw new Error(NOT_IMPLEMENTED);
}

/** Convenience for `getMetric(id).compute(source, params)`. */
export function computeMetric(
  id: MetricId,
  source: MetricSource,
  params: MetricParams = {}
): Series {
  void id;
  void source;
  void params;
  throw new Error(NOT_IMPLEMENTED);
}

/** The points of `series` inside the range ending at `now`; "all" returns it unchanged. */
export function inRange(series: Series, range: RangeKey, now: number): Series {
  void series;
  void range;
  void now;
  throw new Error(NOT_IMPLEMENTED);
}

export function summarize(series: Series): SeriesSummary {
  void series;
  throw new Error(NOT_IMPLEMENTED);
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
  void series;
  void period;
  void aggregate;
  throw new Error(NOT_IMPLEMENTED);
}
