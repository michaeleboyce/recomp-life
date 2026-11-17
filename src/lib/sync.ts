// The sync client. Tables come only from SYNC_REGISTRY. Push sends dirty rows; pull
// reads each table in pages and merges by clientId with last write wins on
// `updatedAt`. Lift states and e1RMs do not travel: after a pull that changed the
// log, this device rebuilds them.
import type Dexie from "dexie";
import { db } from "@/db/local";
import { applyRebuild } from "@/lib/data/derived";
import { sanitizeSettings } from "@/lib/data/settingsShape";
import { PROFILE_ID, SYNC_REGISTRY, type SyncTableDef } from "@/lib/sync/registry";
import {
  MAX_PUSH_BYTES,
  MAX_PUSH_ROWS,
  PULL_SINCE_OVERLAP_MS,
  type PullPageResponse,
  type PushRequest,
  type PushResponse,
  type WireRow,
} from "@/lib/sync/wire";
import { loadPullState, saveTablePullState, type TablePullState } from "@/lib/sync/pullState";
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
  /** Per table, rows the server could not store; they stay dirty. */
  refused: Record<string, number>;
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
  /** Pages received, every table together. */
  pages: number;
  serverTime?: number;
}

/**
 * The most pages one table may take in one pull: a guard against a server that never
 * says it is done (500 rows a page, so far beyond any real table).
 */
export const MAX_PULL_PAGES = 10_000;

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
 * `rows` in push batches: at most MAX_PUSH_ROWS rows and about MAX_PUSH_BYTES of JSON
 * each, in order; a row larger than MAX_PUSH_BYTES is a batch of its own.
 */
export function pushBatches<T>(rows: readonly T[]): T[][] {
  const encoder = new TextEncoder();
  const batches: T[][] = [];
  let batch: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    // The comma between rows is one byte; the request's own wrapper is a few dozen.
    const size = encoder.encode(JSON.stringify(row)).length + 1;
    if (batch.length > 0 && (batch.length >= MAX_PUSH_ROWS || bytes + size > MAX_PUSH_BYTES - 1_000)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * Sends every dirty row of every registry table, in batches of at most MAX_PUSH_ROWS
 * rows and about MAX_PUSH_BYTES (`pushBatches`; larger requests are refused), so a
 * first sync or a large backup import still uploads everything. A row is marked synced only if its
 * `updatedAt` is still the value that was sent. A 401 stops everything (throws
 * SYNC_UNAUTHORIZED); another failure is recorded for its table and ends that
 * table's push: batches already accepted stay synced, the rest stays dirty for the
 * next sync, and the other tables still run.
 */
export async function pushUnsynced(database: Dexie = db): Promise<PushResult> {
  const result: PushResult = { pushed: 0, applied: 0, skipped: 0, marked: 0, errors: {}, refused: {} };

  for (const def of SYNC_REGISTRY) {
    for (const batch of pushBatches(await dirtyRows(database, def))) {
      const accepted = await pushBatch(database, def, batch, result);
      if (!accepted) break;
    }
  }

  return result;
}

/** Sends one batch of a table's dirty rows. False when it failed (recorded in `result.errors`). */
async function pushBatch(database: Dexie, def: SyncTableDef, rows: Row[], result: PushResult): Promise<boolean> {
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
    return false;
  }

  if (response.status === 401) throw new Error(SYNC_UNAUTHORIZED);
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    result.errors[def.name] = `${response.status}${detail?.error ? ` ${detail.error}` : ""}`;
    return false;
  }

  const reply = (await response.json().catch(() => null)) as Partial<PushResponse> | null;
  result.pushed += rows.length;
  result.applied += Number(reply?.applied ?? 0);
  result.skipped += Number(reply?.skipped ?? 0);

  // Rows the server could not store stay dirty, for the next sync to try again.
  const failed = Array.isArray(reply?.failed)
    ? reply.failed.filter((index): index is number => Number.isInteger(index) && index >= 0 && index < rows.length)
    : [];
  for (const index of failed) sentStamps.delete(rows[index].id);
  if (failed.length > 0) {
    const count = (result.refused[def.name] ?? 0) + failed.length;
    result.refused[def.name] = count;
    result.errors[def.name] = `${count} row${count === 1 ? "" : "s"} could not be saved by the server`;
  }

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
  return true;
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
      // Another app version may have written a shape this one would crash on.
      row.settings = sanitizeSettings(row.settings);
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

/** The pull lost its connection: nothing more can be read now. */
class PullConnectionError extends Error {}

/** What pulling one table changed. */
interface TablePull {
  counts: MergeCounts;
  /** False when the table's pull stopped early (recorded in `errors`). */
  complete: boolean;
}

/**
 * Pulls one table page by page, merging each page as it arrives and recording after
 * each one where the pull got to, so a pull cut short (closed app, lost signal)
 * continues from there next time instead of starting over. A table with no local rows
 * is read in full whatever was recorded: its rows were erased here, not on the server.
 * A 401 throws SYNC_UNAUTHORIZED and a network failure throws; any other failure is
 * recorded for the table and ends its pull, keeping the pages already merged.
 */
async function pullTable(database: Dexie, def: SyncTableDef, result: PullResult): Promise<TablePull> {
  const counts: MergeCounts = { inserted: 0, overwritten: 0, kept: 0 };
  const recorded: TablePullState =
    (await database.table(def.name).count()) > 0 ? (loadPullState(database.name)[def.name] ?? {}) : {};
  // A pull under way resumes from its cursor; a new one starts from `since`.
  let cursor = recorded.cursor;
  let startedAt = recorded.cursor ? recorded.startedAt : undefined;
  const since = recorded.cursor ? undefined : recorded.since;

  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const params = new URLSearchParams({ table: def.name });
    if (cursor) params.set("cursor", cursor);
    else if (since !== undefined) params.set("since", String(since));

    let response: Response;
    try {
      response = await syncRequest(`/api/sync/pull?${params}`);
    } catch (err) {
      throw new PullConnectionError(message(err));
    }
    if (response.status === 401) throw new Error(SYNC_UNAUTHORIZED);
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      result.errors[def.name] = `${response.status}${detail?.error ? ` ${detail.error}` : ""}`;
      // A request the server refuses (for example a cursor it no longer reads) is not
      // retried from the same place: the next pull reads the table again in full.
      if (response.status === 400) saveTablePullState(database.name, def.name, {});
      return { counts, complete: false };
    }

    const data = (await response.json()) as Partial<PullPageResponse>;
    result.pages += 1;
    if (typeof data.serverTime === "number") {
      result.serverTime = data.serverTime;
      startedAt ??= data.serverTime;
    }
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length > 0) {
      const merged = await mergeTable(database, def, rows);
      counts.inserted += merged.inserted;
      counts.overwritten += merged.overwritten;
      counts.kept += merged.kept;
    }

    const next = typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null;
    if (!next) {
      // Done: the next pull reads what the server wrote from shortly before this one began.
      const nextSince = startedAt !== undefined ? Math.max(0, startedAt - PULL_SINCE_OVERLAP_MS) : since;
      saveTablePullState(database.name, def.name, nextSince !== undefined ? { since: nextSince } : {});
      return { counts, complete: true };
    }
    if (next === cursor) {
      result.errors[def.name] = "The server sent the same page twice; the pull of this table stopped.";
      return { counts, complete: false };
    }
    cursor = next;
    saveTablePullState(database.name, def.name, {
      cursor,
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...(recorded.since !== undefined ? { since: recorded.since } : {}),
    });
  }

  result.errors[def.name] = `More than ${MAX_PULL_PAGES} pages; the pull of this table stopped.`;
  return { counts, complete: false };
}

