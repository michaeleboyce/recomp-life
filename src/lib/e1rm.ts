/**
 * Estimated 1-Rep Max (e1RM) calculation module.
 *
 * Uses the Epley formula: e1RM = weight * (1 + reps / 30)
 */

export type E1RMTrend = "increasing" | "decreasing" | "stable" | "insufficient_data";

/**
 * Calculate estimated 1-rep max using the Epley formula.
 *
 * @param weight - The working weight used
 * @param reps - The number of reps completed
 * @returns The estimated 1RM rounded to the nearest integer, or null if reps < 2
 */
export function calculateE1RM(weight: number, reps: number): number | null {
  if (reps < 2) return null;
  return Math.round(weight * (1 + reps / 30));
}

/**
 * Determine whether the current e1RM is a new personal record.
 *
 * @param currentE1RM - The e1RM from the current session
 * @param previousE1RMs - Array of all previous e1RM values for this exercise
 * @returns true if this is a new PR (strictly greater than all previous values)
 */
export function isNewPR(currentE1RM: number, previousE1RMs: number[]): boolean {
  if (previousE1RMs.length === 0) return true;
  return currentE1RM > Math.max(...previousE1RMs);
}

/**
 * Determine the trend direction from recent e1RM values.
 *
 * Examines the last 3 values to determine if the trend is increasing,
 * decreasing, stable (non-monotonic), or if there is insufficient data.
 *
 * @param recentE1RMs - Array of recent e1RM values in chronological order
 * @returns The trend classification
 */
export function getE1RMTrend(recentE1RMs: number[]): E1RMTrend {
  if (recentE1RMs.length < 3) return "insufficient_data";

  const last3 = recentE1RMs.slice(-3);
  const allIncreasing = last3[1] > last3[0] && last3[2] > last3[1];
  const allDecreasing = last3[1] < last3[0] && last3[2] < last3[1];

  if (allIncreasing) return "increasing";
  if (allDecreasing) return "decreasing";
  return "stable";
}
