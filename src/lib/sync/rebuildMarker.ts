// The "rebuild needed" marker. Lift states, e1RMs and home exercises' states are
// rebuilt on each device from the log, so a pull that merged log rows owes a rebuild.
// The marker is written in the same IndexedDB transaction as each merged page of a
// table that feeds the rebuild (sync.ts, REBUILD_TABLES), and removed only after a
// rebuild that succeeded. A pull cut short (closed app, lost signal) or a rebuild
// that threw therefore leaves it in place, and the next sync or the next app start
// rebuilds, even when nothing new arrives.
//
// Each write gives the marker a new token, and a rebuild removes it only when the token
// is still the one it read first: a page merged while the rebuild ran keeps the marker,
// so the rows that rebuild may have missed are rebuilt next time.
import type Dexie from "dexie";
import { v4 as uuidv4 } from "uuid";
import { applyRebuild } from "@/lib/data/derived";
import type { SyncMetaRow } from "@/types";

/** The local-only table that holds the marker. Never synced, never backed up. */
export const SYNC_META_TABLE = "syncMeta";

const REBUILD_KEY = "rebuildNeeded";

const meta = (database: Dexie) => database.table<SyncMetaRow, string>(SYNC_META_TABLE);

const message = (err: unknown) => (err instanceof Error ? err.message : "Unknown error");

/**
 * Records that the derived tables owe a rebuild. Call it inside the transaction that
 * merged the rows, whose scope must include SYNC_META_TABLE, so both are saved or neither.
 */
export async function markRebuildNeeded(database: Dexie, now: number = Date.now()): Promise<void> {
  await meta(database).put({ key: REBUILD_KEY, token: uuidv4(), at: now });
}

/** The marker's token when a rebuild is owed; null when none is. */
export async function owedRebuild(database: Dexie): Promise<string | null> {
  return (await meta(database).get(REBUILD_KEY))?.token ?? null;
}

/** Removes the marker, unless it was written again (a new token) since `token` was read. */
async function clearRebuildMarker(database: Dexie, token: string): Promise<void> {
  await database.transaction("rw", meta(database), async () => {
    if ((await meta(database).get(REBUILD_KEY))?.token === token) {
      await meta(database).delete(REBUILD_KEY);
    }
  });
}

export interface OwedRebuildResult {
  /** True when `applyRebuild()` ran (or was tried) because a rebuild was owed. */
  rebuilt: boolean;
  /** Set when that rebuild failed; the marker stays for the next try. */
  error?: string;
}

/**
 * Runs the rebuild a pull left owing, if there is one, and then clears the marker.
 * Never throws: a failure is returned and the marker stays, so the next sync or app
 * start tries again. `database` is the device database that holds the marker; in the
 * app it is the one `applyRebuild` rebuilds.
 */
export async function rebuildIfNeeded(database: Dexie): Promise<OwedRebuildResult> {
  let token: string | null;
  try {
    token = await owedRebuild(database);
  } catch (err) {
    return { rebuilt: false, error: message(err) };
  }
  if (!token) return { rebuilt: false };

  try {
    await applyRebuild();
    await clearRebuildMarker(database, token);
    return { rebuilt: true };
  } catch (err) {
    return { rebuilt: true, error: message(err) };
  }
}
