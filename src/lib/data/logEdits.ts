// Data layer: edit, delete and restore of past log entries. Every write stamps
// `updatedAt`, marks the row unsynced and, for workouts, rebuilds the derived tables
// in the same transaction. Contracts only: implemented by data-edits.
import type { DerivedDiff, LogChange } from "@/lib/rebuild";
import type { ActivityLog, RunLog } from "@/types";

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet`);
};

/** Tables whose rows the user can delete and restore. */
export type LogTable = "workouts" | "runs" | "activities" | "bodyweight" | "painEntries";

type Editable<T> = Partial<Omit<T, "id" | "clientId" | "synced" | "updatedAt" | "deletedAt">>;

/** A soft-deleted row, described for the "Recently deleted" list. */
export interface DeletedItem {
  table: LogTable;
  id: string;
  /** Epoch milliseconds of the delete. */
  deletedAt: number;
  /** When the entry itself happened. */
  date: Date;
  /** Short description, for example "A1 workout", "Run, 3.1 mi", "Weigh-in 201.4 lbs". */
  label: string;
}

/** Applies one change to the workout log or the lift adjustments, then rebuilds. */
export async function commitLogChange(change: LogChange): Promise<DerivedDiff> {
  void change;
  return notImplemented("commitLogChange");
}

/**
 * Soft-deletes one row. A workout takes its readiness log with it and triggers a
 * rebuild; other tables have nothing derived stored.
 */
export async function softDelete(table: LogTable, id: string): Promise<void> {
  void table;
  void id;
  return notImplemented("softDelete");
}

/** Undoes `softDelete`, including the readiness log and the rebuild for a workout. */
export async function restore(table: LogTable, id: string): Promise<void> {
  void table;
  void id;
  return notImplemented("restore");
}

export async function updateRun(id: string, patch: Editable<RunLog>): Promise<void> {
  void id;
  void patch;
  return notImplemented("updateRun");
}

export async function updateActivity(id: string, patch: Editable<ActivityLog>): Promise<void> {
  void id;
  void patch;
  return notImplemented("updateActivity");
}

/** Soft-deleted rows from the last `withinMs` (default 30 days), newest delete first. */
export async function listDeleted(withinMs?: number): Promise<DeletedItem[]> {
  void withinMs;
  return notImplemented("listDeleted");
}
