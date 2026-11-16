import { useMemo } from "react";
import type { StrengthSet } from "@/lib/strength";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { useImportedSessions } from "./useImportedSessions";
import { useCompletedWorkouts } from "./useWorkouts";

/**
 * Every set as strength evidence: the finished workouts' and the imported sessions'
 * (`strengthEvidenceOf`), for the strength estimate, the learned ratios, the muscle
 * strength index and starting-weight suggestions. Planning reads `useStrengthSets`
 * (the log alone) instead, so an import never moves a planned weight by itself.
 * The same array while neither list changes. `undefined` while loading.
 */
export function useStrengthEvidence(): StrengthSet[] | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const imported = useImportedSessions();
  return useMemo(
    () =>
      completedWorkouts === undefined || imported === undefined
        ? undefined
        : strengthEvidenceOf(completedWorkouts, imported),
    [completedWorkouts, imported]
  );
}
