import type { InactivityAlert } from "@/types";

export function getDaysSinceLastWorkout(
  lastCompletedWorkoutDate: Date | null,
  now: Date
): number {
  if (!lastCompletedWorkoutDate) return Infinity;
  return (now.getTime() - lastCompletedWorkoutDate.getTime()) / (1000 * 60 * 60 * 24);
}

export function checkInactivity(daysSinceLastWorkout: number): InactivityAlert | null {
  if (daysSinceLastWorkout < 5) return null;

  if (daysSinceLastWorkout < 7) {
    return {
      level: "gentle",
      message: "It's been a few days since your last workout. Time to get back in the gym?",
      prescription: "normal_workout",
    };
  }

  if (daysSinceLastWorkout < 10) {
    return {
      level: "urgent",
      message: "It's been over a week. Your consistency streak is at risk!",
      prescription: "normal_workout",
    };
  }

  return {
    level: "detraining",
    message: "It's been 10+ days. Start back at 85% to avoid injury.",
    prescription: "ramp_up_85",
  };
}
