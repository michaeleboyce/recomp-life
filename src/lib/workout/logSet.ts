import type { SetLog } from "@/types";
import type { CreateSetLogInput, NextStep, WorkoutExerciseState, WorkoutPlan } from "./types";

/** True when the next set of this entry is its AMRAP set (the last set of an AMRAP entry). */
export function isNextSetAMRAP(exercise: WorkoutExerciseState): boolean {
  return exercise.isAMRAP && exercise.completedSets + 1 === exercise.targetSets;
}

/**
 * The SetLog for the next set of `exercise`. Status is "autoregulated_load_drop" for
 * an accepted T2 drop, otherwise "completed" when reps meet the target, else "failed".
 * `synced` is false and `restAfterSeconds` is 0.
 */
export function createSetLog(input: CreateSetLogInput): SetLog {
  const { exercise, actualReps, rpe, location, autoRegulated, now, id, clientId } = input;

  return {
    id,
    clientId,
    exerciseId: exercise.exerciseId,
    tier: exercise.tier,
    setNumber: exercise.completedSets + 1,
    targetReps: exercise.targetReps,
    actualReps,
    weight: exercise.weight,
    isAMRAP: isNextSetAMRAP(exercise),
    completedAt: now,
    restAfterSeconds: 0,
    status:
      autoRegulated && exercise.tier === "T2"
        ? "autoregulated_load_drop"
        : actualReps >= exercise.targetReps
          ? "completed"
          : "failed",
    originalWeight: exercise.originalWeight,
    isSubstituted: !!exercise.substituteExerciseId,
    substituteExerciseId: exercise.substituteExerciseId,
    rpe: rpe ?? undefined,
    location,
    synced: false,
  };
}

/**
 * What happens after logging one more set of the entry at `index`, given the plan
 * as it was BEFORE that set was counted: rest then another set of the same entry
 * ("rest"), straight to the next entry ("next-exercise"), or the workout is over
 * ("done").
 */
export function nextStep(plan: WorkoutPlan, index: number): NextStep {
  const entry = plan[index];
  if (!entry) return "done";

  const isLastSetOfEntry = entry.completedSets + 1 >= entry.targetSets;
  if (!isLastSetOfEntry) return "rest";

  return index >= plan.length - 1 ? "done" : "next-exercise";
}
