import type { SetLog, MuscleGroupVolume, WeeklyVolumeSummary, WorkoutSession } from "@/types";
import { EXERCISES } from "./exercises";

/**
 * Calculate muscle group volume from completed sets.
 * Primary muscles get full credit (1.0 per set).
 * Secondary muscles get half credit (0.5 per set).
 * Warm-up sets are excluded.
 */
export function calculateMuscleGroupVolume(
  completedSets: SetLog[]
): Record<string, MuscleGroupVolume> {
  const volumes: Record<string, MuscleGroupVolume> = {};

  const ensureGroup = (muscle: string) => {
    if (!volumes[muscle]) {
      volumes[muscle] = { directSets: 0, indirectSets: 0, totalFractional: 0 };
    }
  };

  for (const set of completedSets) {
    // Skip warm-up sets
    if (set.tier === "warmup") continue;
    // Skip failed/skipped sets
    if (set.status === "skipped_pain") continue;

    const exerciseId = set.substituteExerciseId || set.exerciseId;
    const exercise = EXERCISES[exerciseId];
    if (!exercise) continue;

    // Primary muscles: +1 direct set, +1.0 fractional
    for (const muscle of exercise.primaryMuscles) {
      ensureGroup(muscle);
      volumes[muscle].directSets += 1;
      volumes[muscle].totalFractional += 1.0;
    }

    // Secondary muscles: +1 indirect set, +0.5 fractional
    for (const muscle of exercise.secondaryMuscles) {
      ensureGroup(muscle);
      volumes[muscle].indirectSets += 1;
      volumes[muscle].totalFractional += 0.5;
    }
  }

  return volumes;
}

/**
 * Get weekly volume summary for a given week.
 * Aggregates all completed workouts within the week (Mon-Sun).
 */
export function getWeeklyVolumeSummary(
  workouts: WorkoutSession[],
  weekStart: Date
): WeeklyVolumeSummary {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Filter workouts in this week that are completed
  const weekWorkouts = workouts.filter(w => {
    if (!w.completedAt) return false;
    const started = new Date(w.startedAt);
    return started >= weekStart && started < weekEnd;
  });

  // Collect all sets from these workouts
  const allSets: SetLog[] = [];
  for (const workout of weekWorkouts) {
    allSets.push(...workout.sets);
  }

  return {
    weekStartDate: weekStart,
    muscleGroups: calculateMuscleGroupVolume(allSets),
  };
}
