"use client";

import { useMemo, useState } from "react";
import { useMetricSource } from "@/hooks";
import type { RangeKey } from "@/lib/metrics/types";
import { liftMetrics, liftStats, liftTeaser, nextT1Opportunity } from "./liftSeries";
import { liftSessions } from "./sessions";

/**
 * What the lift page shows for a program lift over `range`: its e1RM and other
 * series, stats, next T1, projection teaser and sessions. Undefined while loading.
 */
export function useLiftView(exerciseId: string, range: RangeKey) {
  const source = useMetricSource();
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    if (!source) return undefined;
    const metrics = liftMetrics(source, exerciseId, range, now);
    const liftState = source.liftStates.find((s) => s.exerciseId === exerciseId);
    const best = metrics.e1rm.full.points.reduce<number | null>(
      (max, p) => (max === null || p.v > max ? p.v : max),
      null
    );
    return {
      metrics,
      stats: liftStats(metrics),
      next: nextT1Opportunity(exerciseId, liftState, best),
      // The whole history, so the figure matches the projection screen and does not
      // move with the range tab.
      teaser: liftTeaser(source, exerciseId, metrics.e1rm.full.points, now),
      sessions: liftSessions(source.workouts, source.e1rms, exerciseId),
    };
  }, [source, exerciseId, range, now]);
}

export type LiftView = NonNullable<ReturnType<typeof useLiftView>>;
