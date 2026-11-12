import type { InactivityAlert } from "@/types";
import { LONG_BREAK_DAYS } from "./recovery";

export function getDaysSinceLastWorkout(
  lastCompletedWorkoutDate: Date | null,
  now: Date
): number {
  if (!lastCompletedWorkoutDate) return Infinity;
  return (now.getTime() - lastCompletedWorkoutDate.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Reminder levels by days since the last completed workout.
 *
 * A week or two off costs little or no strength, so the first two levels only
 * nudge. Easing back in is suggested from LONG_BREAK_DAYS, the same threshold
 * the weight-decay rule uses.
 *
 * @evidence time-off
 */
export function checkInactivity(daysSinceLastWorkout: number): InactivityAlert | null {
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
