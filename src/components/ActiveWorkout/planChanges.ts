// Adding an exercise during the workout (A9): the plan edit it is saved as. Pure.
import { EXERCISES } from "@/lib/exercises";
import type { WorkoutPlan } from "@/lib/workout";
import type { PlanEdit } from "@/types";

/** What an added exercise is done for. */
export interface AddedPrescription {
  sets: number;
  reps: number;
  weight: number;
  isAMRAP: boolean;
}

/**
 * The `add` edit for `exerciseId` on `plan`. Throws an Error to show when the exercise
 * is unknown or already in the workout, or the scheme is not a whole number of sets and
 * reps with a weight of at least 0.
 */
export function addEditFor(plan: WorkoutPlan, exerciseId: string, prescription: AddedPrescription): PlanEdit {
  const exercise = EXERCISES[exerciseId];
  if (!exercise) throw new Error("That exercise is not in the library.");
  const { sets: count, reps, weight, isAMRAP } = prescription;
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(reps) || reps < 1) {
    throw new Error("Sets and reps must be whole numbers of at least 1.");
  }
  if (!Number.isFinite(weight) || weight < 0) throw new Error("The weight must be 0 or more.");
  const inPlan = plan.some(
    (e) => !e.isWarmUp && (e.exerciseId === exerciseId || e.substituteExerciseId === exerciseId)
  );
  if (inPlan) throw new Error(`${exercise.name} is already in this workout.`);
  return { kind: "add", exerciseId, sets: count, reps, weight, isAMRAP };
}
