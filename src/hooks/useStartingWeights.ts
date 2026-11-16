import { useMemo } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { suggestStartingWeights, type StartingWeightSuggestion } from "@/lib/import/startingWeights";
import { useImportedSessions } from "./useImportedSessions";
import { useSettings } from "./useProfile";
import { useStrengthEvidence } from "./useStrengthEvidence";
import { useStrengthSets } from "./useStrengthSets";
import { useVariantStates } from "./useVariantStates";
import { useLiftStates } from "./useWorkouts";

/**
 * Starting weights suggested from all history (`suggestStartingWeights`), for the lifts
 * whose estimate rests on imported sessions, against the weights planned now. Nothing
 * is changed until the lifter confirms one. `undefined` while loading.
 */
export function useStartingWeights(now?: Date): StartingWeightSuggestion[] | undefined {
  const sets = useStrengthEvidence();
  const planSets = useStrengthSets();
  const imported = useImportedSessions();
  const liftStates = useLiftStates();
  const variantStates = useVariantStates();
  const loadedSettings = useSettings();
  const at = now?.getTime();
  return useMemo(() => {
    if (
      sets === undefined ||
      planSets === undefined ||
      imported === undefined ||
      liftStates === undefined ||
      variantStates === undefined ||
      loadedSettings === undefined
    ) {
      return undefined;
    }
    const settings = loadedSettings ?? DEFAULT_USER_PROFILE.settings;
    return suggestStartingWeights({
      sets,
      planStrengthSets: planSets,
      liftStates,
      variantStates,
      equipment: settings.equipment,
      phase: settings.trainingPhase,
      now: at === undefined ? new Date() : new Date(at),
      importedSessionIds: new Set(imported.map((s) => s.id)),
    });
  }, [sets, planSets, imported, liftStates, variantStates, loadedSettings, at]);
}
