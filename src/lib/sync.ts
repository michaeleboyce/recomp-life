// The sync client. Tables come only from SYNC_REGISTRY. Push sends dirty rows; pull
// reads each table in pages and merges by clientId with last write wins on
// `updatedAt`. Lift states and e1RMs do not travel: a merged page that changed the log
// leaves a persisted "rebuild needed" marker (src/lib/sync/rebuildMarker.ts), and this
// device rebuilds them at the end of the pull, or at the next sync or app start if
// that pull never finished or its rebuild failed.
import type Dexie from "dexie";
import type { Table } from "dexie";
import { db } from "@/db/local";
import { sanitizeSettings } from "@/lib/data/settingsShape";
import { nextStamp } from "@/lib/data/stamp";
import { mergeSettings } from "@/lib/sync/settingsMerge";
import { mergeWorkoutPull, sameContent } from "@/lib/sync/workoutMerge";
import { SYNC_META_TABLE, markRebuildNeeded, rebuildIfNeeded } from "@/lib/sync/rebuildMarker";
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
import { plural } from "@/lib/text";


export const SYNC_UNAUTHORIZED = "Sync passphrase missing or rejected";

/** Tables whose change alters what the rebuild derives (the log and lift adjustments). */
export const REBUILD_TABLES: ReadonlySet<string> = new Set(["workouts", "liftAdjustments"]);

/** Tables a pull can leave unsynced (the merged settings), pushed again after it. */
const SETTINGS_TABLES: readonly string[] = SYNC_REGISTRY.filter((def) => def.singleRow).map((def) => def.name);

/** Tables a pull may leave a merged, unsynced row in: pushed again right after the pull. */
const MERGED_TABLES: readonly string[] = [...SETTINGS_TABLES, "workouts"];

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
  /**
   * True when `applyRebuild()` ran because a rebuild was owed: workouts or adjustments
   * merged by this pull, or by an earlier one whose rebuild never ran or failed.
   */
  rebuilt: boolean;
  /** Set when the rebuild after the pull failed. The pulled rows are stored anyway and the rebuild stays owed. */
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

const isWireRow = (value: unknown): value is WireRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
 * next sync, and the other tables still run. With `only`, just those tables.
 */
