import { useMemo, useState } from "react";
import { computeInsights, type Insight } from "@/lib/insights";
import { useImportedSessions } from "./useImportedSessions";
import { useMappingOverrides } from "./useMappingOverrides";
import { useMetricSource } from "./useMetric";
import { useLeftWorkouts, useUnfinishedWorkout } from "./useWorkouts";

/**
 * Every insight that currently applies, ranked (see `computeInsights`); `undefined`
 * while the underlying records load. Live: recomputed when any of them change.
 * Sessions imported from other apps are passed for the rules that read them (recency,
 * the e1RM trend). `now` is taken once per mount so the list does not shift on every render.
 */
export function useInsights(): Insight[] | undefined {
  const source = useMetricSource();
  const unfinishedWorkout = useUnfinishedWorkout();
  const leftWorkouts = useLeftWorkouts();
  const imported = useImportedSessions();
  const overrides = useMappingOverrides();
  const [now] = useState(() => new Date());

  return useMemo(() => {
    if (
      source === undefined ||
      unfinishedWorkout === undefined ||
      leftWorkouts === undefined ||
      imported === undefined
    ) {
      return undefined;
    }
    return computeInsights({ ...source, unfinishedWorkout, leftWorkouts, imported, overrides, now });
  }, [source, unfinishedWorkout, leftWorkouts, imported, overrides, now]);
}
