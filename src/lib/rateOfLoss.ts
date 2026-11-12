/**
 * Rate-of-loss analysis library.
 *
 * Calculates weekly rate of weight loss from a window of daily weigh-ins
 * and provides stall-protocol suggestions when progress plateaus.
 *
 * Not connected to the UI yet.
 *
 * @evidence rate-of-loss
 */

import { calendarDaysBetween } from "./dates";

/**
 * "gaining" is weight going up by more than the stall band: off target during a cut,
 * but not a stall. A change of less than STALL_BAND_PERCENT either way is a "stall".
 */
export type RateZone = "green" | "yellow" | "red" | "stall" | "gaining";

/** Weekly change (% of bodyweight, either direction) below which weight counts as flat. */
export const STALL_BAND_PERCENT = 0.25;

export interface WeeklyRateResult {
  lbsPerWeek: number;
  percentPerWeek: number;
  zone: RateZone;
}

/**
 * One entry per local calendar day (the mean of that day's weigh-ins, dated at local
 * midnight), oldest first. Entries with an invalid date are dropped. Dates may be ISO
 * strings on rows synced from another device, so each is wrapped with `new Date`.
 */
export function collapseToDailyMeans(
  entries: ReadonlyArray<{ date: Date; weight: number }>
): { date: Date; weight: number }[] {
  const byDay = new Map<number, { sum: number; count: number }>();
  for (const entry of entries) {
    const date = new Date(entry.date);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (!Number.isFinite(day)) continue;
    const bucket = byDay.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += entry.weight;
    bucket.count += 1;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, { sum, count }]) => ({ date: new Date(day), weight: sum / count }));
}

/**
 * Calculate the weekly rate of weight loss over a rolling window.
 *
 * Uses a simple linear approach: compare the average of the first half
 * of the window to the average of the second half, then annualize to
 * a per-week figure.
 *
 * Several weigh-ins on one day count as one day (their mean).
 *
 * @returns null if fewer than 7 days have a weigh-in.
 *
 * Zone thresholds (by %BW/week lost):
 *   green:   0.5–1.0%
 *   yellow:  0.25–0.5% OR 1.0–1.5%
 *   red:     >1.5%
 *   stall:   between a 0.25% gain and a 0.25% loss
 *   gaining: a gain of 0.25% or more
 */
export function calculateWeeklyRateOfLoss(
  weightEntries: { date: Date; weight: number }[],
  windowDays: number = 14
): WeeklyRateResult | null {
  // One value per day, sorted by date ascending
  const sorted = collapseToDailyMeans(weightEntries);
  if (sorted.length < 7) return null;

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
  // Whole calendar days: both dates are local midnights, which are 23 or 25 hours
  // apart across a clock change.
  const spanDays = calendarDaysBetween(firstMidDate, secondMidDate);

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
  // Going up: off target while cutting, but not a stall
  if (percentPerWeek <= -STALL_BAND_PERCENT) return "gaining";
  // Negligible change either way
  if (percentPerWeek < STALL_BAND_PERCENT) return "stall";
  if (percentPerWeek < 0.5) return "yellow";
  if (percentPerWeek <= 1.0) return "green";
  if (percentPerWeek <= 1.5) return "yellow";
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
