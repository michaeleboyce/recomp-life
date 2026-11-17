import { useMemo } from "react";
import type { StrengthSet } from "@/lib/strength";
import { targetStrengthSets } from "@/lib/workout/variant";
import { strengthSetsOf } from "@/lib/workout/strength";
import { useVariantStates } from "./useVariantStates";
import { useCompletedWorkouts } from "./useWorkouts";

/**
 * Every set of the finished workouts as strength evidence (`strengthSetsOf`), plus each
 * home weight set by hand and not lifted yet as one provisional set
 * (`targetStrengthSets`, counted for less by the pooled estimate): what the plan seeds a
 * first home weight from (H3) and works re-entry out from (H6). The same array while
 * the workouts and home states are unchanged, so the estimates worked out from it are
 * kept; a change to the home states alone does not read every workout again.
 * `undefined` while loading.
 *
 * @evidence target-evidence
 */
export function useStrengthSets(): StrengthSet[] | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const variantStates = useVariantStates();
  const logged = useMemo(
    () => (completedWorkouts === undefined ? undefined : strengthSetsOf(completedWorkouts)),
    [completedWorkouts]
  );
  return useMemo(() => {
    if (logged === undefined || variantStates === undefined) return undefined;
    const targets = targetStrengthSets(variantStates);
    return targets.length > 0 ? [...logged, ...targets] : logged;
  }, [logged, variantStates]);
}