/**
 * Pulls every registry table, one page at a time, and merges it by clientId: a row
 * this device lacks is inserted (soft-deleted rows too); an existing row is replaced
 * only when the server's `updatedAt` is greater than the local one (missing counts as
 * 0), keeping the local primary key. After the first complete pull, a table's next
 * pull asks only for rows the server wrote since shortly before the last one began.
 * Afterwards, if workouts or adjustments changed, rebuilds derived tables.
 */
export async function pullFromServer(database: Dexie = db): Promise<PullResult> {
  const result: PullResult = {
    pulled: 0,
    inserted: 0,
    overwritten: 0,
    kept: 0,
    errors: {},
    rebuilt: false,
    pages: 0,
  };
  let logChanged = false;

  try {
    for (const def of SYNC_REGISTRY) {
      let pulled: TablePull;
      try {
        pulled = await pullTable(database, def, result);
      } catch (err) {
        // A rejected passphrase or a lost connection ends the whole pull.
        if (err instanceof Error && err.message === SYNC_UNAUTHORIZED) throw err;
        if (err instanceof PullConnectionError) throw err;
        result.errors[def.name] = message(err);
        continue;
      }
      result.inserted += pulled.counts.inserted;
      result.overwritten += pulled.counts.overwritten;
      result.kept += pulled.counts.kept;
      if (REBUILD_TABLES.has(def.name) && pulled.counts.inserted + pulled.counts.overwritten > 0) {
        logChanged = true;
      }
    }
  } finally {
    result.pulled = result.inserted + result.overwritten;
    // Rows already merged stay merged; rebuild from them even when the pull stopped.
    if (logChanged) {
      result.rebuilt = true;
      try {
        await applyRebuild();
      } catch (err) {
        result.rebuildError = message(err);
      }
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
