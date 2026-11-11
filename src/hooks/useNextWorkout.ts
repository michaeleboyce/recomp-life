import { useMemo } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { NextWorkoutDescription } from "@/lib/workout/types";
import type { WorkoutLocation } from "@/types";
import { useSettings } from "./useProfile";
import { useCompletedWorkouts, useLiftStates } from "./useWorkouts";

/**
 * The upcoming workout in the rotation with its plan for the given location
 * (defaults to the profile's default location, else "gym"). Warm-ups follow the
 * `showWarmUps` setting; no accessories.
 */
export function useNextWorkout(location?: WorkoutLocation): NextWorkoutDescription | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const liftStates = useLiftStates();
  const loadedSettings = useSettings();

  return useMemo(() => {
    if (completedWorkouts === undefined || liftStates === undefined || loadedSettings === undefined) {
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
      },
    });
  }, [completedWorkouts, liftStates, loadedSettings, location]);
}
