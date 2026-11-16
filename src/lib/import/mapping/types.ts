import type { MuscleId } from "@/types";

/**
 * How sure a mapping is.
 * - high: the same exercise under another name ("Barbell Bench Press" is the bench press)
 * - medium: the same movement and equipment with a small change of stance, seat, bench
 *   angle or grip ("Seated Dumbbell Curl" is counted as bicep curls). Never used for a
 *   program lift or its home substitute.
 * - low: a muscle guess from the name's words
 * - user: chosen on the import screen
 */
export type MappingConfidence = "high" | "medium" | "low" | "user";

export interface MuscleSet {
  primary: MuscleId[];
  secondary: MuscleId[];
}

export type ExerciseMapping =
  /** Matched to an exercise in the app's library. */
  | { kind: "mapped"; exerciseId: string; confidence: "high" | "medium" | "user" }
  /** Kept under its own name with muscles the user chose. */
  | { kind: "custom"; muscles: MuscleSet; confidence: "user" }
  /** Kept under its own name with muscles guessed from its words; listed for review. */
  | { kind: "guess"; muscles: MuscleSet; confidence: "low" }
  /** Nothing in the name says what it trains; listed for review. */
  | { kind: "unknown" };

/** A choice made on the import screen, remembered for the next import. */
export type MappingOverride =
  | { kind: "exercise"; exerciseId: string }
  | { kind: "custom"; primary: MuscleId[]; secondary?: MuscleId[] };

/** Remembered choices keyed by the exported name (any spelling; see `nameKey`). */
export type MappingOverrides = Record<string, MappingOverride>;

/**
 * How the exported weight of a set reads for this exercise, matching the strength
 * model's per-hand flag (a dumbbell in each hand: the weight is per dumbbell).
 */
export interface ImplementSemantics {
  /** "per_implement": the weight of one dumbbell or kettlebell; "total": the whole load. */
  weight: "per_implement" | "total";
  /** Implements held at once: 2 for a dumbbell in each hand, otherwise 1. */
  implements: 1 | 2;
  /** The strength model's per-hand flag. */
  perHand: boolean;
}
