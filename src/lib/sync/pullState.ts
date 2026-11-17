// Where this device's pull got to, per table: the `since` of its next pull, and the
// cursor of a pull that was cut short. Kept in localStorage under the database's name
// (each device database its own), never synced. Losing it costs one full pull, never
// a row: a missing or unreadable state reads as "nothing pulled yet".

/** One table's progress. */
export interface TablePullState {
  /** The next pull reads rows the server wrote at or after this stamp. Absent: everything. */
  since?: number;
  /** A pull under way stopped after the page that ended here; the next one continues from it. */
  cursor?: string;
  /** Server clock when that unfinished pull began: its `since` for the pull after it. */
  startedAt?: number;
}

export type PullState = Record<string, TablePullState>;

const KEY_PREFIX = "recomp-sync-pull:";

function keyFor(databaseName: string): string {
  return `${KEY_PREFIX}${databaseName}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isTableState(value: unknown): value is TablePullState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  const optionalNumber = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);
  return (
    optionalNumber(state.since) &&
    optionalNumber(state.startedAt) &&
    (state.cursor === undefined || typeof state.cursor === "string")
  );
}

/** The stored progress of one device database; empty when none or unreadable. */
export function loadPullState(databaseName: string): PullState {
  try {
    const raw = storage()?.getItem(keyFor(databaseName));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const state: PullState = {};
    for (const [table, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isTableState(value)) state[table] = value;
    }
    return state;
  } catch {
    return {};
  }
}

/** Records one table's progress. Best effort: a failure only means a fuller pull next time. */
export function saveTablePullState(databaseName: string, table: string, value: TablePullState): void {
  try {
    const store = storage();
    if (!store) return;
    const state = loadPullState(databaseName);
    state[table] = value;
    store.setItem(keyFor(databaseName), JSON.stringify(state));
  } catch {
    // Nothing to do: the next pull reads more than it needs to.
  }
}

/**
 * Forgets every table's progress, so the next pull reads everything again. Call it
 * whenever the local tables are emptied or replaced (erase, restore from a backup).
 */
export function resetPullState(databaseName: string): void {
  try {
    storage()?.removeItem(keyFor(databaseName));
  } catch {
    // Nothing to do.
  }
}
