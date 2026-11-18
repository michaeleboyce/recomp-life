import { useMemo } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { resolveNextWorkout, type ResolvedNextWorkout } from "@/lib/workout/nextWorkout";
import type { WorkoutLocation } from "@/types";
import { useSettings } from "./useProfile";
import { useStrengthEvidence } from "./useStrengthEvidence";
import { useVariantStates } from "./useVariantStates";
import { useCompletedWorkouts, useLiftStates } from "./useWorkouts";

/**
 * The upcoming workout in the rotation with its plan for the given location
 * (defaults to the profile's default location, else "gym"): `resolveNextWorkout`, the
 * one function every screen plans the next workout with, over the live rows. Warm-ups
 * follow the `showWarmUps` setting; the accessories the accessory mode ("auto": chosen). At home each lift is planned from
 * its home exercise's own weight (a first one seeded from the strength estimate, H3),
 * and the first session back at a location takes its re-entry weight (H6), from the
 * app's and the imported sessions' sets (`useStrengthEvidence`). Next-session set plans
 * (`settings.nextSetPlans`, E6) give their entries their per-set weights.
 */
export function useNextWorkout(location?: WorkoutLocation): ResolvedNextWorkout | undefined {
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
    return resolveNextWorkout({ completedWorkouts, liftStates, variantStates, strengthSets, settings, location });
  }, [completedWorkouts, liftStates, variantStates, strengthSets, loadedSettings, location]);
}
