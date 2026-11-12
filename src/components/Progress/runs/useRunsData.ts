"use client";

import { useMemo, useState } from "react";
import { useActivities, useMetricSource } from "@/hooks";
import { bucket, computeMetric, inRange, summarize } from "@/lib/metrics";
import type { RangeKey, Series, SeriesSummary } from "@/lib/metrics/types";
import {
  activityTotals,
  mean,
  sleepEffortComparison,
  sum,
  type ActivityTotal,
  type SleepEffortComparison,
} from "./runsMath";

export interface RunsData {
  /** Any run ever logged. */
  hasRuns: boolean;
  /** Any readiness log ever recorded. */
  hasReadiness: boolean;
  runCount: number;
  distance: number;
  totalMinutes: number;
  avgEffort: number | null;
  avgPace: number | null;
  paceSummary: SeriesSummary;
  weeklyDistance: Series;
  sleep: Series;
  stress: Series;
  comparison: SleepEffortComparison | null;
  activities: ActivityTotal[];
  /** Any activity logged at all, in any range. */
  hasActivities: boolean;
}

/** Everything the Runs tab shows for a range; undefined while the records load. */
export function useRunsData(range: RangeKey): RunsData | undefined {
  const source = useMetricSource();
  const activities = useActivities();
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    if (!source || !activities) return undefined;
    const ranged = (id: Parameters<typeof computeMetric>[0]) => inRange(computeMetric(id, source), range, now);
    const distance = ranged("runDistance");
    const duration = ranged("runDuration");
    const pace = ranged("runPace");
    return {
      hasRuns: source.runs.length > 0,
      hasReadiness: source.readiness.length > 0,
      runCount: duration.points.length,
      distance: sum(distance),
      totalMinutes: sum(duration),
      avgEffort: mean(ranged("runEffort")),
      avgPace: mean(pace),
      paceSummary: summarize(pace),
      weeklyDistance: bucket(distance, "week", "sum"),
      sleep: ranged("sleep"),
      stress: ranged("stress"),
      comparison: sleepEffortComparison(source.workouts, source.readiness),
      activities: activityTotals(activities, range, now),
      hasActivities: activities.length > 0,
    };
  }, [source, activities, range, now]);
}
