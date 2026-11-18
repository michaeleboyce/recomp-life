// The reps a T3's last set needs to move its weight up, for each place that states or
// reads it: a lift state, a home exercise, a plan entry, a finished session's outcome,
// and the words screens use. Every number comes from `t3IncreaseThreshold`, the one
// place the threshold is worked out; this file only finds the weight and next weight
// it is given. Pure: no React, no database.
import { EXERCISES } from "@/lib/exercises";
import { formatNumber } from "@/lib/metrics/helpers";
import { plural } from "@/lib/text";
import {
  T3_INCREMENT_LBS,
  T3_TARGET_REPS,
  getHoldReason,
  t3IncreaseThreshold,
  t3NextWeight,
} from "@/lib/progression";
import type { EquipmentProfile, ProgressionOutcome, SetLog, VariantOutcome } from "@/types";
import { workingSetsFor } from "./setSelectors";
import type { WorkoutExerciseState } from "./types";
import { homeNextWeight } from "./variant";

type Dumbbells = Pick<EquipmentProfile, "dumbbellIncrementLbs" | "maxDumbbellWeight">;

/** A T3 weight, its next step and the reps on the last set that earn it. */
export interface T3Increase {
  /** As lifted (a hand, where the exercise is per hand). */
  weight: number;
  /** Null when there is no heavier weight to go to (the heaviest dumbbell). */
  nextWeight: number | null;
  targetReps: number;
  /** Reps on the last set that move the weight up. */
  threshold: number;
}

function increase(weight: number, nextWeight: number | null, targetReps: number): T3Increase {
  return { weight, nextWeight, targetReps, threshold: t3IncreaseThreshold({ weight, nextWeight, targetReps }) };
}

/**
 * A T3 lift state's weight (the lift itself, at the gym or at home without a
 * substitute): the next weight is T3_INCREMENT_LBS more.
 *
 * @evidence t3-progression
 */
export function liftT3Increase(weight: number, targetReps: number = T3_TARGET_REPS): T3Increase {
  return increase(weight, t3NextWeight(weight), targetReps);
}

/**
 * A home exercise done for a T3 lift: one dumbbell step, up to the heaviest dumbbell
 * (`homeNextWeight`, the step `evaluateVariant` takes).
 *
 * @evidence t3-progression
 */
export function homeT3Increase(weight: number, targetReps: number, equipment: Dumbbells): T3Increase {
  return increase(weight, homeNextWeight(weight, equipment), targetReps);
}

/** A planned T3: a home substitute steps in dumbbells, the lift itself in its own step. */
export function t3IncreaseForEntry(
  entry: { weight: number; targetReps: number; substituteExerciseId?: string },
  equipment: Dumbbells
): T3Increase {
  return entry.substituteExerciseId
    ? homeT3Increase(entry.weight, entry.targetReps, equipment)
    : liftT3Increase(entry.weight, entry.targetReps);
}

/**
 * The threshold a finished T3 lift's session was judged by, from its outcome: the
 * weight lifted is the outcome's new weight, less the step when it went up on its last
 * set (also when it was done heavier: `from` is then the prescribed weight). Null for
 * anything but a T3 that went up or stayed.
 */
export function t3IncreaseOfOutcome(
  outcome: Pick<ProgressionOutcome, "tier" | "kind" | "reason" | "to">,
  targetReps: number = T3_TARGET_REPS
): T3Increase | null {
  if (outcome.tier !== "T3" || (outcome.kind !== "t3Up" && outcome.kind !== "t3Same")) return null;
  const steppedUp = outcome.kind === "t3Up" && outcome.reason !== "heavier";
  const weight = steppedUp ? outcome.to.weight - T3_INCREMENT_LBS : outcome.to.weight;
  return liftT3Increase(weight, targetReps);
}

/**
 * The same for a home exercise's outcome, with the dumbbells the session was finished
 * with (`settingsFor`): it went up from `from` (not done heavier), or stayed at `to`.
 */
