import { EXERCISES } from "@/lib/exercises";
import { recommendSwaps, type SwapContext } from "@/lib/swap/recommend";
import type { Exercise, ExercisePreferences, WorkoutLocation } from "@/types";

// Without strength sets nothing the score reads depends on the clock; a fixed moment
// keeps the list the same on every call.
const NO_HISTORY_NOW = new Date(2026, 0, 1, 12, 0, 0);

/**
 * Exercises that can stand in for `exerciseId` when the user swaps it, best first: a
 * thin wrapper over `recommendSwaps` (src/lib/swap/recommend.ts) for the callers that
 * still want a plain list. Those that share at least one primary muscle with it, ranked
 * by the recommendation score (muscles covered, same movement, preferred, history,
 * known weight, recovery, pain), with blocked exercises dropped. At home only exercises
 * that do not need a gym are offered. Exercises in `exclude` (already in the workout)
 * are left out. Pass the rest of a `SwapContext` (`slot`, `strengthSets`, ...) for the
 * full ranking; left out, the entry is scored as an accessory with no history.
 *
 * @evidence swap-recommendation
 */
export function swapCandidates(
  exerciseId: string,
  options: {
    location: WorkoutLocation;
    preferences?: ExercisePreferences;
    exclude?: string[];
  } & Partial<Omit<SwapContext, "location" | "preferences" | "exclude">>
): Exercise[] {
  return recommendSwaps(exerciseId, { now: NO_HISTORY_NOW, ...options }).map(
    (candidate) => EXERCISES[candidate.exerciseId]
  );
}
