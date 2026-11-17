import { useMemo } from "react";
import type { StrengthSet } from "@/lib/strength";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { useImportedSessions } from "./useImportedSessions";
import { useMappingOverrides } from "./useMappingOverrides";
import { useCompletedWorkouts } from "./useWorkouts";

/**
 * Every set as strength evidence: the finished workouts' and the imported sessions'
 * (`strengthEvidenceOf`), for what the app shows about strength (the muscle strength
 * index, `useMuscleStrength`) and for starting-weight suggestions. Planning, and the
 * estimates that explain a planned weight (seeding, re-entry, the "why" trace), read
 * `useStrengthSets` (the log alone) instead, so an import never moves a planned weight
 * by itself.
 * Imported names are mapped as of now (the remembered choices win). The same array
 * while nothing it reads changes. `undefined` while loading.
 */
export function useStrengthEvidence(): StrengthSet[] | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const imported = useImportedSessions();
  const overrides = useMappingOverrides();
  return useMemo(
    () =>
      completedWorkouts === undefined || imported === undefined
        ? undefined
        : strengthEvidenceOf(completedWorkouts, imported, overrides),
    [completedWorkouts, imported, overrides]
  );
}
