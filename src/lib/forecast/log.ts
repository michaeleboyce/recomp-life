// Reading the log for the forecast models and resolvers. Pure.
import type { SetLog, SetStatus, WorkoutSession } from "@/types";

export { DAY_MS } from "@/lib/dates";

/** Epoch milliseconds of a stored date, which may be a Date or an ISO string. */
export function toMs(value: Date | string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  return new Date(value).getTime();
}

/** True for a row that has not been soft-deleted. */
export function isLive(row: { deletedAt?: number | null }): boolean {
  return row.deletedAt == null;
}

function compareIds(a: string | undefined, b: string | undefined): number {
  const x = a ?? "";
  const y = b ?? "";
  return x < y ? -1 : x > y ? 1 : 0;
}

/** What `finishedBy` reads of a workout: its finish, id and deletion. */
export type FinishedRow = Pick<WorkoutSession, "completedAt"> & { id?: string; deletedAt?: number | null };

/**
 * The workouts a model may learn from at `nowMs`: finished by then and not deleted,
 * oldest finish first (ties by id, so the order never depends on the input order).
 */
export function finishedBy<W extends FinishedRow>(workouts: readonly W[], nowMs: number): W[] {
  return workouts
    .filter((w) => isLive(w) && w.completedAt != null && toMs(w.completedAt) <= nowMs)
    .sort((a, b) => toMs(a.completedAt) - toMs(b.completedAt) || compareIds(a.id, b.id));
}

/** Statuses that freeze progression: the set was skipped or lightened for a reason. */
const FREEZE_STATUSES: ReadonlySet<SetStatus> = new Set([
  "skipped_pain",
  "reduced_run_fatigue",
  "reduced_equipment",
]);

export function hasFreeze(sets: SetLog[]): boolean {
  return sets.some((set) => FREEZE_STATUSES.has(set.status));
}

export function hasLoadDrop(sets: SetLog[]): boolean {
  return sets.some((set) => set.status === "autoregulated_load_drop");
}

/** The exercise a set was performed with: the substitute when there was one. */
export function performedExerciseId(
  set: Pick<SetLog, "exerciseId" | "substituteExerciseId">
): string {
  return set.substituteExerciseId || set.exerciseId;
}

/** The "as many as you can" set among a tier's sets: the last one flagged so, if any. */
export function lastSetOf(sets: SetLog[]): SetLog | null {
  let last: SetLog | null = null;
  for (const set of sets) {
    if (set.isAMRAP && (!last || set.setNumber >= last.setNumber)) last = set;
  }
  return last;
}
