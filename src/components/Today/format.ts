// Display helpers for the Today screen. Pure; no React.
import { EXERCISES } from "@/lib/exercises";
import type { WorkoutExerciseState } from "@/lib/workout/types";

/** "Barbell Squat" -> "Squat"; other names unchanged; unknown ids as given. */
export function shortLiftName(exerciseId: string): string {
  const name = EXERCISES[exerciseId]?.name ?? exerciseId;
  return name.replace(/^Barbell /, "");
}

/** "5×3+" for an AMRAP entry, "3×10" otherwise. */
export function formatSetsReps(entry: WorkoutExerciseState): string {
  return `${entry.targetSets}×${entry.targetReps}${entry.isAMRAP ? "+" : ""}`;
}
