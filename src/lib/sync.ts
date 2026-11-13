// The sync client. Tables come only from SYNC_REGISTRY. Push sends dirty rows; pull
// merges by clientId with last write wins on `updatedAt`. Lift states and e1RMs do not
// travel: after a pull that changed the log, this device rebuilds them.
import type Dexie from "dexie";
import { db } from "@/db/local";
import { applyRebuild } from "@/lib/data/derived";
import { PROFILE_ID, SYNC_REGISTRY, type SyncTableDef } from "@/lib/sync/registry";
import type { PullResponse, PushRequest, PushResponse, WireRow } from "@/lib/sync/wire";
import { decidePull, stampOf, toLocalRow } from "@/lib/sync/revive";
import { syncRequest } from "@/lib/sync/request";

export { reviveDates } from "@/lib/sync/revive";
export { syncRequest } from "@/lib/sync/request";

export const SYNC_UNAUTHORIZED = "Sync passphrase missing or rejected";

/** Tables whose change alters what the rebuild derives (the log and lift adjustments). */
export const REBUILD_TABLES: ReadonlySet<string> = new Set(["workouts", "liftAdjustments"]);

type Row = Record<string, unknown> & { id?: unknown; clientId?: unknown; synced?: unknown; updatedAt?: unknown };

export interface PushResult {
  /** Rows sent in batches the server accepted. */
  pushed: number;
  /** Rows the server wrote. */
  applied: number;
  /** Rows the server ignored because it already holds a newer stamp. */
  skipped: number;
  /** Rows marked synced here (a row edited while its push was in flight stays dirty). */
  marked: number;
  /** Tables whose push failed, with the reason. The other tables still ran. */
  errors: Record<string, string>;
}

export interface PullResult {
  /** Rows inserted or overwritten. */
  pulled: number;
  inserted: number;
  overwritten: number;
  /** Rows kept because the local copy is newer or equally new. */
  kept: number;
  /** Tables the server could not read, or that failed to merge here. */
  errors: Record<string, string>;
  /** True when `applyRebuild()` ran because workouts or adjustments changed. */
  rebuilt: boolean;
  /** Set when the rebuild after the pull failed. The pulled rows are stored anyway. */
  rebuildError?: string;
  serverTime?: number;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
  /** True when the pull response arrived and was merged (tables in `errors` aside). */
  pullSucceeded: boolean;
}

const message = (err: unknown) => (err instanceof Error ? err.message : "Unknown error");

/** Rows of `def`'s local table that have not been synced since their last change. */
async function dirtyRows(database: Dexie, def: SyncTableDef): Promise<Row[]> {
  // Booleans are not valid IndexedDB keys, so there is no usable `synced` index.
  return database.table<Row>(def.name).filter((row) => row.synced !== true).toArray();
}

/**
 * Sends every dirty row of every registry table, one request per table. A row is
 * marked synced only if its `updatedAt` is still the value that was sent. A 401 stops
 * everything (throws SYNC_UNAUTHORIZED); other failures are recorded per table.
 */
export async function pushUnsynced(database: Dexie = db): Promise<PushResult> {
  const result: PushResult = { pushed: 0, applied: 0, skipped: 0, marked: 0, errors: {} };

  for (const def of SYNC_REGISTRY) {
    const rows = await dirtyRows(database, def);
    if (rows.length === 0) continue;

    const body: PushRequest = { table: def.name, rows: rows as WireRow[] };
    const sentStamps = new Map(rows.map((row) => [row.id, row.updatedAt]));

    let response: Response;
    try {
      response = await syncRequest("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      result.errors[def.name] = message(err);
      continue;
    }

    if (response.status === 401) throw new Error(SYNC_UNAUTHORIZED);
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      result.errors[def.name] = `${response.status}${detail?.error ? ` ${detail.error}` : ""}`;
      continue;
    }

    const reply = (await response.json().catch(() => null)) as Partial<PushResponse> | null;
    result.pushed += rows.length;
    result.applied += Number(reply?.applied ?? 0);
    result.skipped += Number(reply?.skipped ?? 0);

    // Only rows unchanged since they were read: a later edit carries a new stamp.
    await database
      .table<Row>(def.name)
      .where("id")
      .anyOf([...sentStamps.keys()] as string[])
      .modify((row) => {
        if (row.synced !== true && row.updatedAt === sentStamps.get(row.id)) {
          row.synced = true;
          result.marked += 1;
        }
      });
  }

  return result;
}

interface MergeCounts {
  inserted: number;
  overwritten: number;
  kept: number;
}

