// Display helpers for the Today screen. Pure; no React.
import type { WorkoutExerciseState } from "@/lib/workout/types";

/** "5×3+" for an AMRAP entry, "3×10" otherwise. */
export function formatSetsReps(entry: WorkoutExerciseState): string {
  return `${entry.targetSets}×${entry.targetReps}${entry.isAMRAP ? "+" : ""}`;
}
