import type { LiftState, T1Stage, T2Stage, WorkoutTemplateExercise } from "@/types";
import type { Prescription } from "./types";

const NOT_IMPLEMENTED = "not implemented: src/lib/workout contract stub";

/** Sets and reps for each T1 stage. The single source for these numbers. */
export const T1_STAGE_SCHEME: Record<T1Stage, { sets: number; reps: number }> = {
  "5x3": { sets: 5, reps: 3 },
  "6x2": { sets: 6, reps: 2 },
  "10x1": { sets: 10, reps: 1 },
};

/** Sets and reps for each T2 stage. The single source for these numbers. */
export const T2_STAGE_SCHEME: Record<T2Stage, { sets: number; reps: number }> = {
  "3x10": { sets: 3, reps: 10 },
  "3x8": { sets: 3, reps: 8 },
  "3x6": { sets: 3, reps: 6 },
};

/**
 * Weight, sets and reps for a template exercise given the lift's current state.
 * T1/T2 use the stage scheme; T3 uses the template's sets/reps with `t3Weight`.
 * With no lift state the weight is 0 and sets/reps come from the template.
 */
export function getPrescription(
  templateExercise: WorkoutTemplateExercise,
  liftState: LiftState | undefined
): Prescription {
  void templateExercise;
  void liftState;
  throw new Error(NOT_IMPLEMENTED);
}
