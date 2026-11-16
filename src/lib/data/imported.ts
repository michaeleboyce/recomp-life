// Data layer: sessions imported from other apps' exports. ADD-ONLY: a row is added and
// never updated; the only later change is the soft delete that undoes a whole import.
// Ids come from the parser and are deterministic, so importing a file twice adds nothing.
// The cardio of an import becomes ordinary runs and activities, added under the same
// rules (new ids only, nothing that overlaps a logged session) and undone with it.
import type { Table } from "dexie";
import { db } from "@/db/local";
import { planCardio } from "@/lib/import/cardio";
import type { CardioRow } from "@/lib/import/records";
import type { ActivityLog, ImportedSessionRecord, RunLog } from "@/types";
import { editStamps, newRowStamps } from "./stamp";

/**
 * Adds sessions whose id is not stored yet and returns how many were added. A stored row
 * (live or soft-deleted) is left exactly as it was; so is a repeat of an id within `rows`.
 */
export async function writeImportedSessions(
  rows: readonly ImportedSessionRecord[],
  now: number = Date.now()
): Promise<number> {
  if (rows.length === 0) return 0;
  return db.transaction("rw", db.importedSessions, async () => {
    const seen = new Set(
      (await db.importedSessions.bulkGet(rows.map((row) => row.id)))
        .filter((row): row is ImportedSessionRecord => row !== undefined)
        .map((row) => row.id)
    );
    const fresh: ImportedSessionRecord[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      fresh.push({ ...row, ...newRowStamps(now) });
    }
    if (fresh.length > 0) await db.importedSessions.bulkAdd(fresh);
    return fresh.length;
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

/** How many of these session ids are stored already (live or soft-deleted): a re-import adds none of them. */
export async function countStoredImportedSessions(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db.importedSessions.bulkGet([...ids]);
  return rows.filter((row) => row !== undefined).length;
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
 * ones included, in the same transaction as the writes.
 */
export async function writeImportedCardio(
  rows: readonly CardioRow[],
  now: number = Date.now()
): Promise<CardioWriteResult> {
  if (rows.length === 0) return { runIds: [], activityIds: [], alreadyStored: 0, overlapping: 0 };
  return db.transaction("rw", db.runs, db.activities, async () => {
    const existing = [...(await db.runs.toArray()), ...(await db.activities.toArray())];
    const plan = planCardio(rows, existing);
    const runs: RunLog[] = [];
    const activities: ActivityLog[] = [];
    for (const entry of plan.add) {
      if (entry.table === "runs") runs.push({ ...entry.row, ...newRowStamps(now) });
      else activities.push({ ...entry.row, ...newRowStamps(now) });
    }
    if (runs.length > 0) await db.runs.bulkAdd(runs);
    if (activities.length > 0) await db.activities.bulkAdd(activities);
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

/**
 * Undoes one import as a whole: soft-deletes its sessions (`deleteImportBatch`) and the
 * runs and activities it added that are still live. Returns how many of each.
 */
export async function undoImport(
  input: UndoImportInput,
  now: number = Date.now()
): Promise<{ sessions: number; runs: number; activities: number }> {
  const sessions = await deleteImportBatch(input.batchId, now);
  const softDelete = async <T extends { id: string; updatedAt?: number; deletedAt?: number | null }>(
    table: Table<T, string>,
    ids: readonly string[]
  ): Promise<number> => {
    let count = 0;
    for (const row of await table.bulkGet([...ids])) {
      if (!row || row.deletedAt != null) continue;
      const stamps = editStamps(row, now);
      await table.update(row.id, { ...stamps, deletedAt: stamps.updatedAt } as never);
      count += 1;
    }
    return count;
  };
  const [runs, activities] = await db.transaction("rw", db.runs, db.activities, async () => [
    await softDelete(db.runs, input.runIds),
    await softDelete(db.activities, input.activityIds),
  ]);
  return { sessions, runs, activities };
}
