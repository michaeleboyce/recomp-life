import { useMemo } from "react";
import type { StrengthSet } from "@/lib/strength";
import { strengthSetsOf } from "@/lib/workout/strength";
import { useCompletedWorkouts } from "./useWorkouts";

/**
 * Every set of the finished workouts as strength evidence (`strengthSetsOf`): what the
 * plan seeds a first home weight from (H3) and works re-entry out from (H6). The same
 * array while the workouts are unchanged, so the estimates worked out from it are kept.
 * `undefined` while loading.
 */
export function useStrengthSets(): StrengthSet[] | undefined {
  const completedWorkouts = useCompletedWorkouts();
  return useMemo(
    () => (completedWorkouts === undefined ? undefined : strengthSetsOf(completedWorkouts)),
    [completedWorkouts]
  );
}
