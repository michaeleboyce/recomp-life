// Data layer: sessions imported from other apps' exports. ADD-ONLY: a row is added and
// never updated; the only later change is the soft delete that undoes a whole import.
// Ids come from the parser and are deterministic, so importing a file twice adds nothing.
import { db } from "@/db/local";
import type { ImportedSessionRecord } from "@/types";
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
