"use client";

import { useMemo, useState } from "react";
import { useMetricSource } from "@/hooks";
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import type { MetricId, RangeKey, Series, SeriesSummary } from "@/lib/metrics/types";

export interface HealthTrend {
  id: MetricId;
  series: Series;
  summary: SeriesSummary;
  /** Any value at all, in any range. */
  hasAny: boolean;
}

/** The given Apple Health metrics for a range; undefined while the records load. */
export function useHealthTrends(
  ids: readonly MetricId[],
  range: RangeKey
): HealthTrend[] | undefined {
  const source = useMetricSource();
  const [now] = useState(() => Date.now());
  // Callers pass a constant list; key on its contents so a fresh array is harmless.
  const key = ids.join(",");

  return useMemo(() => {
    if (!source) return undefined;
    return (key ? (key.split(",") as MetricId[]) : []).map((id) => {
      const full = computeMetric(id, source);
      const series = inRange(full, range, now);
      return { id, series, summary: summarize(series), hasAny: full.points.length > 0 };
    });
  }, [source, key, range, now]);
}
