// Display helpers for the Today screen. Pure; no React.
// estimateWorkoutMinutes is a display estimate only; it belongs in src/lib/workout once
// that lane is open (the Today package may not edit src/lib).
import { EXERCISES } from "@/lib/exercises";
import { getRestSeconds } from "@/lib/restTimes";
import type { PrChance } from "@/lib/projection";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { TrainingPhase } from "@/types";

/** Seconds a set itself takes, on top of the rest after it. A rough working figure. */
const SET_SECONDS = 45;

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

/** About how long the plan takes: every set plus the rest after it, to the nearest 5 minutes. */
export function estimateWorkoutMinutes(
  plan: WorkoutExerciseState[],
  phase?: TrainingPhase
): number {
  const seconds = plan.reduce(
    (total, entry) =>
      total + Math.max(entry.targetSets, 0) * (getRestSeconds(entry.tier, phase) + SET_SECONDS),
    0
  );
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
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
