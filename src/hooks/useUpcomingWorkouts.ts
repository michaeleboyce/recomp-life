import { useMemo, useState } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import {
  describeUpcomingWorkout,
  projectUpcomingWorkouts,
  type ProjectUpcomingInput,
  type UpcomingWorkout,
  type UpcomingWorkoutDetail,
} from "@/lib/workout/upcoming";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { WorkoutLocation } from "@/types";
import { useSettings } from "./useProfile";
import { useStrengthEvidence } from "./useStrengthEvidence";
import { useVariantStates } from "./useVariantStates";
import { useCompletedWorkouts, useLiftStates } from "./useWorkouts";

/**
 * What the projection reads, from the live rows: the first workout exactly as
 * `useNextWorkout` describes it (home exercises at their own weights, re-entry applied),
 * the accessories for the day the screen was opened. `undefined` while loading.
 */
function useProjectionInput(location: WorkoutLocation): Omit<ProjectUpcomingInput, "count"> | undefined {
  const completedWorkouts = useCompletedWorkouts();
  const liftStates = useLiftStates();
  const variantStates = useVariantStates();
  const strengthSets = useStrengthEvidence();
  const loadedSettings = useSettings();
  // The day the accessories are chosen for, as the Ready screen opened now would.
  const [openedAt] = useState(() => new Date());

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
    return {
      completedWorkouts,
      templates: WORKOUT_TEMPLATES,
      liftStates,
      location,
      equipment: settings.equipment,
      includeWarmUps: settings.showWarmUps,
      settings,
      // Only stamps the simulated workouts' dates; nothing shown depends on it.
      now: new Date(0),
      variantStates,
      strengthSets,
      reentry: true,
      // Each per-set plan shows on the first coming workout that does it (E6).
      nextSetPlans: settings.nextSetPlans,
      // Each workout with the accessories that fit in the session length, so the
      // lengths shown are the ones the Ready screen plans.
      accessoriesNow: openedAt,
    };
  }, [completedWorkouts, liftStates, variantStates, strengthSets, loadedSettings, location, openedAt]);
}

/**
 * The next `count` workouts at `location`: the first exactly as `useNextWorkout`
 * describes it (home exercises at their own weights, re-entry applied), the rest
 * projected assuming every set is completed. `undefined` while loading.
 */
export function useUpcomingWorkouts(
  location: WorkoutLocation,
  count = 5
): UpcomingWorkout[] | undefined {
  const input = useProjectionInput(location);
  return useMemo(() => (input ? projectUpcomingWorkouts({ ...input, count }) : undefined), [input, count]);
}

/**
 * One coming workout in full (`describeUpcomingWorkout`): position 0 is the next
 * workout as Today and Ready plan it, later ones assume every session before is
 * completed. `undefined` while loading; null for a position out of range.
 */
export function useUpcomingWorkoutDetail(
  location: WorkoutLocation,
  position: number
): UpcomingWorkoutDetail | null | undefined {
  const input = useProjectionInput(location);
  return useMemo(() => (input ? describeUpcomingWorkout({ ...input, position }) : undefined), [input, position]);
}
