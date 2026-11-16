// Data layer: sessions imported from other apps' exports. ADD-ONLY: a row is added and
// never edited; the only later changes are the soft delete that undoes a whole import,
// restoring it, and a later import of the same row replacing a soft-deleted copy.
// Ids come from the parser and are deterministic, so importing a file twice adds nothing.
// The cardio of an import becomes ordinary runs and activities, added under the same
// rules (new ids only, nothing that overlaps a logged session), marked with the import's
// batch id and undone with it, on any device.
import type { Table } from "dexie";
import { db } from "@/db/local";
import { planCardio } from "@/lib/import/cardio";
import type { CardioRow } from "@/lib/import/records";
import type { ActivityLog, ImportedSessionRecord, RunLog } from "@/types";
import { editStamps, newRowStamps } from "./stamp";

/**
 * Adds sessions whose id is not stored yet, and replaces sessions whose stored copy is
 * soft-deleted (a corrected import after an undo), and returns how many it wrote. A
 * live stored row is left exactly as it was; so is a repeat of an id within `rows`.
 */
export async function writeImportedSessions(
  rows: readonly ImportedSessionRecord[],
  now: number = Date.now()
): Promise<number> {
  if (rows.length === 0) return 0;
  return db.transaction("rw", db.importedSessions, async () => {
    const stored = new Map(
      (await db.importedSessions.bulkGet(rows.map((row) => row.id)))
        .filter((row): row is ImportedSessionRecord => row !== undefined)
        .map((row) => [row.id, row])
    );
    const seen = new Set<string>();
    const written: ImportedSessionRecord[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const old = stored.get(row.id);
      if (old && old.deletedAt == null) continue;
      // A replaced row's stamp follows the deleted one's, so it wins on every device.
      written.push(old ? { ...row, ...editStamps(old, now), deletedAt: null } : { ...row, ...newRowStamps(now) });
    }
    if (written.length > 0) await db.importedSessions.bulkPut(written);
    return written.length;
  });
}

/** Soft-deletes every live session of one import (undo) and returns how many. */
export async function deleteImportBatch(
  batchId: string,
  now: number = Date.now()
): Promise<number> {
  return db.transaction("rw", db.importedSessions, async () => {
    const rows = (await db.importedSessions.where("importBatchId").equals(batchId).toArray()).filter(
      (row) => row.deletedAt == null
    );
    for (const row of rows) {
      const stamps = editStamps(row, now);
      await db.importedSessions.update(row.id, { ...stamps, deletedAt: stamps.updatedAt });
    }
    return rows.length;
  });
}

/** Every imported session that is not soft-deleted, oldest first. */
export async function listImportedSessions(): Promise<ImportedSessionRecord[]> {
  const rows = await db.importedSessions.orderBy("startedAt").toArray();
  return rows.filter((row) => row.deletedAt == null);
}

/**
 * How many of these session ids are stored already and live: a re-import adds none of
 * them. A soft-deleted copy does not count: importing again replaces it.
 */
export async function countStoredImportedSessions(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db.importedSessions.bulkGet([...ids]);
  return rows.filter((row) => row !== undefined && row.deletedAt == null).length;
}

/** The live sessions one import added, and their sets. */
export async function importBatchTotals(batchId: string): Promise<{ sessions: number; sets: number }> {
  const rows = (await db.importedSessions.where("importBatchId").equals(batchId).toArray()).filter(
    (row) => row.deletedAt == null
  );
  return { sessions: rows.length, sets: rows.reduce((n, row) => n + row.sets.length, 0) };
}

/** Sessions per write: small enough that each transaction is short, large enough to be quick. */
export const IMPORT_CHUNK_SIZE = 100;

export interface ChunkedImportOptions {
  chunkSize?: number;
  /** Called after each chunk with the sessions handled so far and the total. */
  onProgress?: (done: number, total: number) => void;
  /** Awaited between chunks so the screen can draw; defaults to a macrotask. */
  pause?: () => Promise<void>;
  now?: number;
}

/** Lets the browser run other work (draw a frame, handle a tap) before the next chunk. */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Adds the sessions in chunks of `chunkSize`, each in its own short transaction, with a
 * pause between chunks so the screen stays responsive. Returns how many were added; ids
 * already stored are left as they are (`writeImportedSessions`), so a re-import adds
 * nothing.
 */
