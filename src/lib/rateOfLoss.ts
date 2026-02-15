/**
 * Rate-of-loss analysis library.
 *
 * Calculates weekly rate of weight loss from a window of daily weigh-ins
 * and provides stall-protocol suggestions when progress plateaus.
 */

export type RateZone = "green" | "yellow" | "red" | "stall";

export interface WeeklyRateResult {
  lbsPerWeek: number;
  percentPerWeek: number;
  zone: RateZone;
}

/**
 * Calculate the weekly rate of weight loss over a rolling window.
 *
 * Uses a simple linear approach: compare the average of the first half
 * of the window to the average of the second half, then annualize to
 * a per-week figure.
 *
 * @returns null if fewer than 7 entries are provided.
 *
 * Zone thresholds (by %BW/week):
 *   green:  0.5–1.0%
 *   yellow: 0.25–0.5% OR 1.0–1.5%
 *   red:    >1.5%
 *   stall:  <0.25%
 */
export function calculateWeeklyRateOfLoss(
  weightEntries: { date: Date; weight: number }[],
  windowDays: number = 14
): WeeklyRateResult | null {
  if (weightEntries.length < 7) return null;

  // Sort entries by date ascending
  const sorted = [...weightEntries].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Take only the most recent `windowDays` worth of entries
  const cutoffDate = new Date(sorted[sorted.length - 1].date);
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);
  const windowEntries = sorted.filter((e) => e.date >= cutoffDate);

  if (windowEntries.length < 7) return null;

  // Split into first half and second half
  const midpoint = Math.floor(windowEntries.length / 2);
  const firstHalf = windowEntries.slice(0, midpoint);
  const secondHalf = windowEntries.slice(midpoint);

  const firstAvg =
    firstHalf.reduce((sum, e) => sum + e.weight, 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, e) => sum + e.weight, 0) / secondHalf.length;

  // Weight lost (positive means losing weight)
  const weightLost = firstAvg - secondAvg;

  // Calculate the actual time span in days between the midpoints of each half
  const firstMidDate = firstHalf[Math.floor(firstHalf.length / 2)].date;
  const secondMidDate = secondHalf[Math.floor(secondHalf.length / 2)].date;
  const spanDays =
    (secondMidDate.getTime() - firstMidDate.getTime()) / (1000 * 60 * 60 * 24);

  // Avoid division by zero
  if (spanDays <= 0) return null;

  const lbsPerWeek = (weightLost / spanDays) * 7;
  const percentPerWeek = (lbsPerWeek / firstAvg) * 100;

  const zone = classifyZone(percentPerWeek);

  return {
    lbsPerWeek: Math.round(lbsPerWeek * 100) / 100,
    percentPerWeek: Math.round(percentPerWeek * 100) / 100,
    zone,
  };
}

function classifyZone(percentPerWeek: number): RateZone {
  const abs = Math.abs(percentPerWeek);

  // Weight gain or negligible loss
  if (percentPerWeek < 0.25) return "stall";
  if (abs >= 0.25 && abs < 0.5) return "yellow";
  if (abs >= 0.5 && abs <= 1.0) return "green";
  if (abs > 1.0 && abs <= 1.5) return "yellow";
  // >1.5%
  return "red";
}

/**
 * Provide a stall-protocol suggestion based on rate-of-loss metrics.
 *
 * @param weeklyRate   lbs lost per week (positive = losing)
 * @param percentPerWeek  % of BW lost per week
 * @param consecutiveStallWeeks  how many consecutive weeks rate has been <0.25%
 * @returns A suggestion string, or null if no stall.
 */
export function getStallProtocolSuggestion(
  weeklyRate: number,
  percentPerWeek: number,
  consecutiveStallWeeks: number
): string | null {
  if (percentPerWeek >= 0.25) return null;

  if (consecutiveStallWeeks < 3) return null;

  if (consecutiveStallWeeks <= 4) {
    return "Increase daily steps by 2,000 before cutting calories further";
  }

  // Stalled for 5+ weeks — suggest a modest calorie reduction
  return "Consider reducing daily intake by 100-150 calories";
}
