import { useMemo } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { projectUpcomingWorkouts, type UpcomingWorkout } from "@/lib/workout/upcoming";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { WorkoutLocation } from "@/types";
import { useSettings } from "./useProfile";
import { useCompletedWorkouts, useLiftStates } from "./useWorkouts";

/**
 * The next `count` workouts at `location`: the first exactly as `useNextWorkout`
 * describes it, the rest projected assuming every set is completed. `undefined`
 * while loading.
 */
export function useUpcomingWorkouts(
  location: WorkoutLocation,
  count = 5
): UpcomingWorkout[] | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const liftStates = useLiftStates();
  const loadedSettings = useSettings();

  return useMemo(() => {
    if (completedWorkouts === undefined || liftStates === undefined || loadedSettings === undefined) {
      return undefined;
    }
    // No profile (not yet seeded, or just cleared): plan with the seed defaults.
    const settings = loadedSettings ?? DEFAULT_USER_PROFILE.settings;
    return projectUpcomingWorkouts({
      completedWorkouts,
      templates: WORKOUT_TEMPLATES,
      liftStates,
      location,
      equipment: settings.equipment,
      includeWarmUps: settings.showWarmUps,
      count,
      settings,
      // Only stamps the simulated workouts' dates; nothing shown depends on it.
      now: new Date(0),
    });
  }, [completedWorkouts, liftStates, loadedSettings, location, count]);
}
