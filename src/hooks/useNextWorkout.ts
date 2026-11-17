import { useMemo } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { NextWorkoutDescription } from "@/lib/workout/types";
import type { WorkoutLocation } from "@/types";
import { useSettings } from "./useProfile";
import { useStrengthEvidence } from "./useStrengthEvidence";
import { useVariantStates } from "./useVariantStates";
import { useCompletedWorkouts, useLiftStates } from "./useWorkouts";

/**
 * The upcoming workout in the rotation with its plan for the given location
 * (defaults to the profile's default location, else "gym"). Warm-ups follow the
 * `showWarmUps` setting; no accessories. At home each lift is planned from its home
 * exercise's own weight (a first one seeded from the strength estimate, H3), and the
 * first session back at a location takes its re-entry weight (H6), exactly as the
 * Ready screen and the ledger (`nextWorkoutFrom`) plan it: from the app's and the
 * imported sessions' sets (`useStrengthEvidence`).
 */
export function useNextWorkout(location?: WorkoutLocation): NextWorkoutDescription | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const liftStates = useLiftStates();
  const variantStates = useVariantStates();
  const strengthSets = useStrengthEvidence();
  const loadedSettings = useSettings();

  return useMemo(() => {
    if (
      completedWorkouts === undefined ||
      liftStates === undefined ||
      variantStates === undefined ||
      strengthSets === undefined ||
      loadedSettings === undefined
    ) {
      return undefined;
    }
    // No profile (not yet seeded, or just cleared): plan with the seed defaults.
    const settings = loadedSettings ?? DEFAULT_USER_PROFILE.settings;
    return describeNextWorkout({
      completedWorkouts,
      templates: WORKOUT_TEMPLATES,
      liftStates,
      plan: {
        location: location ?? settings.defaultLocation ?? "gym",
        equipment: settings.equipment,
        includeWarmUps: settings.showWarmUps,
        selectedAccessories: [],
        variantStates,
        strengthSets,
      },
      reentry: true,
    });
  }, [completedWorkouts, liftStates, variantStates, strengthSets, loadedSettings, location]);
}
