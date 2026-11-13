// Pure derivations for the active workout screen. No React, no database.
import { evaluateT2AutoRegulation } from "@/lib/progression";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import type { SetLog, TrainingPhase } from "@/types";

/** The stepper never goes below one rep (as before) and is not capped near a target. */
export const MIN_REPS = 1;
export const MAX_REPS = 99;
const CHIP_COUNT = 6;

function isComplete(entry: WorkoutExerciseState): boolean {
  return entry.completedSets >= entry.targetSets;
}

/**
 * A warm-up whose working exercise has already been started (the user jumped past
 * it from the overview): there is no point offering it any more.
 */
function isStaleWarmUp(plan: WorkoutPlan, index: number): boolean {
  const entry = plan[index];
  if (!entry?.isWarmUp) return false;
  const working = plan.find(
    (e, i) => i > index && !e.isWarmUp && e.exerciseId === entry.exerciseId
  );
  return !!working && working.completedSets > 0;
}

/** First entry at or after `from` that still has sets to do, else -1. */
export function nextIncompleteIndex(plan: WorkoutPlan, from = 0): number {
  for (let i = Math.max(from, 0); i < plan.length; i++) {
    if (!isComplete(plan[i]) && !isStaleWarmUp(plan, i)) return i;
  }
  return -1;
}

/**
 * The entry on screen: the one the user jumped to while it still has sets left,
 * otherwise the first unfinished entry in plan order. `plan.length` when nothing
 * is left.
 */
export function resolveActiveIndex(plan: WorkoutPlan, viewedIndex: number | null): number {
  if (viewedIndex != null) {
    const viewed = plan[viewedIndex];
    if (viewed && !isComplete(viewed)) return viewedIndex;
  }
  const next = nextIncompleteIndex(plan);
  return next === -1 ? plan.length : next;
}

/**
 * Where to go after finishing the entry at `index`: the next unfinished entry
 * after it, or null to fall back to plan order (which picks up anything skipped).
 */
export function entryAfter(plan: WorkoutPlan, index: number): number | null {
  const next = nextIncompleteIndex(plan, index + 1);
  return next === -1 ? null : next;
}

/** Quick-pick rep counts around the target: one below it up to four above. */
export function repChips(targetReps: number): number[] {
  const first = Math.max(MIN_REPS, targetReps - 1);
  return Array.from({ length: CHIP_COUNT }, (_, i) => first + i);
}

export function clampReps(reps: number): number {
  return Math.min(MAX_REPS, Math.max(MIN_REPS, Math.round(reps)));
}

/**
 * True when a T2 load drop was accepted for this entry, judged from what was
 * logged so it survives a reload: a set carries the load-drop status, or the entry
 * has resumed at a weight below the one prescribed.
 */
export function isDropAccepted(
  entry: WorkoutExerciseState,
  prescribedWeight: number,
  sets: SetLog[]
): boolean {
  if (entry.tier !== "T2") return false;
  const logged = workingSetsFor(sets, entry.exerciseId, entry.tier);
  return (
    logged.some((set) => set.status === "autoregulated_load_drop") ||
    (logged.length > 0 && entry.weight < prescribedWeight)
  );
}

export interface DropSuggestion {
  reducedWeight: number;
  rpe: number;
}

/**
 * The T2 auto-regulation suggestion for an entry: offered between its first and
 * second set when the first set's RPE crossed the phase threshold. Derived from
 * the logged set, so it is still there after a reload.
 */
export function dropSuggestionFor(
  entry: WorkoutExerciseState,
  sets: SetLog[],
  phase: TrainingPhase
): DropSuggestion | null {
  if (entry.tier !== "T2" || entry.completedSets !== 1) return null;
  const first = workingSetsFor(sets, entry.exerciseId, entry.tier)[0];
  if (!first || first.rpe == null) return null;
  const result = evaluateT2AutoRegulation(first.rpe, phase, first.weight);
  if (result.action !== "suggest_drop" || !result.reducedWeight) return null;
  return { reducedWeight: result.reducedWeight, rpe: first.rpe };
}

/** m:ss for a whole number of seconds. */
export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, "0")}`;
}

/**
 * What the rest timer says comes next, for the entry that is now current:
 * "Next: set 3 of 5 · 190 lbs", naming the exercise when it is a new one
 * ("Next: Barbell Bench Press, set 1 of 3 · 100 lbs").
 */
export function restNextLabel(entry: WorkoutExerciseState, exerciseName: string, perHand = false): string {
  const weight = `${entry.weight} ${perHand ? "lbs/hand" : "lbs"}`;
  if (entry.isWarmUp) return `Next: ${exerciseName} warm-up · ${weight}`;
  const set = Math.min(entry.completedSets + 1, entry.targetSets);
  const what = `set ${set} of ${entry.targetSets}`;
  return entry.completedSets === 0
    ? `Next: ${exerciseName}, ${what} · ${weight}`
    : `Next: ${what} · ${weight}`;
}