export async function pushUnsynced(database: Dexie = db, only?: readonly string[]): Promise<PushResult> {
  const result: PushResult = { pushed: 0, applied: 0, skipped: 0, marked: 0, errors: {}, refused: {} };

  for (const def of SYNC_REGISTRY) {
    if (only && !only.includes(def.name)) continue;
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
    result.errors[def.name] = `${plural(count, "row")} could not be saved by the server`;
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

/**
 * Merges one pulled page into the local table, inside one transaction. A page of a
 * table that feeds the rebuild that inserted or overwrote a row also writes the
 * "rebuild needed" marker in that transaction: the rows and the marker are saved
 * together or not at all.
 */
async function mergeTable(database: Dexie, def: SyncTableDef, rows: WireRow[]): Promise<MergeCounts> {
  const counts: MergeCounts = { inserted: 0, overwritten: 0, kept: 0 };
  const table = database.table<Row>(def.name);
  const feedsRebuild = REBUILD_TABLES.has(def.name);
  const scope = feedsRebuild ? [table, database.table(SYNC_META_TABLE)] : [table];

  await database.transaction("rw", scope, async () => {
    await mergeRows(table, def, rows, counts);
    if (feedsRebuild && counts.inserted + counts.overwritten > 0) await markRebuildNeeded(database);
  });

  return counts;
}

/** The merge itself, inside `mergeTable`'s transaction. Adds to `counts`. */
async function mergeRows(table: Table<Row>, def: SyncTableDef, rows: WireRow[], counts: MergeCounts): Promise<void> {
  if (def.singleRow) {
    // Exactly one profile, id and clientId PROFILE_ID. The server keeps one row; if it
    // ever sends more, the newest wins.
    //
    // The conflict rule for the profile: its own fields (name, height, ...) are last
    // write wins for the row, but its settings are merged field by field
    // (`mergeSettings`): every settings write stamps the paths it changed, and each path
    // takes the copy with the newer stamp. A set plan saved on one device and the theme
    // changed on the other both survive. When the merge holds anything the server
    // lacks, the row stays (or becomes) unsynced with a new stamp, so the push that
    // follows the pull carries it back.
    const server = rows.reduce<WireRow | undefined>(
      (best, row) => (!best || stampOf(row) > stampOf(best) ? row : best),
      undefined
    );
    if (!server) return;
    const local = await table.toCollection().first();
    const decision = decidePull(local, server);
    const incoming = toLocalRow(server);
    // Another app version may have written a shape this one would crash on.
    const serverSettings = sanitizeSettings(incoming.settings);
    if (!local) {
      await table.put({ ...incoming, clientId: PROFILE_ID, id: PROFILE_ID, settings: serverSettings });
      counts.inserted += 1;
      return;
    }
    const merge = mergeSettings(sanitizeSettings(local.settings), serverSettings);
    const newerStamp = nextStamp(Math.max(stampOf(local), stampOf(server)));

    if (decision === "keep") {
      if (!merge.localBehind) {
        counts.kept += 1;
        return;
      }
      // The local row is newer, but the server holds newer settings for some paths.
      await table.put({ ...local, settings: merge.settings, updatedAt: newerStamp, synced: false });
      counts.overwritten += 1;
      return;
    }

    const row: Row = { ...incoming, clientId: PROFILE_ID, id: local.id, settings: merge.settings };
    if (merge.serverBehind) {
      row.updatedAt = newerStamp;
      row.synced = false;
    }
    await table.put(row);
    counts.overwritten += 1;
    return;
  }

  for (const server of rows) {
    const clientId = server.clientId;
    if (typeof clientId !== "string" || !clientId) continue;
    const local = await table.where("clientId").equals(clientId).first();
    const incoming = toLocalRow(server);
    if (!local) {
      await table.put(incoming);
      counts.inserted += 1;
      continue;
    }
    let decision = decidePull(local, server);
    if (def.name === "workouts") {
      // A workout's log and its watch data are merged apart (`mergeWorkoutPull`), so a
      // correction on one device and watch data attached on another both survive.
      const merged = mergeWorkoutPull(local, incoming, nextStamp(Math.max(stampOf(local), stampOf(server))));
      if (merged.decision === "merge") {
        await table.put(merged.row);
        counts.overwritten += 1;
        continue;
      }
      decision = merged.decision;
    }
    // Two devices stamped different edits with the same `updatedAt`: the server took the
    // one pushed last. A copy already pushed takes the server's, so every device ends up
    // with the same row; a copy not pushed yet goes out first.
    if (
      decision === "keep" &&
      local.synced === true &&
      stampOf(server) === stampOf(local) &&
      !sameContent(local, incoming)
    ) {
      decision = "overwrite";
    }
    if (decision === "keep") {
      counts.kept += 1;
      continue;
    }
    await table.put({ ...incoming, id: local.id });
    counts.overwritten += 1;
  }
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

    const data = ((await response.json()) ?? {}) as Partial<PullPageResponse>;
    result.pages += 1;
    if (typeof data.serverTime === "number") {
      result.serverTime = data.serverTime;
      startedAt ??= data.serverTime;
    }
    // An entry that is not a row would abort the page's merge every time it is read.
    const rows = Array.isArray(data.rows) ? data.rows.filter(isWireRow) : [];
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
 * Afterwards, even when the pull stopped early, rebuilds the derived tables if a
 * rebuild is owed (this pull or an earlier one merged workouts or adjustments).
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
    }
  } finally {
    result.pulled = result.inserted + result.overwritten;
    // Rows already merged stay merged, and each merged page of the log left the marker:
    // rebuild from them even when the pull stopped.
    const owed = await rebuildIfNeeded(database);
    result.rebuilt = owed.rebuilt;
    if (owed.error) result.rebuildError = owed.error;
  }

  return result;
}

/**
 * A rebuild an earlier sync left owing (its pull cut short, or its rebuild failed),
 * then push, then pull. Every failure is reported in `errors`; nothing throws.
 */
export async function fullSync(database: Dexie = db): Promise<SyncResult> {
  const errors: string[] = [];
  let pushed = 0;
  let pulled = 0;
  let pullSucceeded = false;
  const reportRebuild = (error?: string) => {
    // A rebuild that fails before the pull and again after it is one problem.
    if (error && !errors.includes(`Rebuild: ${error}`)) errors.push(`Rebuild: ${error}`);
  };

  // First, so the screens are right again before the network is touched.
  reportRebuild((await rebuildIfNeeded(database)).error);

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
    reportRebuild(pull.rebuildError);
  } catch (err) {
    errors.push(`Pull: ${message(err)}`);
  }

  // A settings merge that held what the server lacked left the profile unsynced: send
  // it now rather than at the next sync.
  if (pullSucceeded) {
    try {
      const again = await pushUnsynced(database, MERGED_TABLES);
      pushed += again.pushed;
      for (const [table, reason] of Object.entries(again.errors)) errors.push(`Push ${table}: ${reason}`);
    } catch (err) {
      errors.push(`Push: ${message(err)}`);
    }
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
