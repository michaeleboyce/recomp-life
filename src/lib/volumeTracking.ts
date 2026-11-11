import type {
  Exercise,
  SetLog,
  MuscleGroupVolume,
  WeeklyVolumeSummary,
  WorkoutSession,
} from "@/types";
import { EXERCISES } from "./exercises";
import { MUSCLE_GROUPS, type DisplayGroup } from "./muscles";

/**
 * Returns the exercise a set counts toward, or null when the set earns no
 * volume: warm-ups, pain skips, and unknown exercise ids. A substitute
 * exercise, when present, is the one that was actually performed.
 */
export function getCountedExercise(set: SetLog): Exercise | null {
  if (set.tier === "warmup") return null;
  if (set.status === "skipped_pain") return null;
  const exerciseId = set.substituteExerciseId || set.exerciseId;
  return EXERCISES[exerciseId] ?? null;
}

function emptyVolume(): MuscleGroupVolume {
  return { directSets: 0, indirectSets: 0, totalFractional: 0 };
}

/**
 * Calculate volume per muscle (keyed by MuscleId) from completed sets.
 * Primary muscles get full credit (1.0 per set).
 * Secondary muscles get half credit (0.5 per set).
 * Stabilisers get no volume credit.
 *
 * @evidence weekly-volume
 */
export function calculateMuscleGroupVolume(
  completedSets: SetLog[]
): Record<string, MuscleGroupVolume> {
  const volumes: Record<string, MuscleGroupVolume> = {};

  for (const set of completedSets) {
    const exercise = getCountedExercise(set);
    if (!exercise) continue;

    for (const muscle of exercise.primaryMuscles) {
      const v = (volumes[muscle] ??= emptyVolume());
      v.directSets += 1;
      v.totalFractional += 1.0;
    }

    for (const muscle of exercise.secondaryMuscles) {
      const v = (volumes[muscle] ??= emptyVolume());
      v.indirectSets += 1;
      v.totalFractional += 0.5;
    }
  }

  return volumes;
}

/**
 * Calculate volume per display group (Chest, Back, Shoulders, ...).
 *
 * A set credits each group at most once, at the highest level among that
 * group's member muscles: a group with a primary member gets one direct set;
 * a group with only secondary members gets one indirect set at 0.5.
 */
export function calculateGroupVolume(
  completedSets: SetLog[]
): Partial<Record<DisplayGroup, MuscleGroupVolume>> {
  const volumes: Partial<Record<DisplayGroup, MuscleGroupVolume>> = {};
  const groups = Object.entries(MUSCLE_GROUPS) as [DisplayGroup, string[]][];

  for (const set of completedSets) {
    const exercise = getCountedExercise(set);
    if (!exercise) continue;

    const primary = new Set<string>(exercise.primaryMuscles);
    const secondary = new Set<string>(exercise.secondaryMuscles);

    for (const [group, members] of groups) {
      if (members.some((m) => primary.has(m))) {
        const v = (volumes[group] ??= emptyVolume());
        v.directSets += 1;
        v.totalFractional += 1.0;
      } else if (members.some((m) => secondary.has(m))) {
        const v = (volumes[group] ??= emptyVolume());
        v.indirectSets += 1;
        v.totalFractional += 0.5;
      }
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
