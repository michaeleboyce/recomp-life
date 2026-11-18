/**
 * Estimated 1-Rep Max (e1RM) calculation module.
 *
 * Uses the Epley formula: e1RM = weight * (1 + reps / 30)
 *
 * Epley assumes the set was taken to failure. When the lifter says how many reps
 * they had left, those reps (`repsInReserveCredit`) are added before the formula
 * is applied, so stopping a rep early does not read as a strength drop.
 *
 * @evidence e1rm-estimate
 */

import type { RepsInReserve, Tier } from "@/types";
import { RIR_ESTIMATE, repsInReserveCredit } from "@/lib/effort";

export type E1RMTrend = "increasing" | "decreasing" | "stable" | "insufficient_data";

/**
 * Sets longer than this are not used for e1RM: rep-max formulas get less
 * reliable as reps climb and differ more between exercises and people.
 */
export const E1RM_MAX_REPS = 10;

/** Most reps in reserve credited to a set: the "3+" answer counts as its floor. */
export const E1RM_MAX_REPS_IN_RESERVE = RIR_ESTIMATE["3+"];

/** How many recent e1RM values are kept per lift for trend detection. */
export const E1RM_SERIES_LENGTH = 5;

/**
 * Calculate estimated 1-rep max using the Epley formula.
 *
 * @param weight - The working weight used
 * @param reps - The number of reps completed
 * @param repsInReserve - Optional answer for the set; the reps it counts for are added to `reps`
 * @returns The estimated 1RM rounded to the nearest integer, or null if reps < 2
 */
export function calculateE1RM(
  weight: number,
  reps: number,
  repsInReserve?: RepsInReserve | null
): number | null {
  if (reps < 2) return null;
  const effectiveReps = reps + repsInReserveCredit(repsInReserve);
  return Math.round(weight * (1 + effectiveReps / 30));
}

/**
 * Whether a logged set should be saved as an e1RM data point.
 *
 * Only heavy T1 AMRAP sets of 2..E1RM_MAX_REPS reps qualify. High-rep T3 AMRAP
 * sets are excluded because the estimate is unreliable at 15-25 reps.
 */
export function isE1RMEligibleSet(
  tier: Tier,
  isAMRAP: boolean,
  reps: number
): boolean {
  return tier === "T1" && isAMRAP && reps >= 2 && reps <= E1RM_MAX_REPS;
}

/**
 * Build the recent e1RM series for a lift from stored entries.
 *
 * Returns the last `n` values in chronological order (oldest first, newest
 * last), which is the order getE1RMTrend and the fatigue checks expect.
 */
export function toRecentE1RMSeries(
  entries: ReadonlyArray<{ date: Date | string; estimated1RM: number }>,
  n: number = E1RM_SERIES_LENGTH
): number[] {
  return [...entries]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-n)
    .map((e) => e.estimated1RM);
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
