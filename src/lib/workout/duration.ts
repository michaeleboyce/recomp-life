// How long a workout takes on paper: every set plus the rest after it. Pure.
import { SESSION_LENGTH_MODEL } from "@/lib/forecast/coefficients";
import { getRestSeconds } from "@/lib/restTimes";
import type { SetLog, Tier, TrainingPhase } from "@/types";
import type { WorkoutExerciseState } from "./types";

/** Seconds one set of this tier is counted as: the set itself plus the rest after it. */
export function estimateSetSeconds(tier: Tier, phase?: TrainingPhase): number {
  return getRestSeconds(tier, phase) + SESSION_LENGTH_MODEL.secondsPerSet;
}

/**
 * The plan's length in seconds: `estimateSetSeconds` for every planned set, unrounded.
 *
 * @evidence forecast-session-length
 */
export function estimateWorkoutSeconds(
  plan: ReadonlyArray<Pick<WorkoutExerciseState, "tier" | "targetSets">>,
  phase?: TrainingPhase
): number {
  return plan.reduce(
    (total, entry) => total + Math.max(entry.targetSets, 0) * estimateSetSeconds(entry.tier, phase),
    0
  );
}

/**
 * The same estimate for sets that were logged: what the sets actually done would have
 * taken on paper. A finished session's real length over this is the lifter's own pace.
 */
export function estimateLoggedSeconds(
  sets: ReadonlyArray<Pick<SetLog, "tier">>,
  phase?: TrainingPhase
): number {
  return sets.reduce((total, set) => total + estimateSetSeconds(set.tier, phase), 0);
}

/** About how long the plan takes: every set plus the rest after it, to the nearest 5 minutes. */
export function estimateWorkoutMinutes(
  plan: ReadonlyArray<Pick<WorkoutExerciseState, "tier" | "targetSets">>,
  phase?: TrainingPhase
): number {
  return Math.max(5, Math.round(estimateWorkoutSeconds(plan, phase) / 60 / 5) * 5);
}
