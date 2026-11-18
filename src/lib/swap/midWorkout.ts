// Swapping or removing an exercise during a workout (W11, logic only). Pure: the caller
// saves the returned edits in the session's `planEdits` (one `appendPlanEdit` each, in
// order) and lays them on the frozen plan, exactly as `addExercise` does.
// Spec: docs/plans/2026-11-18-future-workouts-and-swaps-design.md.
//
// Entries are never reordered, removed or re-indexed here: the active workout keys the
// weights changed on the spot, a pending load drop and the entry on screen by the
// entry's index in the plan (see `addExercise` in useActiveWorkout.ts), so an entry that
// vanished would move them onto other sets. That is why this module uses only edits
// that keep every index: a `swap` in place (which drops the original's warm-ups, so it
// is used only when the entry has none), a `scheme` edit that ends an entry after the
// sets already logged, and `add` edits, which append.
import { EXERCISES } from "@/lib/exercises";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import { rehydratePlan } from "@/lib/workout/rehydrate";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import type { PlanEdit, SetLog, Tier } from "@/types";
import { replacementAddEdit, swapEdits, type SwapReplacement } from "./combos";

/** What a change during a workout saves and what the plan becomes. */
export interface MidWorkoutChange {
  /** The edits to append to the session's `planEdits`, in order. */
  edits: PlanEdit[];
  /** The frozen plan with `edits` applied: the same length or longer, every earlier entry at its index. */
  plan: WorkoutPlan;
  /**
   * "replaced": the entry's slot now holds the first replacement (a `swap`), the others
   * are appended. "ended": the entry stays at its index, ended after the sets already
   * logged (a `scheme` edit to that many sets, 0 included), and every replacement is
   * appended. "removed": ended at 0 sets, nothing added.
   */
  mode: "replaced" | "ended" | "removed";
  /** Sets already logged on the entry (drop sets left out, as the screen counts them). */
  loggedSets: number;
  /** Where each replacement is in `plan`, in the order given. */
  replacementIndexes: number[];
}

export interface MidWorkoutInput {
  /** The plan frozen at the start, with the session's edits so far; `completedSets` is not read. */
  plan: WorkoutPlan;
  /** Every set logged in the session so far. */
  sets: readonly SetLog[];
  /** The entry to change, by its exercise (the program lift's id for a home substitute) and tier. */
  exerciseId: string;
  tier: Tier;
}

const isWorking = (entry: WorkoutExerciseState, exerciseId: string, tier: Tier) =>
  !entry.isWarmUp && entry.exerciseId === exerciseId && entry.tier === tier;

/** The entry's index and how many of its sets are logged, as the screen and resume count them. */
function locate(input: MidWorkoutInput): { index: number; entry: WorkoutExerciseState; logged: number } {
  const index = input.plan.findIndex((e) => isWorking(e, input.exerciseId, input.tier));
  if (index === -1) throw new Error("That exercise is not in this workout.");
  // Drop sets continue a set; they are not sets of the entry (`screenPlan`).
  const working = input.sets.filter((set) => set.role !== "drop");
  const logged = rehydratePlan(input.plan, working).plan[index].completedSets;
  return { index, entry: input.plan[index], logged };
}

/** True for an entry ended before any set: a `scheme` edit to 0 sets. The screens hide it. */
export function isDroppedEntry(entry: Pick<WorkoutExerciseState, "isWarmUp" | "targetSets">): boolean {
  return !entry.isWarmUp && entry.targetSets === 0;
}

/**
 * True for a warm-up of an entry that was dropped (`isDroppedEntry`): there is nothing
 * left to warm up for, so the screen should treat it like a stale warm-up and skip it.
 */
export function isWarmUpOfDropped(plan: WorkoutPlan, index: number): boolean {
  const entry = plan[index];
  if (!entry?.isWarmUp) return false;
  const working = plan.find((e, i) => i > index && !e.isWarmUp && e.exerciseId === entry.exerciseId);
  return !!working && isDroppedEntry(working);
}

