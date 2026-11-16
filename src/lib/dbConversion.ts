/**
 * Dumbbell-to-Barbell Conversion Utilities
 *
 * Uses a ~20% reduction rule: dumbbells require about 20% less total weight
 * than the barbell equivalent because of the additional stabilization demand.
 * Measured for the bench press (dumbbell 1RM about 17% below barbell); applied
 * to other lifts as an approximation.
 *
 * @evidence dumbbell-conversion
 */

import type { DumbbellGrip } from '@/types';

/** Total dumbbell load as a fraction of the barbell load. */
export const DUMBBELL_LOAD_FACTOR = 0.8;

/**
 * Multiplier that turns a total dumbbell load back into a barbell load: the inverse of
 * DUMBBELL_LOAD_FACTOR, so a weight converted there and back lands where it began.
 */
export const BARBELL_FROM_DUMBBELL_FACTOR = 1 / DUMBBELL_LOAD_FACTOR;

/** The step used when none is given: the usual dumbbell and plate increment. */
const DEFAULT_STEP = 5;

/**
 * Rounds a weight value to the nearest 5 lbs (standard plate increment).
 */
export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

/** Rounds to the nearest multiple of `step` (5 lb when the step is not a positive number). */
export function roundToStep(weight: number, step: number = DEFAULT_STEP): number {
  const s = step > 0 ? step : DEFAULT_STEP;
  return Math.round(weight / s) * s;
}

/** Rounds up to the next multiple of `step` (5 lb when the step is not a positive number). */
export function ceilToStep(weight: number, step: number = DEFAULT_STEP): number {
  const s = step > 0 ? step : DEFAULT_STEP;
  // A hair under the multiple counts as on it: floating error must not add a step.
  return Math.ceil(weight / s - 1e-9) * s;
}

/**
 * Converts a barbell weight to the equivalent dumbbell weight per hand.
 *
 * Total DB weight = barbell x 0.80, then divide by 2 (one per hand)
 * and round each DB to the dumbbell step (5 lbs unless given).
 *
 * Example: 145 lb barbell -> 145 * 0.80 = 116, / 2 = 58, round to 60 lb per hand
 */
export function barbellToDumbbell(barbellWeight: number, step: number = DEFAULT_STEP): number {
  const totalDumbbellWeight = barbellWeight * DUMBBELL_LOAD_FACTOR;
  return roundToStep(totalDumbbellWeight / 2, step);
}

/**
 * Converts a barbell weight to a single dumbbell held with both hands.
 *
 * Total DB weight = barbell x 0.80 (no division — one dumbbell only)
 * and round to the dumbbell step (5 lbs unless given).
 *
 * Example: 135 lb barbell -> 135 * 0.80 = 108, round to 110 lb single dumbbell
 */
export function barbellToBothHands(barbellWeight: number, step: number = DEFAULT_STEP): number {
  return roundToStep(barbellWeight * DUMBBELL_LOAD_FACTOR, step);
}

/**
 * Converts a dumbbell weight back to the barbell equivalent, rounded to 5 lbs.
 *
 * Per hand (the default): total = weight x 2. One dumbbell held in both hands, or one
 * dumbbell in one hand: total = weight. Then total / 0.80.
 *
 * Example: 60 lb per hand -> 60 * 2 = 120, / 0.80 = 150 lb barbell
 */
export function dumbbellToBarbell(dumbbellWeight: number, grip: DumbbellGrip = 'per_hand'): number {
  const totalDumbbell = grip === 'per_hand' ? dumbbellWeight * 2 : dumbbellWeight;
  return roundToNearest5(totalDumbbell * BARBELL_FROM_DUMBBELL_FACTOR);
}
