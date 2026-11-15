// Matching an imported session to one the user already logged by hand. Pure.

/** Start times this close together are treated as the same session. */
export const HEALTH_MATCH_WINDOW_MINUTES = 30;

interface Matchable {
  date: Date | string;
  externalId?: string;
}

/**
 * The hand-logged row an imported session duplicates, or null. A row matches
 * when it has no external id yet and started within HEALTH_MATCH_WINDOW_MINUTES
 * of the import; the closest one wins. The caller passes rows of the same kind
 * only (runs for a run, cycling for a ride), and includes soft-deleted rows so
 * a session the user deleted is not brought back.
 */
export function findManualMatch<T extends Matchable>(start: Date, rows: readonly T[]): T | null {
  const windowMs = HEALTH_MATCH_WINDOW_MINUTES * 60 * 1000;
  let best: T | null = null;
  let bestGap = Infinity;
  for (const row of rows) {
    if (row.externalId) continue;
    const gap = Math.abs(new Date(row.date).getTime() - start.getTime());
    if (gap <= windowMs && gap < bestGap) {
      best = row;
      bestGap = gap;
    }
  }
  return best;
}
