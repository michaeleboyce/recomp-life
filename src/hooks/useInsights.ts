import { useMemo, useState } from "react";
import { computeInsights, type Insight } from "@/lib/insights";
import { useMetricSource } from "./useMetric";
import { useUnfinishedWorkout } from "./useWorkouts";

/**
 * Every insight that currently applies, ranked (see `computeInsights`); `undefined`
 * while the underlying records load. Live: recomputed when any of them change.
 * `now` is taken once per mount so the list does not shift on every render.
 */
export function useInsights(): Insight[] | undefined {
  const source = useMetricSource();
  const unfinishedWorkout = useUnfinishedWorkout();
  const [now] = useState(() => new Date());

  return useMemo(() => {
    if (source === undefined || unfinishedWorkout === undefined) return undefined;
    return computeInsights({ ...source, unfinishedWorkout, now });
  }, [source, unfinishedWorkout, now]);
}
