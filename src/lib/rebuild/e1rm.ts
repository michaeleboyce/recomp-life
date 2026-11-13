import { calculateE1RM, isE1RMEligibleSet } from "@/lib/e1rm";
import type { Estimated1RM, WorkoutSession } from "@/types";

/** Epoch milliseconds of a stored date, which may be a Date or an ISO string. */
export function timeOf(date: Date | string | number): number {
  return new Date(date).getTime();
}

/** The deterministic id of the e1RM row computed from one set of one workout. */
export function e1rmRowId(workoutId: string, setId: string): string {
  return `e1rm:${workoutId}:${setId}`;
}

/**
 * The e1RM rows for one workout's eligible sets, with ids `e1rm:<workoutId>:<setId>`.
 * Same rule as logging a set live: heavy T1 AMRAP sets of the lift itself. A home
 * substitute's dumbbell weight says nothing about the barbell lift, so it gives no row.
 */
export function e1rmsForWorkout(workout: WorkoutSession): Estimated1RM[] {
  const rows: Estimated1RM[] = [];
  for (const set of workout.sets ?? []) {
    if (set.isSubstituted || set.substituteExerciseId) continue;
    if (!isE1RMEligibleSet(set.tier, set.isAMRAP, set.actualReps)) continue;
    const estimated1RM = calculateE1RM(set.weight, set.actualReps, set.rpe);
    if (!estimated1RM) continue;
    const id = e1rmRowId(workout.id, set.id);
    rows.push({
      id,
      clientId: id,
      date: new Date(set.completedAt),
      exerciseId: set.exerciseId,
      workingWeight: set.weight,
      repsCompleted: set.actualReps,
      estimated1RM,
      workoutSessionId: workout.id,
      setId: set.id,
      synced: true,
    });
  }
  return rows;
}

/** Oldest first, then by id: the order of `RebuildResult.e1rms`. */
export function sortE1RMs(rows: Estimated1RM[]): Estimated1RM[] {
  return [...rows].sort(
    (a, b) => timeOf(a.date) - timeOf(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
