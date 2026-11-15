"use client";

import { useMemo, useState } from "react";
import { useActivities, useMetricSource } from "@/hooks";
import { bucket, computeMetric, inRange } from "@/lib/metrics";
import type { RangeKey, Series } from "@/lib/metrics/types";
import {
  activityTotals,
  mean,
  paceOverall,
  sum,
  type ActivityTotal,
} from "./runsMath";

export interface RunsData {
  /** Any run ever logged. */
  hasRuns: boolean;
  runCount: number;
  distance: number;
  totalMinutes: number;
  avgEffort: number | null;
  /** Minutes per mile over the range: total minutes / total miles of runs with a distance. */
  avgPace: number | null;
  /** Later half of the range's runs against the earlier half, same measure; negative is faster. */
  paceChange: number | null;
  weeklyDistance: Series;
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
    const pace = paceOverall(distance, duration);
    return {
      hasRuns: source.runs.length > 0,
      runCount: duration.points.length,
      distance: sum(distance),
      totalMinutes: sum(duration),
      avgEffort: mean(ranged("runEffort")),
      avgPace: pace.average,
      paceChange: pace.change,
      weeklyDistance: bucket(distance, "week", "sum"),
      activities: activityTotals(activities, range, now),
      hasActivities: activities.length > 0,
    };
  }, [source, activities, range, now]);
}