export async function importSessionsInChunks(
  rows: readonly ImportedSessionRecord[],
  options: ChunkedImportOptions = {}
): Promise<number> {
  const size = Math.max(1, options.chunkSize ?? IMPORT_CHUNK_SIZE);
  const pause = options.pause ?? nextTask;
  let added = 0;
  options.onProgress?.(0, rows.length);
  for (let i = 0; i < rows.length; i += size) {
    added += await writeImportedSessions(rows.slice(i, i + size), options.now);
    options.onProgress?.(Math.min(i + size, rows.length), rows.length);
    if (i + size < rows.length) await pause();
  }
  return added;
}

export interface CardioWriteResult {
  runIds: string[];
  activityIds: string[];
  /** Entries stored before (a re-import). */
  alreadyStored: number;
  /** Entries that overlap a run or activity already logged. */
  overlapping: number;
}

/**
 * Adds imported runs and activities that are new and overlap nothing already logged
 * (`planCardio`): the overlap check reads every stored run and activity, soft-deleted
 * ones included, in the same transaction as the writes. A soft-deleted copy of an entry
 * imported again (a corrected import after an undo) is replaced: it blocks neither its
 * id nor its own time.
 */
export async function writeImportedCardio(
  rows: readonly CardioRow[],
  now: number = Date.now()
): Promise<CardioWriteResult> {
  if (rows.length === 0) return { runIds: [], activityIds: [], alreadyStored: 0, overlapping: 0 };
  return db.transaction("rw", db.runs, db.activities, async () => {
    const existing = [...(await db.runs.toArray()), ...(await db.activities.toArray())];
    const incoming = new Set(rows.map((entry) => entry.row.id));
    const replaceable = new Map(
      existing.filter((row) => row.deletedAt != null && incoming.has(row.id)).map((row) => [row.id, row])
    );
    const plan = planCardio(rows, existing.filter((row) => !replaceable.has(row.id)));
    const stampsFor = (id: string) => {
      const old = replaceable.get(id);
      return old ? { ...editStamps(old, now), deletedAt: null } : newRowStamps(now);
    };
    const runs: RunLog[] = [];
    const activities: ActivityLog[] = [];
    for (const entry of plan.add) {
      if (entry.table === "runs") runs.push({ ...entry.row, ...stampsFor(entry.row.id) });
      else activities.push({ ...entry.row, ...stampsFor(entry.row.id) });
    }
    if (runs.length > 0) await db.runs.bulkPut(runs);
    if (activities.length > 0) await db.activities.bulkPut(activities);
    return {
      runIds: runs.map((r) => r.id),
      activityIds: activities.map((a) => a.id),
      alreadyStored: plan.alreadyStored,
      overlapping: plan.overlapping,
    };
  });
}

export interface UndoImportInput {
  batchId: string;
  runIds: readonly string[];
  activityIds: readonly string[];
}

type CardioTableRow = { id: string; updatedAt?: number; deletedAt?: number | null; importBatchId?: string };

/** Soft-deletes (or restores) the given rows of a table that are not so already; returns how many changed. */
async function setRowsDeleted<T extends CardioTableRow>(
  table: Table<T, string>,
  rows: readonly (T | undefined)[],
  deleted: boolean,
  now: number
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    if (!row || (row.deletedAt != null) === deleted) continue;
    const stamps = editStamps(row, now);
    await table.update(row.id, { ...stamps, deletedAt: deleted ? stamps.updatedAt : null } as never);
    count += 1;
  }
  return count;
}

/** The rows of a run or activity table that one import added. */
async function cardioOfBatch<T extends CardioTableRow>(table: Table<T, string>, batchId: string): Promise<T[]> {
  return table.filter((row) => row.importBatchId === batchId).toArray();
}

export interface ImportBatchCounts {
  sessions: number;
  runs: number;
  activities: number;
}

/**
 * Undoes one import as a whole: soft-deletes its sessions (`deleteImportBatch`) and the
 * runs and activities it added that are still live, found by their batch id (so it
 * works on any device) and by `input`'s ids (rows added before cardio carried the
 * batch). Returns how many of each.
 */
