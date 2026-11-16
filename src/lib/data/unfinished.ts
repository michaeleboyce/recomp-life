// Data layer: unfinished workouts. Clears the empty stale ones and saves a left one
// as it was left. Which workouts these are is decided in `@/lib/unfinishedWorkout`.
import { db } from "@/db/local";
import {
  isOpen,
  isResumable,
  leftWorkoutEnd,
  workingSetCount,
} from "@/lib/unfinishedWorkout";
import { discardWorkout, finishWorkout } from "./workouts";

/** Epoch milliseconds of a stored date, 0 when it is missing or unreadable. */
function time(value: Date | string | null | undefined): number {
  const ms = value == null ? NaN : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Discards every unfinished workout older than the resume window that has no working
 * set, and returns how many went. A workout with any working set is never discarded
 * here: the user decides (see `isLeftWorkout`).
 */
export async function discardEmptyStaleWorkouts(now: number = Date.now()): Promise<number> {
  const empty = (await db.workouts.toArray()).filter(
    (w) => isOpen(w) && !isResumable(w, now) && workingSetCount(w) === 0
  );
  for (const workout of empty) {
    await discardWorkout(workout.id);
  }
  return empty.length;
}

/**
 * "End & save" for a left workout: finishes it as it was left, dated at its last set
 * (not now, days later), so progression counts what was logged and freezes the rest,
 * as ending early on the workout screen does. Rejects when the workout is missing,
 * deleted or already finished.
 */
export async function saveLeftWorkout(workoutId: string): Promise<void> {
  const workout = await db.workouts.get(workoutId);
  if (!workout || !isOpen(workout)) {
    throw new Error(`saveLeftWorkout: workout ${workoutId} is not an open workout`);
  }
  const completedAt = leftWorkoutEnd(workout);
  await finishWorkout(workoutId, {
    completedAt,
    totalDurationSeconds: Math.max(
      0,
      Math.floor((completedAt.getTime() - time(workout.startedAt)) / 1000)
    ),
    endedEarly: true,
  });
}

/**
 * Discards a workout only while it is still unfinished and not deleted: the open
 * workout a new one replaces, which may have been finished elsewhere meanwhile.
 */
export async function discardIfUnfinished(workoutId: string): Promise<boolean> {
  const workout = await db.workouts.get(workoutId);
  if (!workout || !isOpen(workout)) return false;
  await discardWorkout(workoutId);
  return true;
}
