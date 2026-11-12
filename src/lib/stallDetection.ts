import type { TrainingPhase, StallAlert } from "@/types";
import { collapseToDailyMeans } from "./rateOfLoss";

/**
 * Detect a fat loss stall by comparing 7-day rolling averages.
 * Only runs during cutting phase. Needs weigh-ins on 14+ days: the entries may be in
 * any order, and several on one day count as one day (their mean).
 *
 * Used by BodyweightChart, which is not mounted on any screen yet.
 *
 * @evidence fat-loss-stall
 */
export function detectFatLossStall(
  weights: { date: Date; weight: number }[],
  phase: TrainingPhase
): StallAlert | null {
  if (phase.mode !== "cutting") return null;

  const daily = collapseToDailyMeans(weights);
  if (daily.length < 14) return null;

  // The last 14 days with a weigh-in, oldest first
  const recent = daily.slice(-14);

  const previousWeek = recent.slice(0, 7);
  const currentWeek = recent.slice(7);

  const prevAvg = previousWeek.reduce((sum, w) => sum + w.weight, 0) / previousWeek.length;
  const currAvg = currentWeek.reduce((sum, w) => sum + w.weight, 0) / currentWeek.length;

  const difference = Math.round((prevAvg - currAvg) * 100) / 100;

  if (difference < 0.3) {
    return {
      detected: true,
      message: `Weight loss has stalled. 7-day avg: ${currAvg.toFixed(1)} lbs (was ${prevAvg.toFixed(1)} lbs).`,
      suggestions: [
        "Re-check your calorie deficit — tracking accuracy tends to drift",
        "Add 1-2 cardio sessions per week",
        "Consider a 1-week diet break at maintenance calories",
      ],
    };
  }

  return null;
}
