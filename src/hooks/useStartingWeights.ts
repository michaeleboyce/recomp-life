import { useMemo } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { suggestStartingWeights, type StartingWeightSuggestion } from "@/lib/import/startingWeights";
import { useSettings } from "./useProfile";
import { useStrengthEvidence } from "./useStrengthEvidence";
import { useVariantStates } from "./useVariantStates";
import { useLiftStates } from "./useWorkouts";

/**
 * Starting weights suggested from all history, imported included
 * (`suggestStartingWeights`), against the weights planned now. Nothing is changed until
 * the lifter confirms one. `undefined` while loading.
 */
export function useStartingWeights(now?: Date): StartingWeightSuggestion[] | undefined {
  const sets = useStrengthEvidence();
  const liftStates = useLiftStates();
  const variantStates = useVariantStates();
  const loadedSettings = useSettings();
  const at = now?.getTime();
  return useMemo(() => {
    if (sets === undefined || liftStates === undefined || variantStates === undefined || loadedSettings === undefined) {
      return undefined;
    }
    const settings = loadedSettings ?? DEFAULT_USER_PROFILE.settings;
    return suggestStartingWeights({
      sets,
      liftStates,
      variantStates,
      equipment: settings.equipment,
      phase: settings.trainingPhase,
      now: at === undefined ? new Date() : new Date(at),
    });
  }, [sets, liftStates, variantStates, loadedSettings, at]);
}
