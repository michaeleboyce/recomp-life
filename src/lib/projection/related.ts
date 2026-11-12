// Which other exercises train a lift's primary muscles. Pure.
import { EXERCISES } from "@/lib/exercises";

/**
 * Ids of the other exercises that list at least one of the lift's primary muscles
 * as one of their own primary muscles, sorted. Empty for an unknown lift.
 */
export function relatedExerciseIds(exerciseId: string): string[] {
  const lift = EXERCISES[exerciseId];
  if (!lift) return [];
  const primary = new Set(lift.primaryMuscles);
  return Object.values(EXERCISES)
    .filter((e) => e.id !== exerciseId && e.primaryMuscles.some((m) => primary.has(m)))
    .map((e) => e.id)
    .sort();
}
