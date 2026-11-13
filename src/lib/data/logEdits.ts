// Data layer: edit, delete and restore of past log entries. Every write stamps
// `updatedAt`, marks the row unsynced and, for workouts and adjustments, rebuilds the
// derived tables in the same transaction.
import type { Table } from "dexie";
import { db } from "@/db/local";
import { describeActivity } from "@/lib/activities";
import { formatRegion } from "@/lib/painModifications";
import { applyChange } from "@/lib/rebuild";
import type { DerivedDiff, LogChange } from "@/lib/rebuild";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  ActivityLog,
  BodyweightLog,
  PainSorenessEntry,
  RunLog,
  Stamped,
  WorkoutSession,
} from "@/types";
import { applyRebuild, rebuildTables } from "./derived";
import { editStamps, nextStamp } from "./stamp";

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
  /** Short description, for example "Workout A1", "Run, 3.1 mi", "Weigh-in 201.4 lbs". */
  label: string;
}

export const RECENTLY_DELETED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type StampedRow = Stamped & { id: string; synced: boolean };

/** The plain (non-workout) log tables, typed just enough to stamp their rows. */
function plainTable(table: Exclude<LogTable, "workouts">): Table<StampedRow, string> {
  return db[table] as unknown as Table<StampedRow, string>;
}

/**
 * Applies one change to the workout log or the lift adjustments, then rebuilds.
 * Only the rows the change touched are written. Deleting or restoring a workout takes
 * its readiness logs (same session id) with it. Rejects, writing nothing, when the
 * change names a workout or set that does not exist.
 */
export async function commitLogChange(change: LogChange): Promise<DerivedDiff> {
  return db.transaction("rw", [...rebuildTables(), db.readinessLogs], async () => {
    const now = Date.now();
    const log = {
      workouts: await db.workouts.toArray(),
      adjustments: await db.liftAdjustments.toArray(),
    };
    const next = applyChange(log, change, now);

    // applyChange keeps untouched rows by reference, so identity finds the changed ones.
    const before = new Map(log.workouts.map((w) => [w.id, w]));
    const changedWorkouts = next.workouts.filter((w) => before.get(w.id) !== w);
    if (changedWorkouts.length > 0) await db.workouts.bulkPut(changedWorkouts);

    const knownAdjustments = new Set(log.adjustments.map((a) => a.id));
    for (const adjustment of next.adjustments) {
      if (knownAdjustments.has(adjustment.id)) continue;
      await db.liftAdjustments.add({
        ...adjustment,
        deletedAt: adjustment.deletedAt ?? null,
        updatedAt: nextStamp(adjustment.updatedAt, now),
        synced: false,
      });
    }

    if (change.kind === "deleteWorkout" || change.kind === "restoreWorkout") {
      const deletedAt = change.kind === "deleteWorkout" ? now : null;
      await db.readinessLogs
        .where("sessionId")
        .equals(change.workoutId)
        .modify((row) => {
          row.deletedAt = deletedAt;
          row.updatedAt = nextStamp(row.updatedAt, now);
          row.synced = false;
        });
    }

    return applyRebuild();
  });
}

/** Sets or clears `deletedAt` on one row; nothing happens when it is already so. */
async function setDeleted(table: LogTable, id: string, deleted: boolean): Promise<void> {
  if (table === "workouts") {
    await db.transaction("rw", [...rebuildTables(), db.readinessLogs], async () => {
      const workout = await db.workouts.get(id);
      if (!workout || (workout.deletedAt != null) === deleted) return;
      await commitLogChange({
        kind: deleted ? "deleteWorkout" : "restoreWorkout",
        workoutId: id,
      });
    });
    return;
  }

  const rows = plainTable(table);
  await db.transaction("rw", rows, async () => {
    const row = await rows.get(id);
    if (!row || (row.deletedAt != null) === deleted) return;
    const now = Date.now();
    await rows.update(id, { deletedAt: deleted ? now : null, ...editStamps(row, now) });
  });
}

/**
 * Soft-deletes one row. A workout takes its readiness log with it and triggers a
 * rebuild; other tables have nothing derived stored. Safe for an unknown id or a row
 * that is already deleted.
 */
export async function softDelete(table: LogTable, id: string): Promise<void> {
  await setDeleted(table, id, true);
}

/** Undoes `softDelete`, including the readiness log and the rebuild for a workout. */
export async function restore(table: LogTable, id: string): Promise<void> {
  await setDeleted(table, id, false);
}

/** Merges a patch into one row of a plain log table. Rejects when the row does not exist. */
async function patchRow(
  table: Exclude<LogTable, "workouts">,
  id: string,
  patch: object
): Promise<void> {
  const rows = plainTable(table);
  await db.transaction("rw", rows, async () => {
    const row = await rows.get(id);
    if (!row) throw new Error(`${table}: no row with id ${id}`);
    await rows.update(id, { ...patch, ...editStamps(row) });
  });
}

/** Edits a run. Rejects when it does not exist. */
export async function updateRun(id: string, patch: Editable<RunLog>): Promise<void> {
  await patchRow("runs", id, patch);
}

/** Edits an activity. Rejects when it does not exist. */
export async function updateActivity(id: string, patch: Editable<ActivityLog>): Promise<void> {
  await patchRow("activities", id, patch);
}

const number = (value: number) => String(Math.round(value * 10) / 10);

function workoutLabel(workout: WorkoutSession): string {
  return WORKOUT_TEMPLATES[workout.templateId]?.name ?? `${workout.templateId} workout`;
}

function runLabel(run: RunLog): string {
  return run.distanceMiles != null
    ? `Run, ${number(run.distanceMiles)} mi`
    : `Run, ${number(run.durationMinutes)} min`;
}

function activityLabel(activity: ActivityLog): string {
  return `${describeActivity(activity)}, ${number(activity.durationMinutes)} min`;
}

function weighInLabel(entry: BodyweightLog): string {
  return `Weigh-in ${number(entry.weight)} lbs`;
}

function painLabel(entry: PainSorenessEntry): string {
  return `${formatRegion(entry.region)} ${entry.sensation}`;
}

/**
 * Soft-deleted rows from the last `withinMs` (default 30 days), newest delete first.
 * A workout that was discarded before it was finished is not listed: it never became a
 * log entry.
 */
export async function listDeleted(
  withinMs: number = RECENTLY_DELETED_WINDOW_MS,
  now: number = Date.now()
): Promise<DeletedItem[]> {
  const cutoff = now - withinMs;
  const items: DeletedItem[] = [];
  const collect = <T extends Stamped & { id: string }>(
    table: LogTable,
    rows: T[],
    date: (row: T) => Date | string,
    label: (row: T) => string
  ) => {
    for (const row of rows) {
      if (row.deletedAt == null || row.deletedAt < cutoff) continue;
      items.push({
        table,
        id: row.id,
        deletedAt: row.deletedAt,
        date: new Date(date(row)),
        label: label(row),
      });
    }
  };

  collect(
    "workouts",
    (await db.workouts.toArray()).filter((w) => w.completedAt != null),
    (w) => w.completedAt!,
    workoutLabel
  );
  collect("runs", await db.runs.toArray(), (r) => r.date, runLabel);
  collect("activities", await db.activities.toArray(), (a) => a.date, activityLabel);
  collect("bodyweight", await db.bodyweight.toArray(), (b) => b.date, weighInLabel);
  collect("painEntries", await db.painEntries.toArray(), (p) => p.date, painLabel);

  return items.sort(
    (a, b) =>
      b.deletedAt - a.deletedAt ||
      b.date.getTime() - a.date.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
