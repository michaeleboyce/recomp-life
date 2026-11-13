import { EXERCISES } from "@/lib/exercises";
import { applyPreferences } from "@/lib/exercisePreferences";
import type { Exercise, ExercisePreferences, WorkoutLocation } from "@/types";

/**
 * Exercises that can stand in for `exerciseId` when the user swaps it: those that
 * share at least one primary muscle with it. Best match first (most primary muscles
 * shared, then most secondary muscles shared, then name), with blocked exercises
 * dropped and preferred ones moved to the front. At home only exercises that do not
 * need a gym are offered. Exercises in `exclude` (already in the workout) are left out.
 */
export function swapCandidates(
  exerciseId: string,
  options: {
    location: WorkoutLocation;
    preferences?: ExercisePreferences;
    exclude?: string[];
  }
): Exercise[] {
  const target = EXERCISES[exerciseId];
  if (!target) return [];

  const exclude = new Set([exerciseId, ...(options.exclude ?? [])]);
  const shared = (a: string[], b: string[]) => a.filter((m) => b.includes(m)).length;

  const ranked = Object.values(EXERCISES)
    .filter((candidate) => !exclude.has(candidate.id))
    .filter((candidate) => options.location === "gym" || !candidate.requiresGym)
    .map((candidate) => ({
      candidate,
      primary: shared(candidate.primaryMuscles, target.primaryMuscles),
      secondary: shared(candidate.secondaryMuscles, target.secondaryMuscles),
    }))
    .filter((row) => row.primary > 0)
    .sort(
      (a, b) =>
        b.primary - a.primary ||
        b.secondary - a.secondary ||
        a.candidate.name.localeCompare(b.candidate.name)
    )
    .map((row) => row.candidate.id);

  return applyPreferences(ranked, options.preferences).map((id) => EXERCISES[id]);
}
