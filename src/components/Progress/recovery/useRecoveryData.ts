"use client";

import { useMemo, useState } from "react";
import { useMetricSource } from "@/hooks";
import { computeMetric, inRange } from "@/lib/metrics";
import type { MetricId, RangeKey, Series } from "@/lib/metrics/types";
import { useHealthTrends, type HealthTrend } from "../health/useHealthTrends";
import { sleepEffortComparison, type SleepEffortComparison } from "../runs/runsMath";

/** The Apple Health trends shown on the Recovery tab, in display order. */
export const RECOVERY_TRENDS: readonly MetricId[] = ["sleepHours", "restingHr", "hrv"];

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
  const health = useHealthTrends(RECOVERY_TRENDS, range);
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    if (!source || !health) return undefined;
    const ranged = (id: MetricId) => inRange(computeMetric(id, source), range, now);
    return {
      hasReadiness: source.readiness.length > 0,
      hasHealth: health.some((trend) => trend.hasAny),
      health,
      sleep: ranged("sleep"),
      stress: ranged("stress"),
      comparison: sleepEffortComparison(source.workouts, source.readiness),
    };
  }, [source, health, range, now]);
}