function indexesOf(plan: WorkoutPlan, ids: readonly string[], tier: Tier, inPlace: boolean): number[] {
  return ids.map((id, i) =>
    plan.findIndex((e) => !e.isWarmUp && e.exerciseId === id && e.tier === (inPlace && i === 0 ? tier : "accessory"))
  );
}

/**
 * Swaps an exercise not yet finished for one or more replacements during a workout.
 *
 * - No set logged and no warm-up entries in front of it: replaced in place (`swapEdits`:
 *   a `swap` and its prescribed weight, then an `add` for each further replacement).
 * - Otherwise (sets logged, or warm-ups the swap would remove): the logged sets stay, the
 *   rest of the entry is dropped by a `scheme` edit to the sets logged (0 when only its
 *   warm-ups were reached; the screen then skips those warm-ups, `isWarmUpOfDropped`),
 *   and every replacement is appended as an `add`.
 *
 * What it does to progression: an entry ended early this way no longer matches its
 * prescription, so it is logged only (`classifyEntry`), just as a lift swapped before the
 * workout; see `swapProgressionEffect`.
 *
 * Throws an Error with a message to show when the entry is not in the plan or is
 * finished, when there is no replacement, or when a replacement is unknown, given twice
 * or already in the workout.
 */
export function midWorkoutSwap(
  input: MidWorkoutInput & { replacements: readonly SwapReplacement[] }
): MidWorkoutChange {
  const { plan, exerciseId, tier, replacements } = input;
  const { entry, logged } = locate(input);
  if (logged >= entry.targetSets) throw new Error("That exercise is already finished.");
  if (replacements.length === 0) throw new Error("Pick an exercise to swap in.");
  const ids = replacements.map((r) => r.exerciseId);
  for (const id of ids) {
    const exercise = EXERCISES[id];
    if (!exercise) throw new Error("That exercise is not in the library.");
    const inPlan = plan.some((e) => !e.isWarmUp && (e.exerciseId === id || e.substituteExerciseId === id));
    if (inPlan) throw new Error(`${exercise.name} is already in this workout.`);
  }
  if (new Set(ids).size !== ids.length) throw new Error("Each exercise can be picked once.");

  const hasWarmUps = plan.some((e) => e.isWarmUp && e.exerciseId === exerciseId);
  if (logged === 0 && !hasWarmUps) {
    const edits = swapEdits(exerciseId, tier, replacements);
    const next = applyPlanEdits(plan, edits);
    return { edits, plan: next, mode: "replaced", loggedSets: 0, replacementIndexes: indexesOf(next, ids, tier, true) };
  }

  const edits: PlanEdit[] = [
    { kind: "scheme", exerciseId, tier, sets: logged, reps: entry.targetReps },
    ...replacements.map(replacementAddEdit),
  ];
  const next = applyPlanEdits(plan, edits);
  return { edits, plan: next, mode: "ended", loggedSets: logged, replacementIndexes: indexesOf(next, ids, tier, false) };
}

/**
 * Removes an exercise with no set logged during a workout. It stays at its index, ended
 * at 0 sets (a `scheme` edit; a `remove` edit would shift every entry after it), so the
 * screen hides it (`isDroppedEntry`) and skips its warm-ups (`isWarmUpOfDropped`). For
 * progression it is not done, as a removed lift is: held, and a T1 leaves the day due.
 *
 * Throws an Error with a message to show when the entry is not in the plan or a set of
 * it is logged.
 */
export function midWorkoutRemove(input: MidWorkoutInput): MidWorkoutChange {
  const { entry, logged } = locate(input);
  if (logged > 0) throw new Error("Sets of this exercise are logged: swap it or end it instead.");
  const edits: PlanEdit[] = [
    { kind: "scheme", exerciseId: input.exerciseId, tier: input.tier, sets: 0, reps: entry.targetReps },
  ];
  return { edits, plan: applyPlanEdits(input.plan, edits), mode: "removed", loggedSets: 0, replacementIndexes: [] };
}
