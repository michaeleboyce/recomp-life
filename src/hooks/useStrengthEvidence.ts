import { useMemo } from "react";
import type { StrengthSet } from "@/lib/strength";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { useImportedSessions } from "./useImportedSessions";
import { useMappingOverrides } from "./useMappingOverrides";
import { useCompletedWorkouts } from "./useWorkouts";

/**
 * Every set as strength evidence: the finished workouts' and the imported sessions'
 * (`strengthEvidenceOf`, the same function the ledger's `strengthSetsFrom` plans with).
 * What every plan reads (the next workout on Today, Configure, the active workout, the
 * home lift page, the Strength tab's gym debt): the pooled estimate, the learned ratios,
 * a first home weight (H3) and re-entry (H6). Also what the muscle strength index and
 * the starting-weight suggestions read.
 *
 * Imported names are mapped as of now (the remembered choices win). The same array
 * while nothing it reads changes, so the estimates worked out from it are kept; the
 * imported part is worked out once per list of sessions. `undefined` while loading.
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
