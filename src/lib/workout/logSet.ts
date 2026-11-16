import type { SetLog } from "@/types";
import { isWorkingSet } from "./setSelectors";
import type { CreateSetLogInput, NextStep, WorkoutExerciseState, WorkoutPlan } from "./types";

/**
 * True when the next set of this entry is its AMRAP set: the last set of an AMRAP entry,
 * or with per-set weights its last working set (a back-off set after it is not).
 */
export function isNextSetAMRAP(exercise: WorkoutExerciseState): boolean {
  if (!exercise.isAMRAP) return false;
  const index = exercise.completedSets;
  if (exercise.perSet) {
    const lastWorking = exercise.perSet.reduce(
      (last, set, i) => (isWorkingSet(set) ? i : last),
      -1
    );
    return index === lastWorking;
  }
  return index + 1 === exercise.targetSets;
}

/**
 * The SetLog for the next set of `exercise`. Status is "autoregulated_load_drop" for
 * an accepted T2 drop, otherwise "completed" when reps meet the target, else "failed".
 * `synced` is false and `restAfterSeconds` is 0. With per-set weights the set takes its
 * own weight, rep target and role from `perSet` (and a home substitute's program weight
 * is scaled to it); without, every set is the entry's weight and reps, as always.
 */
export function createSetLog(input: CreateSetLogInput): SetLog {
  const { exercise, actualReps, rpe, location, autoRegulated, now, id, clientId } = input;
  const planned = exercise.perSet?.[exercise.completedSets];
  const weight = planned?.weight ?? exercise.weight;
  const targetReps = planned?.reps ?? exercise.targetReps;
  const originalWeight =
    planned && exercise.originalWeight != null && exercise.weight > 0
      ? Math.round((exercise.originalWeight * weight) / exercise.weight)
      : exercise.originalWeight;

  return {
    id,
    clientId,
    exerciseId: exercise.exerciseId,
    tier: exercise.tier,
    setNumber: exercise.completedSets + 1,
    targetReps,
    actualReps,
    weight,
    isAMRAP: isNextSetAMRAP(exercise),
    completedAt: now,
    restAfterSeconds: 0,
    status:
      autoRegulated && exercise.tier === "T2"
        ? "autoregulated_load_drop"
        : actualReps >= targetReps
          ? "completed"
          : "failed",
    originalWeight,
    isSubstituted: !!exercise.substituteExerciseId,
    substituteExerciseId: exercise.substituteExerciseId,
    rpe: rpe ?? undefined,
    location,
    ...(planned?.role ? { role: planned.role } : {}),
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
