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

/** Total dumbbell load as a fraction of the barbell load. */
export const DUMBBELL_LOAD_FACTOR = 0.8;

/** Multiplier used to turn a total dumbbell load back into a barbell load. */
export const BARBELL_FROM_DUMBBELL_FACTOR = 1.2;

/**
 * Rounds a weight value to the nearest 5 lbs (standard plate increment).
 */
export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

/**
 * Converts a barbell weight to the equivalent dumbbell weight per hand.
 *
 * Total DB weight = barbell x 0.80, then divide by 2 (one per hand)
 * and round each DB to the nearest 5 lbs.
 *
 * Example: 145 lb barbell -> 145 * 0.80 = 116, / 2 = 58, round to 60 lb per hand
 */
export function barbellToDumbbell(barbellWeight: number): number {
  const totalDumbbellWeight = barbellWeight * DUMBBELL_LOAD_FACTOR;
  return roundToNearest5(totalDumbbellWeight / 2);
}

/**
 * Converts a barbell weight to a single dumbbell held with both hands.
 *
 * Total DB weight = barbell x 0.80 (no division — one dumbbell only)
 * and round to the nearest 5 lbs.
 *
 * Example: 135 lb barbell -> 135 * 0.80 = 108, round to 110 lb single dumbbell
 */
export function barbellToBothHands(barbellWeight: number): number {
  return roundToNearest5(barbellWeight * DUMBBELL_LOAD_FACTOR);
}

/**
 * Converts a dumbbell weight per hand back to the barbell equivalent.
 *
 * Total dumbbell = per-hand x 2, then multiply by 1.20
 * and round to nearest 5 lbs.
 *
 * Example: 60 lb per hand -> 60 * 2 = 120, * 1.20 = 144, round to 145 lb barbell
 */
export function dumbbellToBarbell(dumbbellPerHand: number): number {
  const totalDumbbell = dumbbellPerHand * 2;
  return roundToNearest5(totalDumbbell * BARBELL_FROM_DUMBBELL_FACTOR);
}
