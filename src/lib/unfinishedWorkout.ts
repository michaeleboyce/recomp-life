// Workouts that were started and never finished. A workout left with "Leave, resume
// later" keeps its sets: within a day it is offered for resume; after that it waits
// for the user to save or discard it. Only a workout with no working set is ever
// cleared on its own (see `@/lib/data/unfinished`). Pure.
import type { WorkoutSession } from "@/types";

/** An unfinished workout started less than this long ago is offered for resume. */
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Unfinished = Pick<WorkoutSession, "completedAt" | "startedAt" | "sets" | "deletedAt">;

/** Sets logged that are not warm-ups. */
export function workingSetCount(workout: Pick<WorkoutSession, "sets">): number {
  return (workout.sets ?? []).filter((set) => set.tier !== "warmup").length;
}

/** Epoch milliseconds of a stored date, 0 when it is missing or unreadable. */
function time(value: Date | string | null | undefined): number {
  const ms = value == null ? NaN : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Neither finished nor deleted. */
export const isOpen = (workout: Unfinished) => workout.deletedAt == null && workout.completedAt == null;

/** Unfinished, not deleted, and started within the resume window. */
export function isResumable(workout: Unfinished, now: number): boolean {
  return isOpen(workout) && now - time(workout.startedAt) < RESUME_WINDOW_MS;
}

/**
 * Unfinished, not deleted, older than the resume window and holding at least one
 * working set: too old to resume, too much to throw away. Today asks what to do.
 */
export function isLeftWorkout(workout: Unfinished, now: number): boolean {
  return isOpen(workout) && !isResumable(workout, now) && workingSetCount(workout) > 0;
}

/**
 * When a left workout ended: the time of its last logged set, or its start when the
 * stored times are unreadable.
 */
export function leftWorkoutEnd(workout: Pick<WorkoutSession, "startedAt" | "sets">): Date {
  const last = Math.max(time(workout.startedAt), ...(workout.sets ?? []).map((s) => time(s.completedAt)));
  return new Date(last);
}
