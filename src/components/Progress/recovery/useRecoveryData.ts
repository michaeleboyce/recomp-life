"use client";

import { useMemo, useState } from "react";
import { useMetricSource } from "@/hooks";
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import type { MetricId, RangeKey, Series, SeriesSummary } from "@/lib/metrics/types";
import { sleepEffortComparison, type SleepEffortComparison } from "../runs/runsMath";

/** The Apple Health trends shown on the Recovery tab, in display order. */
export const HEALTH_TRENDS = ["sleepHours", "restingHr", "hrv"] as const satisfies readonly MetricId[];
export type HealthTrendId = (typeof HEALTH_TRENDS)[number];

export interface HealthTrend {
  id: HealthTrendId;
  series: Series;
  summary: SeriesSummary;
  /** Any value at all, in any range. */
  hasAny: boolean;
}

export interface RecoveryData {
  /** Any readiness check-in ever recorded. */
  hasReadiness: boolean;
  /** Any Apple Health value for the trends above. */
  hasHealth: boolean;
  health: HealthTrend[];
  sleep: Series;
  stress: Series;
  comparison: SleepEffortComparison | null;
}

/** Everything the Recovery tab shows for a range; undefined while the records load. */
export function useRecoveryData(range: RangeKey): RecoveryData | undefined {
  const source = useMetricSource();
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    if (!source) return undefined;
    const ranged = (id: MetricId) => inRange(computeMetric(id, source), range, now);
    const health = HEALTH_TRENDS.map((id) => {
      const full = computeMetric(id, source);
      const series = inRange(full, range, now);
      return { id, series, summary: summarize(series), hasAny: full.points.length > 0 };
    });
    return {
      hasReadiness: source.readiness.length > 0,
      hasHealth: health.some((trend) => trend.hasAny),
      health,
      sleep: ranged("sleep"),
      stress: ranged("stress"),
      comparison: sleepEffortComparison(source.workouts, source.readiness),
    };
  }, [source, range, now]);
}
