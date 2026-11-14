// Data layer: the one place sync stamps are produced. Every write to a synced table
// sets `updatedAt` through `nextStamp` and marks the row unsynced.

/**
 * The `updatedAt` for a write: now, or one past the previous stamp when the clock has
 * not moved (or went backwards), so a row's stamps are strictly increasing.
 */
export function nextStamp(previous?: number, now: number = Date.now()): number {
  return Math.max(now, (previous ?? 0) + 1);
}

/** Stamp fields for a row that is being created. */
export function newRowStamps(now: number = Date.now()): {
  updatedAt: number;
  deletedAt: null;
  synced: false;
} {
  return { updatedAt: nextStamp(undefined, now), deletedAt: null, synced: false };
}

/** Stamp fields for a change to an existing row. */
export function editStamps(
  row: { updatedAt?: number } | undefined,
  now: number = Date.now()
): { updatedAt: number; synced: false } {
  return { updatedAt: nextStamp(row?.updatedAt, now), synced: false };
}