export function t3IncreaseOfVariantOutcome(
  outcome: Pick<VariantOutcome, "tier" | "kind" | "reason" | "from" | "to">,
  equipment: Dumbbells
): T3Increase | null {
  if (outcome.tier !== "T3" || (outcome.kind !== "t3Up" && outcome.kind !== "t3Same")) return null;
  const weight = outcome.kind === "t3Up" && outcome.reason !== "heavier" ? outcome.from.weight : outcome.to.weight;
  return homeT3Increase(weight, outcome.from.reps, equipment);
}

const num = (n: number) => formatNumber(n, 1);

/**
 * The exercise page's line: "Goes up at 20 reps on the last set. At 20 you would be
 * good for 15 at 55 lb." Bodyweight work names the number only; at the heaviest
 * dumbbell it says what reaching it does instead.
 */
export function t3GoesUpSentence(inc: T3Increase, unit: string): string {
  if (inc.nextWeight == null) {
    return `At your heaviest dumbbell: ${inc.threshold} reps on the last set adds reps or a harder exercise instead of weight.`;
  }
  const first = `Goes up at ${inc.threshold} reps on the last set.`;
  if (!(inc.weight > 0)) return first;
  return `${first} At ${inc.threshold} you would be good for ${inc.targetReps} at ${num(inc.nextWeight)} ${unit}.`;
}

/** The last T3 set's hint during a workout: "20 to move up". */
export function t3MoveUpHint(inc: T3Increase): string {
  return `${inc.threshold} to move up`;
}

/**
 * During a workout, right after a T3's last working set is logged: what happens to its
 * weight next time, or null when that set was not a T3's last (or the lift is held for
 * pain, a run or equipment, or was done lighter than planned, so it only counts as
 * logged). `entry` is the T3's plan entry, `sets` the workout's sets so far.
 */
export function t3NextTimeAfterSet(
  lastSet: SetLog | undefined,
  plan: readonly WorkoutExerciseState[],
  sets: SetLog[],
  equipment: Dumbbells
): { exerciseId: string; text: string } | null {
  if (!lastSet || lastSet.tier !== "T3") return null;
  const entry = plan.find((e) => !e.isWarmUp && e.tier === "T3" && e.exerciseId === lastSet.exerciseId);
  if (!entry || entry.completedSets < entry.targetSets || lastSet.weight < entry.weight) return null;
  const working = workingSetsFor(sets, entry.exerciseId, "T3");
  if (working.at(-1)?.id !== lastSet.id || getHoldReason("T3", working)) return null;
  const substituteExerciseId = lastSet.substituteExerciseId ?? entry.substituteExerciseId;
  const inc = t3IncreaseForEntry(
    { weight: lastSet.weight, targetReps: entry.targetReps, ...(substituteExerciseId ? { substituteExerciseId } : {}) },
    equipment
  );
  const perHand = !!substituteExerciseId && EXERCISES[substituteExerciseId]?.grip === "per_hand";
  return {
    exerciseId: substituteExerciseId ?? entry.exerciseId,
    text: t3NextTimeText(inc, lastSet.actualReps, perHand ? "lbs a hand" : "lbs"),
  };
}

/**
 * The one wording of a T3's last set against the reps it needed, used by every line that
 * states both (during the workout, What it did, the adjustment feed): "26 reps on the
 * last set, needed 18". It reads the same above, at and below the threshold.
 */
export function t3LastSetAgainst(lastSetReps: number, threshold: number): string {
  return `${plural(lastSetReps, "rep")} on the last set, needed ${threshold}`;
}

/**
 * After the last T3 set is logged: "20 reps on the last set, needed 20: 55 lb next
 * time", or "19 reps on the last set, needed 20: stays at 50 lb next time".
 */
export function t3NextTimeText(inc: T3Increase, lastSetReps: number, unit: string): string {
  const got = t3LastSetAgainst(lastSetReps, inc.threshold);
  if (lastSetReps < inc.threshold) return `${got}: stays at ${num(inc.weight)} ${unit} next time`;
  if (inc.nextWeight == null) return `${got}, at your heaviest dumbbell: more reps or a harder exercise next time`;
  return `${got}: ${num(inc.nextWeight)} ${unit} next time`;
}
