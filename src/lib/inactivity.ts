import type { InactivityAlert } from "@/types";
import { LONG_BREAK_DAYS } from "./recovery";

/**
 * Days (fractional) since the last completed workout, or null when there has never
 * been one: "never trained" is not a long break. The date may be an ISO string on a
 * row synced from another device; an unreadable date also gives null.
 */
export function getDaysSinceLastWorkout(
  lastCompletedWorkoutDate: Date | null,
  now: Date
): number | null {
  if (!lastCompletedWorkoutDate) return null;
  const last = new Date(lastCompletedWorkoutDate).getTime();
  if (!Number.isFinite(last)) return null;
  return (now.getTime() - last) / (1000 * 60 * 60 * 24);
}

/**
 * Reminder levels by days since the last completed workout.
 *
 * A week or two off costs little or no strength, so the first two levels only
 * nudge. Easing back in is suggested from LONG_BREAK_DAYS, the same threshold
 * the weight-decay rule uses.
 *
 * `null` (no completed workout yet) never alerts: there is nothing to come back to.
 *
 * @evidence time-off
 */
export function checkInactivity(daysSinceLastWorkout: number | null): InactivityAlert | null {
  if (daysSinceLastWorkout === null || Number.isNaN(daysSinceLastWorkout)) return null;
  if (daysSinceLastWorkout < 5) return null;

  if (daysSinceLastWorkout < 7) {
    return {
      level: "gentle",
      message: "It's been a few days since your last workout. Time to get back in the gym?",
      prescription: "normal_workout",
    };
  }

  if (daysSinceLastWorkout < LONG_BREAK_DAYS) {
    return {
      level: "urgent",
      message: "It's been over a week. Your consistency streak is at risk!",
      prescription: "normal_workout",
    };
  }

  return {
    level: "detraining",
    message: "It's been 3+ weeks. Ease back in with slightly lighter weights and build back up.",
    prescription: "ease_back_in",
  };
}
