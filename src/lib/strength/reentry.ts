/**
 * The first weight after a stretch at the other location (spec decision 3). Pure.
 *
 * Back at the gym after home sessions, the barbell weight is the smaller of
 * (a) the last barbell weight plus the steps the home passes earned and
 * (b) the heaviest weight at which the pooled estimate says the stage's reps are possible,
 * rounded down to a load the plates can make. The first home weight after gym sessions
 * follows the same rule in dumbbell steps, through the exercise's ratio, capped by the
 * heaviest dumbbell.
 *
 * @evidence strength-pooling
 */

import { describePlateLoad } from "@/lib/plates";
import type { EquipmentProfile } from "@/types";
import { asLifted } from "./estimate";

/** Which bound decided the weight, for the "why" trace. */
export type ReentryRule = "steps" | "estimate" | "cap";

export interface ReentryResult {
  weight: number;
  /** Rule (a), rounded to the equipment; null when there was no last weight. */
  fromSteps: number | null;
  /** Rule (b), rounded to the equipment; null when there was no estimate. */
  fromEstimate: number | null;
  rule: ReentryRule;
}

/**
 * The heaviest weight for `reps` reps to failure under the app's formula: the inverse of
 * `calculateE1RM` without the effort credit.
 */
export function impliedWeightForReps(estimatedMax: number, reps: number): number {
  return estimatedMax / (1 + reps / 30);
}

/** An estimate re-entry can work from: a positive, finite number (0 or NaN says nothing). */
function isUsableEstimate(estimate: number | null): estimate is number {
  return estimate !== null && Number.isFinite(estimate) && estimate > 0;
}

/** The heaviest load at or below `weight` the plates can make; never under the bar. */
export function roundDownToPlates(
  weight: number,
  equipment: Pick<EquipmentProfile, "barWeight" | "availablePlates">
): number {
  if (weight <= equipment.barWeight) return equipment.barWeight;
  return describePlateLoad(weight, equipment.barWeight, equipment.availablePlates).loadableWeight;
}

/** `weight` rounded down to the dumbbell increment; never under one increment. */
export function roundDownToDumbbell(weight: number, increment: number): number {
  if (!(increment > 0)) return weight;
  return Math.max(increment, Math.floor(weight / increment + 1e-9) * increment);
}

export interface BarbellReentryInput {
  /** The last barbell working weight for this lift and tier; null if never done. */
  lastWeight: number | null;
  /** Steps earned by home passes since then. */
  stepsEarned: number;
  /** Barbell increment per step for this lift. */
  stepLbs: number;
  /** The pooled estimate for the lift (`pooledLiftEstimate(...).value`); null if none. */
  estimate: number | null;
  /** Reps per set of the current stage (3 for 5×3, 2 for 6×2, 1 for 10×1, 10 for 3×10…). */
  targetReps: number;
  equipment: Pick<EquipmentProfile, "barWeight" | "availablePlates">;
}

/**
 * The barbell weight for the current stage on the first gym session after home
 * sessions. Null when there is neither a last weight nor an estimate.
 *
 * @evidence strength-pooling
 */
export function barbellReentryWeight(input: BarbellReentryInput): ReentryResult | null {
  const fromSteps =
    input.lastWeight === null
      ? null
      : roundDownToPlates(input.lastWeight + Math.max(0, input.stepsEarned) * input.stepLbs, input.equipment);
  const fromEstimate = isUsableEstimate(input.estimate)
    ? roundDownToPlates(impliedWeightForReps(input.estimate, input.targetReps), input.equipment)
    : null;
  if (fromSteps === null && fromEstimate === null) return null;
  if (fromEstimate !== null && (fromSteps === null || fromEstimate < fromSteps)) {
    return { weight: fromEstimate, fromSteps, fromEstimate, rule: "estimate" };
  }
  return { weight: fromSteps!, fromSteps, fromEstimate, rule: "steps" };
}

export interface HomeReentryInput {
  /** The last weight as lifted for this home exercise (per hand when it uses two); null if never done. */
  lastWeight: number | null;
  /** Steps earned by gym passes since then, in dumbbell increments. */
  stepsEarned: number;
  /** The pooled estimate for the program lift; null if none. */
  estimate: number | null;
  /** The exercise's ratio to the lift (`learnTransferRatio(...).ratio`); null if none. */
  ratio: number | null;
  /** The home exercise: decides whether the weight is per hand. */
  exerciseId: string;
  targetReps: number;
  equipment: Pick<EquipmentProfile, "maxDumbbellWeight" | "dumbbellIncrementLbs">;
}

/**
 * The home exercise's weight, as lifted, for the current stage on the first home session
 * after gym sessions: the smaller of the steps rule and the estimate rule, rounded down to
 * the dumbbell increment and capped by the heaviest dumbbell. Null when there is neither a
 * last weight nor an estimate with a ratio.
 *
 * @evidence strength-pooling
 */
export function homeReentryWeight(input: HomeReentryInput): ReentryResult | null {
  const step = input.equipment.dumbbellIncrementLbs;
  const fromSteps =
    input.lastWeight === null
      ? null
      : roundDownToDumbbell(input.lastWeight + Math.max(0, input.stepsEarned) * step, step);
  const fromEstimate =
    !isUsableEstimate(input.estimate) || input.ratio === null || !(input.ratio > 0)
      ? null
      : roundDownToDumbbell(
          asLifted(impliedWeightForReps(input.estimate * input.ratio, input.targetReps), input.exerciseId),
          step
        );
  if (fromSteps === null && fromEstimate === null) return null;

  const byEstimate = fromEstimate !== null && (fromSteps === null || fromEstimate < fromSteps);
  const smaller = byEstimate ? fromEstimate! : fromSteps!;
  const cap = input.equipment.maxDumbbellWeight;
  if (smaller > cap) return { weight: cap, fromSteps, fromEstimate, rule: "cap" };
  return { weight: smaller, fromSteps, fromEstimate, rule: byEstimate ? "estimate" : "steps" };
}
