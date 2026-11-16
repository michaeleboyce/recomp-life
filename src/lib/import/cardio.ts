/**
 * Which imported cardio entries to add: none that is already stored, and none that
 * overlaps in time with a run or activity already logged (by hand, from Apple Health or
 * from another export). Pure.
 */
import type { CardioRow } from "./records";

/** The time a logged session takes up. */
export interface TimedRow {
  id: string;
  date: Date | string;
  durationMinutes: number;
  deletedAt?: number | null;
}

/**
 * The shortest time an entry is taken to last, so an entry logged with a very short
 * duration still meets one that started at the same moment.
 */
export const MIN_OVERLAP_MINUTES = 1;

const MINUTE_MS = 60_000;

/** Start and end of an entry, epoch ms; null when its date is unreadable. */
export function intervalOf(row: Pick<TimedRow, "date" | "durationMinutes">): [number, number] | null {
  const start = new Date(row.date).getTime();
  if (!Number.isFinite(start)) return null;
  const minutes = Math.max(Number.isFinite(row.durationMinutes) ? row.durationMinutes : 0, MIN_OVERLAP_MINUTES);
  return [start, start + minutes * MINUTE_MS];
}

/**
 * Two entries overlap when they share any moment: one starts before the other ends.
 * One that starts exactly when the other ends does not overlap it.
 */
export function overlaps(a: Pick<TimedRow, "date" | "durationMinutes">, b: Pick<TimedRow, "date" | "durationMinutes">): boolean {
  const x = intervalOf(a);
  const y = intervalOf(b);
  if (!x || !y) return false;
  return x[0] < y[1] && y[0] < x[1];
}

export interface CardioPlan {
  /** Rows to add, oldest first. */
  add: CardioRow[];
  /** Entries whose id is already stored (imported before; a deleted one stays deleted). */
  alreadyStored: number;
  /** Entries that overlap a logged session, or an earlier entry of this import. */
  overlapping: number;
}

/**
 * The cardio rows to add given what is logged. `existing` holds every run and activity
 * stored, soft-deleted ones included: a session the user deleted is not brought back,
 * and its time still counts as taken. Entries are taken oldest first and each one
 * added also blocks later overlapping entries, so the same walk exported by two apps
 * is added once.
 */
export function planCardio(candidates: readonly CardioRow[], existing: readonly TimedRow[]): CardioPlan {
  const storedIds = new Set(existing.map((row) => row.id));
  const taken: Array<[number, number]> = [];
  for (const row of existing) {
    const interval = intervalOf(row);
    if (interval) taken.push(interval);
  }
  const sorted = [...candidates].sort(
    (a, b) => new Date(a.row.date).getTime() - new Date(b.row.date).getTime() || (a.row.id < b.row.id ? -1 : 1)
  );
  const plan: CardioPlan = { add: [], alreadyStored: 0, overlapping: 0 };
  const seen = new Set<string>();
  for (const candidate of sorted) {
    if (storedIds.has(candidate.row.id) || seen.has(candidate.row.id)) {
      plan.alreadyStored += 1;
      continue;
    }
    const interval = intervalOf(candidate.row);
    if (!interval) continue;
    if (taken.some(([start, end]) => interval[0] < end && start < interval[1])) {
      plan.overlapping += 1;
      continue;
    }
    seen.add(candidate.row.id);
    taken.push(interval);
    plan.add.push(candidate);
  }
  return plan;
}
