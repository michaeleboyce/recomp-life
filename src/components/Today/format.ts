// Display helpers for the Today screen. Pure; no React.
import { EXERCISES } from "@/lib/exercises";
import type { PrChance } from "@/lib/projection";
import type { WorkoutExerciseState } from "@/lib/workout/types";

// Moved to src/lib/workout/duration.ts; re-exported for the screens that import it here.
export { estimateWorkoutMinutes } from "@/lib/workout/duration";

/** "Barbell Squat" -> "Squat"; other names unchanged; unknown ids as given. */
export function shortLiftName(exerciseId: string): string {
  const name = EXERCISES[exerciseId]?.name ?? exerciseId;
  return name.replace(/^Barbell /, "");
}

/** Lower-case a lift name for use mid-sentence, leaving acronyms such as OHP alone. */
export function inSentence(name: string): string {
  return name === name.toUpperCase() ? name : name.toLowerCase();
}

/** "5×3+" for an AMRAP entry, "3×10" otherwise. */
export function formatSetsReps(entry: WorkoutExerciseState): string {
  return `${entry.targetSets}×${entry.targetReps}${entry.isAMRAP ? "+" : ""}`;
}

const CHANCE_TEXT: Record<PrChance, string> = {
  likely: "Likely.",
  stretch: "A stretch.",
  unlikely: "Unlikely.",
  unknown: "",
};

export function formatPrChance(chance: PrChance): string {
  return CHANCE_TEXT[chance];
}

/** "Wednesday, Nov 11". */
export function formatTodayDate(date: Date): string {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${weekday}, ${monthDay}`;
}

/** Whole numbers as is, otherwise one decimal. */
export function formatLbs(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
