/**
 * How an exported set's weight reads for an exercise: the weight of one implement or
 * the whole load, and how many implements were held. Pure.
 *
 * It follows the library's `grip`, which is what the strength model's per-hand flag
 * reads: `per_hand` is a dumbbell in each hand (the weight is per dumbbell, the load is
 * twice that), `both_hands` and `single` are one dumbbell (the weight is the load), and
 * anything without a grip (barbell, cable, machine, bodyweight) is already the total.
 * The importer stores the weight as lifted with these fields, so "50 lb x 2 hands"
 * is never confused with 50 lb in total.
 */
import { EXERCISES } from "@/lib/exercises";
import { nameTokens } from "./normalise";
import type { ExerciseMapping, ImplementSemantics } from "./types";

const TWO_DUMBBELLS: ImplementSemantics = { weight: "per_implement", implements: 2, perHand: true };
const ONE_IMPLEMENT: ImplementSemantics = { weight: "per_implement", implements: 1, perHand: false };
const TOTAL: ImplementSemantics = { weight: "total", implements: 1, perHand: false };

/** Words that mean a dumbbell exercise is done with one dumbbell. */
const ONE_DUMBBELL_WORDS = ["goblet", "pullover", "waiter", "thrust", "bridge"];

/** The semantics of a library exercise, or null for an id outside the library. */
export function implementsForExercise(exerciseId: string): ImplementSemantics | null {
  const exercise = EXERCISES[exerciseId];
  if (!exercise) return null;
  if (exercise.grip === "per_hand") return { ...TWO_DUMBBELLS };
  if (exercise.grip === "both_hands" || exercise.grip === "single") return { ...ONE_IMPLEMENT };
  return { ...TOTAL };
}

/** The semantics an exercise name suggests, for names outside the library. */
export function implementsForName(name: string): ImplementSemantics {
  const words = new Set(nameTokens(name));
  if (words.has("dumbbell")) {
    // "Single Dumbbell Sumo Squat" holds one; "Single Arm Dumbbell Row" is one per side, like the library's row.
    const singleDumbbell = words.has("single") && !["arm", "leg", "hand"].some((w) => words.has(w));
    if (singleDumbbell || ONE_DUMBBELL_WORDS.some((w) => words.has(w))) return { ...ONE_IMPLEMENT };
    return { ...TWO_DUMBBELLS };
  }
  if (words.has("kettlebell")) return words.has("double") ? { ...TWO_DUMBBELLS } : { ...ONE_IMPLEMENT };
  return { ...TOTAL };
}

/** The semantics for a name and its mapping: the library exercise's when mapped, else the name's. */
export function implementsFor(name: string, mapping: ExerciseMapping): ImplementSemantics {
  if (mapping.kind === "mapped") return implementsForExercise(mapping.exerciseId) ?? implementsForName(name);
  return implementsForName(name);
}