/** Merges one pulled table into the local one, inside one transaction. */
async function mergeTable(database: Dexie, def: SyncTableDef, rows: WireRow[]): Promise<MergeCounts> {
  const counts: MergeCounts = { inserted: 0, overwritten: 0, kept: 0 };
  const table = database.table<Row>(def.name);

  await database.transaction("rw", table, async () => {
    if (def.singleRow) {
      // Exactly one profile, id and clientId PROFILE_ID. The server keeps one row; if it
      // ever sends more, the newest wins.
      const server = rows.reduce<WireRow | undefined>(
        (best, row) => (!best || stampOf(row) > stampOf(best) ? row : best),
        undefined
      );
      if (!server) return;
      const local = await table.toCollection().first();
      const decision = decidePull(local, server);
      if (decision === "keep") {
        counts.kept += 1;
        return;
      }
      const row = toLocalRow(server);
      row.clientId = PROFILE_ID;
      row.id = local ? local.id : PROFILE_ID;
      await table.put(row);
      counts[decision === "insert" ? "inserted" : "overwritten"] += 1;
      return;
    }

    for (const server of rows) {
      const clientId = server.clientId;
      if (typeof clientId !== "string" || !clientId) continue;
      const local = await table.where("clientId").equals(clientId).first();
      const decision = decidePull(local, server);
      if (decision === "keep") {
        counts.kept += 1;
        continue;
      }
      const row = toLocalRow(server);
      if (local) row.id = local.id;
      await table.put(row);
      counts[decision === "insert" ? "inserted" : "overwritten"] += 1;
    }
  });

  return counts;
}

/**
 * Pulls every registry table and merges it by clientId: a row this device lacks is
 * inserted (soft-deleted rows too); an existing row is replaced only when the server's
 * `updatedAt` is greater than the local one (missing counts as 0), keeping the local
 * primary key. Afterwards, if workouts or adjustments changed, rebuilds derived tables.
 */
export async function pullFromServer(database: Dexie = db): Promise<PullResult> {
  const response = await syncRequest("/api/sync/pull");
  if (response.status === 401) throw new Error(SYNC_UNAUTHORIZED);
  if (!response.ok) throw new Error(`Pull failed: ${response.status}`);

  const data = (await response.json()) as Partial<PullResponse>;
  const result: PullResult = {
    pulled: 0,
    inserted: 0,
    overwritten: 0,
    kept: 0,
    errors: { ...(data.errors ?? {}) },
    rebuilt: false,
    serverTime: data.serverTime,
  };
  let logChanged = false;

  for (const def of SYNC_REGISTRY) {
    const rows = data.rows?.[def.name];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    try {
      const counts = await mergeTable(database, def, rows);
      result.inserted += counts.inserted;
      result.overwritten += counts.overwritten;
      result.kept += counts.kept;
      if (REBUILD_TABLES.has(def.name) && counts.inserted + counts.overwritten > 0) {
        logChanged = true;
      }
    } catch (err) {
      result.errors[def.name] = message(err);
    }
  }
  result.pulled = result.inserted + result.overwritten;

  if (logChanged) {
    result.rebuilt = true;
    try {
      await applyRebuild();
    } catch (err) {
      result.rebuildError = message(err);
    }
  }

  return result;
}

/** Push, then pull. Every failure is reported in `errors`; nothing throws. */
export async function fullSync(database: Dexie = db): Promise<SyncResult> {
  const errors: string[] = [];
  let pushed = 0;
  let pulled = 0;
  let pullSucceeded = false;

  try {
    const push = await pushUnsynced(database);
    pushed = push.pushed;
    for (const [table, reason] of Object.entries(push.errors)) {
      errors.push(`Push ${table}: ${reason}`);
    }
  } catch (err) {
    errors.push(`Push: ${message(err)}`);
  }

  try {
    const pull = await pullFromServer(database);
    pulled = pull.pulled;
    pullSucceeded = true;
    for (const [table, reason] of Object.entries(pull.errors)) {
      errors.push(`Pull ${table}: ${reason}`);
    }
    if (pull.rebuildError) errors.push(`Rebuild: ${pull.rebuildError}`);
  } catch (err) {
    errors.push(`Pull: ${message(err)}`);
  }

  return { pushed, pulled, errors, pullSucceeded };
}

export async function checkConnectivity(): Promise<boolean> {
  try {
    const response = await syncRequest("/api/sync/status", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.ok === true;
  } catch {
    return false;
  }
}