export async function undoImport(input: UndoImportInput, now: number = Date.now()): Promise<ImportBatchCounts> {
  const sessions = await deleteImportBatch(input.batchId, now);
  const [runs, activities] = await db.transaction("rw", db.runs, db.activities, async () => {
    const runRows = [...(await cardioOfBatch(db.runs, input.batchId)), ...(await db.runs.bulkGet([...input.runIds]))];
    const activityRows = [
      ...(await cardioOfBatch(db.activities, input.batchId)),
      ...(await db.activities.bulkGet([...input.activityIds])),
    ];
    const unique = <T extends { id: string }>(rows: (T | undefined)[]) => [
      ...new Map(rows.filter((row): row is T => row !== undefined).map((row) => [row.id, row])).values(),
    ];
    return [
      await setRowsDeleted(db.runs, unique(runRows), true, now),
      await setRowsDeleted(db.activities, unique(activityRows), true, now),
    ];
  });
  return { sessions, runs, activities };
}

/** Undoes one import as a whole, from its batch id alone (Recently deleted, on any device). */
export async function undoImportBatch(batchId: string, now: number = Date.now()): Promise<ImportBatchCounts> {
  return undoImport({ batchId, runIds: [], activityIds: [] }, now);
}

/** Puts an undone import back: its sessions, runs and activities that are soft-deleted. */
export async function restoreImportBatch(batchId: string, now: number = Date.now()): Promise<ImportBatchCounts> {
  return db.transaction("rw", db.importedSessions, db.runs, db.activities, async () => {
    const sessionRows = await db.importedSessions.where("importBatchId").equals(batchId).toArray();
    return {
      sessions: await setRowsDeleted(db.importedSessions, sessionRows, false, now),
      runs: await setRowsDeleted(db.runs, await cardioOfBatch(db.runs, batchId), false, now),
      activities: await setRowsDeleted(db.activities, await cardioOfBatch(db.activities, batchId), false, now),
    };
  });
}

/** One import as Recently deleted lists it. */
export interface ImportBatchSummary {
  batchId: string;
  /** The app the file came from (the first session's). */
  sourceApp: ImportedSessionRecord["sourceApp"] | null;
  /** The day the import ran ("2026-11-16"), when its batch id carries it (every import since 16 Nov 2026 and the preload). */
  importedOn: string | null;
  /** The first and last session's start. */
  from: Date | null;
  to: Date | null;
  /** What is live of it, and what is undone (soft-deleted). */
  live: ImportBatchCounts & { sets: number };
  undone: ImportBatchCounts;
}

/** The day in a batch id such as "preload-2026-11-16" or "import-2026-11-16-…", or null. */
export function importBatchDay(batchId: string): string | null {
  return /\b(\d{4}-\d{2}-\d{2})\b/.exec(batchId)?.[1] ?? null;
}

/**
 * Every import on this device, live or undone, newest import first: the sessions and
 * cardio each one added. Imports sync like everything else, so every device lists the
 * same ones, the preload's included.
 */
export async function listImportBatches(): Promise<ImportBatchSummary[]> {
  const [sessions, runs, activities] = await Promise.all([
    db.importedSessions.toArray(),
    db.runs.filter((row) => row.importBatchId != null).toArray(),
    db.activities.filter((row) => row.importBatchId != null).toArray(),
  ]);
  const batches = new Map<string, ImportBatchSummary>();
  const batchOf = (batchId: string): ImportBatchSummary => {
    let batch = batches.get(batchId);
    if (!batch) {
      batch = {
        batchId,
        sourceApp: null,
        importedOn: importBatchDay(batchId),
        from: null,
        to: null,
        live: { sessions: 0, sets: 0, runs: 0, activities: 0 },
        undone: { sessions: 0, runs: 0, activities: 0 },
      };
      batches.set(batchId, batch);
    }
    return batch;
  };
  for (const session of sessions) {
    const batch = batchOf(session.importBatchId);
    batch.sourceApp ??= session.sourceApp;
    const start = new Date(session.startedAt);
    if (!batch.from || start < batch.from) batch.from = start;
    if (!batch.to || start > batch.to) batch.to = start;
    if (session.deletedAt == null) {
      batch.live.sessions += 1;
      batch.live.sets += session.sets.length;
    } else {
      batch.undone.sessions += 1;
    }
  }
  for (const [rows, key] of [
    [runs, "runs"],
    [activities, "activities"],
  ] as const) {
    for (const row of rows) {
      const batch = batchOf(row.importBatchId as string);
      if (row.deletedAt == null) batch.live[key] += 1;
      else batch.undone[key] += 1;
    }
  }
  return [...batches.values()].sort(
    (a, b) =>
      (b.importedOn ?? "").localeCompare(a.importedOn ?? "") ||
      (b.to?.getTime() ?? 0) - (a.to?.getTime() ?? 0) ||
      a.batchId.localeCompare(b.batchId)
  );
}
