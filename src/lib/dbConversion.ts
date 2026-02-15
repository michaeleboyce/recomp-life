/**
 * Dumbbell-to-Barbell Conversion Utilities
 *
 * Uses a ~20% reduction rule: dumbbells require about 20% less total weight
 * than the barbell equivalent because of the additional stabilization demand.
 */

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
  const totalDumbbellWeight = barbellWeight * 0.80;
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
  return roundToNearest5(barbellWeight * 0.80);
}

/**
 * Converts a dumbbell weight per hand back to the barbell equivalent.
 *
 * Total dumbbell = per-hand x 2, then multiply by 1.20 (inverse of 0.80)
 * and round to nearest 5 lbs.
 *
 * Example: 60 lb per hand -> 60 * 2 = 120, * 1.20 = 144, round to 145 lb barbell
 */
export function dumbbellToBarbell(dumbbellPerHand: number): number {
  const totalDumbbell = dumbbellPerHand * 2;
  return roundToNearest5(totalDumbbell * 1.20);
}
