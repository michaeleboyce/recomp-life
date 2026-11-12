// Contract stubs. The `metrics` package implements these.
import type {
  MetricId,
  MetricParams,
  MetricSource,
  RangeKey,
  Series,
  SeriesSummary,
} from "@/lib/metrics/types";
import type { ReadinessLog } from "@/types";

const NOT_IMPLEMENTED = "not implemented: src/hooks/useMetric contract stub";

/** Readiness (sleep and stress) logs, oldest first; `undefined` while loading. */
export function useReadinessLogs(): ReadinessLog[] | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Everything the metrics read, assembled from the record hooks; `undefined` until
 * every underlying query has loaded. The object identity is stable between renders
 * when no underlying data changed.
 */
export function useMetricSource(): MetricSource | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

export interface MetricResult {
  /** The full series, before range filtering. */
  full: Series;
  /** The series limited to `range`. */
  series: Series;
  summary: SeriesSummary;
}

/** One metric, limited to a range (default "all"); `undefined` while loading. */
export function useMetric(
  id: MetricId,
  params?: MetricParams,
  range?: RangeKey
): MetricResult | undefined {
  void id;
  void params;
  void range;
  throw new Error(NOT_IMPLEMENTED);
}
