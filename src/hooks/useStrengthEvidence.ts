import { useMemo } from "react";
import type { StrengthSet } from "@/lib/strength";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { targetStrengthSets } from "@/lib/workout/variant";
import { useImportedSessions } from "./useImportedSessions";
import { useMappingOverrides } from "./useMappingOverrides";
import { useVariantStates } from "./useVariantStates";
import { useCompletedWorkouts } from "./useWorkouts";

/**
 * Every set as strength evidence: the finished workouts' and the imported sessions'
 * (`strengthEvidenceOf`, the same function the ledger's `strengthSetsFrom` plans with),
 * plus each home weight set by hand and not lifted yet as one provisional set
 * (`targetStrengthSets`, which only the pooled estimate reads, at reduced weight).
 * What every plan reads (the next workout on Today, Configure, the active workout, the
 * exercise pages, the Strength tab's gym debt): the pooled estimate, the learned ratios,
 * a first home weight (H3) and re-entry (H6). Also what the muscle strength index and
 * the starting-weight suggestions read; provisional sets give neither an estimated max
 * nor a trend point.
 *
 * Imported names are mapped as of now (the remembered choices win). The same array
 * while nothing it reads changes, so the estimates worked out from it are kept; a change
 * to the home states alone does not read the workouts again. `undefined` while loading.
 *
 * @evidence target-evidence
 */
export function useStrengthEvidence(): StrengthSet[] | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const imported = useImportedSessions();
  const overrides = useMappingOverrides();
  const variantStates = useVariantStates();
  const logged = useMemo(
    () =>
      completedWorkouts === undefined || imported === undefined
        ? undefined
        : strengthEvidenceOf(completedWorkouts, imported, overrides),
    [completedWorkouts, imported, overrides]
  );
  return useMemo(() => {
    if (logged === undefined || variantStates === undefined) return undefined;
    const targets = targetStrengthSets(variantStates);
    return targets.length > 0 ? [...logged, ...targets] : logged;
  }, [logged, variantStates]);
}
