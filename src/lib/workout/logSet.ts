import type { SetLog } from "@/types";
import type { CreateSetLogInput, NextStep, WorkoutExerciseState, WorkoutPlan } from "./types";

const NOT_IMPLEMENTED = "not implemented: src/lib/workout contract stub";

/** True when the next set of this entry is its AMRAP set (the last set of an AMRAP entry). */
export function isNextSetAMRAP(exercise: WorkoutExerciseState): boolean {
  void exercise;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * The SetLog for the next set of `exercise`. Status is "autoregulated_load_drop" for
 * an accepted T2 drop, otherwise "completed" when reps meet the target, else "failed".
 * `synced` is false and `restAfterSeconds` is 0.
 */
export function createSetLog(input: CreateSetLogInput): SetLog {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * What happens after logging one more set of the entry at `index`, given the plan
 * as it was BEFORE that set was counted: rest then another set of the same entry
 * ("rest"), straight to the next entry ("next-exercise"), or the workout is over
 * ("done").
 */
export function nextStep(plan: WorkoutPlan, index: number): NextStep {
  void plan;
  void index;
  throw new Error(NOT_IMPLEMENTED);
}
