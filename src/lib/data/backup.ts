// Data layer: backup and restore. A backup is the LOG only (workouts with their sets,
// adjustments, runs, activities, bodyweight, pain, readiness, profile). Lift states and
// e1RM rows are projections of it, so they are never exported and a restore rebuilds
// them. See docs/plans/2026-11-12-edit-rebuild-plan.md (E12).
import type { Table } from "dexie";
import { db } from "@/db/local";
import { reviveDates } from "@/lib/sync/revive";
import type {
  ActivityLog,
  BodyweightLog,
  LiftAdjustment,
  PainSorenessEntry,
  ReadinessLog,
  RunLog,
  UserProfile,
  WorkoutSession,
} from "@/types";
import { applyRebuild, rebuildTables } from "./derived";
import { editStamps } from "./stamp";

export interface BackupTables {
  workouts: WorkoutSession[];
  liftAdjustments: LiftAdjustment[];
  runs: RunLog[];
  activities: ActivityLog[];
  bodyweight: BodyweightLog[];
  painEntries: PainSorenessEntry[];
  readinessLogs: ReadinessLog[];
  userProfile: UserProfile[];
}

export interface BackupV2 {
  version: 2;
  /** ISO timestamp. */
  exportedAt: string;
  tables: BackupTables;
}

/** The log tables, in the order they are written. */
const TABLE_NAMES = [
  "workouts",
  "liftAdjustments",
  "runs",
  "activities",
  "bodyweight",
  "painEntries",
  "readinessLogs",
  "userProfile",
] as const satisfies readonly (keyof BackupTables)[];

function logTables(): Table[] {
  return TABLE_NAMES.map((name) => db[name] as Table);
}

/** Every log row, deleted ones included, as a version 2 backup. */
export async function exportBackup(): Promise<BackupV2> {
  const tables: Record<string, unknown[]> = {};
  await db.transaction("r", logTables(), async () => {
    for (const name of TABLE_NAMES) tables[name] = await (db[name] as Table).toArray();
  });
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    tables: tables as unknown as BackupTables,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readTable(source: Record<string, unknown>, name: string, required: boolean): unknown[] {
  const rows = source[name];
  if (rows === undefined && !required) return [];
  if (!Array.isArray(rows)) {
    throw new Error(`This backup file has no "${name}" list, so it cannot be restored.`);
  }
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string") {
      throw new Error(`This backup file has a damaged entry in "${name}", so it cannot be restored.`);
    }
  }
  return rows;
}

/**
 * Reads a backup file. Accepts version 2 and the old flat version 1 (its `sets`,
 * `liftStates` and `estimated1RMs` are ignored: they are rebuilt). ISO dates become
 * Dates. Throws an Error with a plain-language message for anything else.
 */
export function parseBackup(text: string): BackupV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not a backup: it could not be read as JSON.");
  }
  if (!isRecord(parsed)) throw new Error("This file is not a Recomp Life backup.");

  const exportedAt =
    typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date(0).toISOString();
  let source: Record<string, unknown>;
  let strict: boolean;
  if (parsed.version === 2) {
    if (!isRecord(parsed.tables)) {
      throw new Error("This backup file has no data tables, so it cannot be restored.");
    }
    source = parsed.tables;
    strict = true;
  } else if (parsed.version === 1) {
    source = parsed;
    strict = false;
  } else {
    throw new Error(
      `This backup file has version ${String(parsed.version)}, which this app cannot read.`
    );
  }

  const tables: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) {
    // A version 1 file always had workouts and a profile; the rest may be missing.
    const required = strict || name === "workouts" || name === "userProfile";
    tables[name] = reviveDates(readTable(source, name, required)) as unknown[];
  }
  return { version: 2, exportedAt, tables: tables as unknown as BackupTables };
}

type StampedRow = { updatedAt?: number; deletedAt?: number | null };

/**
 * Replaces the log with the backup's rows, then rebuilds the derived tables. One
 * transaction. Restored rows are marked unsynced with a fresh stamp so the restore
 * wins on the next sync.
 */
export async function importBackup(backup: BackupV2): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", [...logTables(), ...rebuildTables()], async () => {
    for (const name of TABLE_NAMES) {
      const table = db[name] as Table;
      await table.clear();
      const rows = (backup.tables[name] as unknown as StampedRow[]).map((row) => ({
        ...row,
        ...editStamps(row, now),
        deletedAt: row.deletedAt ?? null,
      }));
      if (rows.length > 0) await table.bulkPut(rows);
    }
    await applyRebuild();
  });
}
