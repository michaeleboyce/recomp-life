import type { LiftState, T1Stage, T2Stage, WorkoutTemplateExercise } from "@/types";
import type { Prescription } from "./types";

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
  if (liftState && templateExercise.tier === "T1") {
    return { weight: liftState.t1Weight, ...T1_STAGE_SCHEME[liftState.t1Stage] };
  }
  if (liftState && templateExercise.tier === "T2") {
    return { weight: liftState.t2Weight, ...T2_STAGE_SCHEME[liftState.t2Stage] };
  }
  if (liftState && templateExercise.tier === "T3") {
    return {
      weight: liftState.t3Weight,
      sets: templateExercise.sets,
      reps: templateExercise.reps,
    };
  }
  return { weight: 0, sets: templateExercise.sets, reps: templateExercise.reps };
}
