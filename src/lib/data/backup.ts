// Data layer: backup and restore. A backup is the LOG only (workouts with their sets,
// adjustments, runs, activities, bodyweight, pain, readiness, profile). Lift states and
// e1RM rows are projections of it, so they are never exported and a restore rebuilds
// them. See docs/plans/2026-11-12-edit-rebuild-plan.md (E12).
import type { Table } from "dexie";
import { db } from "@/db/local";
import { resetPullState } from "@/lib/sync/pullState";
import { reviveDates } from "@/lib/sync/revive";
import type {
  ActivityLog,
  BodyweightLog,
  CoachEvent,
  FavoriteWorkout,
  Forecast,
  HealthDailyLog,
  ImportedSessionRecord,
  LiftAdjustment,
  PainSorenessEntry,
  ReadinessLog,
  RunLog,
  UserProfile,
  WorkoutSession,
} from "@/types";
import { applyRebuild, rebuildTables } from "./derived";
import { sanitizeSettings } from "./settingsShape";
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
  /** Daily values imported from Apple Health. Absent from backups made before it existed. */
  healthDaily: HealthDailyLog[];
  /** Saved workouts. Absent from backups made before favourites existed. */
  favoriteWorkouts: FavoriteWorkout[];
  /** Stored forecasts. Absent from backups made before they existed. */
  forecasts: Forecast[];
  /** The coach's change log. Absent from backups made before it existed. */
  coachEvents: CoachEvent[];
  /** Sessions imported from other apps. Absent from backups made before they existed. */
  importedSessions: ImportedSessionRecord[];
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
  "healthDaily",
  "favoriteWorkouts",
  "forecasts",
  "coachEvents",
  "importedSessions",
] as const satisfies readonly (keyof BackupTables)[];

/** Tables a version 2 file may lack because they were added after the format was set. */
const OPTIONAL_TABLES: ReadonlySet<string> = new Set([
  "healthDaily",
  "favoriteWorkouts",
  "forecasts",
  "coachEvents",
  "importedSessions",
]);

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
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

type TableName = (typeof TABLE_NAMES)[number];

// ---------------------------------------------------------------------------
// Row checks. Every row is checked before anything is replaced: a damaged or
// hand-edited file is refused whole rather than wiping real history. The required
// fields are the ones each type requires and the server stores as NOT NULL
// (src/db/schema.ts), so every row the app wrote or pulled passes.
// ---------------------------------------------------------------------------

type ValueKind = "string" | "number" | "boolean" | "date" | "list" | "record";
/** `kind`: present, of that kind. `kind|null`: present, may be null. `kind?`: may be absent or null. */
type FieldRule = ValueKind | `${ValueKind}|null` | `${ValueKind}?`;
type RowRules = Readonly<Record<string, FieldRule>>;

/** Fields every log row carries, checked after the table's own (those mean more to a reader). */
const STAMP_RULES: RowRules = {
  clientId: "string",
  updatedAt: "number?",
  deletedAt: "number?",
  externalId: "string?",
};

const IMPORT_SOURCE: RowRules = { source: "string?", sourceName: "string?", importBatchId: "string?" };

const ROW_RULES: Readonly<Record<TableName, RowRules>> = {
  workouts: {
    templateId: "string",
    location: "string",
    startedAt: "date",
    completedAt: "date|null",
    totalDurationSeconds: "number",
    includeWarmUps: "boolean",
    selectedAccessories: "list",
    sets: "list",
    preWorkoutPainEntries: "list",
    modifications: "list",
    endedEarly: "boolean?",
    prescribed: "list?",
    completionContext: "record?",
    planEdits: "list?",
    favoriteId: "string?",
    health: "record?",
    decisions: "list?",
  },
  liftAdjustments: {
    exerciseId: "string",
    at: "date",
    source: "string",
    set: "record",
    variant: "record?",
    note: "string?",
  },
  runs: {
    date: "date",
    durationMinutes: "number",
    distanceMiles: "number|null",
    type: "string",
    category: "string",
    notes: "string",
    perceivedEffort: "number|null",
    ...IMPORT_SOURCE,
  },
  activities: {
    date: "date",
    kind: "string",
    durationMinutes: "number",
    style: "string|null",
    distanceMiles: "number|null",
    notes: "string",
    perceivedEffort: "number|null",
    ...IMPORT_SOURCE,
  },
  bodyweight: {
    date: "date",
    weight: "number",
    timeOfDay: "string",
    source: "string?",
    sourceName: "string?",
  },
  painEntries: {
    date: "date",
    region: "string",
    sensation: "string",
    severity: "number",
    notes: "string?",
    associatedWorkoutId: "string?",
  },
  readinessLogs: {
    sessionId: "string",
    sleepHours: "string",
    stressLevel: "string",
    date: "date",
    sleepMinutes: "number?",
    sleepSource: "string?",
  },
  userProfile: {
    name: "string",
    bodyweight: "number",
    heightInches: "number",
    createdAt: "date",
    settings: "record",
  },
  healthDaily: {
    day: "string",
    ...Object.fromEntries(
      [
        "sleepMinutes", "sleepDeepMinutes", "sleepRemMinutes", "steps", "restingHr", "hrvMs",
        "activeEnergyKcal", "exerciseMinutes", "vo2Max", "bodyFatPct", "leanMassLbs",
        "dietaryKcal", "proteinG",
      ].map((field) => [field, "number?" as const])
    ),
  },
  favoriteWorkouts: {
    name: "string",
    templateId: "string",
    location: "string",
    includeWarmUps: "boolean",
    selectedAccessories: "list",
    substitutes: "record",
    edits: "list",
    snapshot: "list",
    sourceSessionId: "string?",
    createdAt: "date",
    lastUsedAt: "date?",
  },
  forecasts: {
    slot: "string",
    kind: "string",
    workoutId: "string?",
    exerciseId: "string?",
    tier: "string?",
    madeAt: "date",
    dueAt: "date",
    event: "record",
    prediction: "record",
    basis: "string",
    inputs: "record",
    modelVersion: "string",
  },
  coachEvents: {
    at: "date",
    kind: "string",
    title: "string",
    detail: "string",
    ruleId: "string?",
    data: "record?",
  },
  importedSessions: {
    sourceApp: "string",
    startedAt: "date",
    startIsLocal: "boolean",
    endedAt: "date|null",
    title: "string",
    notes: "string",
    importBatchId: "string",
    sets: "list",
  },
};

/** Lists inside a row whose entries are checked too: the sets of a workout and of an imported session. */
const NESTED_RULES: Partial<Record<TableName, { field: string; noun: string; rules: RowRules }>> = {
  workouts: {
    field: "sets",
    noun: "set",
    rules: {
      id: "string",
      exerciseId: "string",
      tier: "string",
      setNumber: "number",
      actualReps: "number",
      weight: "number",
      completedAt: "date",
      status: "string",
    },
  },
  importedSessions: {
    field: "sets",
    noun: "set",
    rules: { id: "string", exerciseName: "string", setOrder: "number", role: "string" },
  },
};

/** What one row of each table is called in a message. */
const ROW_NOUNS: Readonly<Record<TableName, string>> = {
  workouts: "workout",
  liftAdjustments: "lift adjustment",
  runs: "run",
  activities: "activity",
  bodyweight: "weigh-in",
  painEntries: "pain entry",
  readinessLogs: "readiness check-in",
  userProfile: "profile",
  healthDaily: "health day",
  favoriteWorkouts: "saved workout",
  forecasts: "forecast",
  coachEvents: "change-log entry",
  importedSessions: "imported session",
};

const KIND_WORDS: Readonly<Record<ValueKind, string>> = {
  string: "text",
  number: "a number",
  boolean: "true or false",
  date: "a date",
  list: "a list",
  record: "a group of values",
};

function isKind(value: unknown, kind: ValueKind): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return value instanceof Date && !Number.isNaN(value.getTime());
    case "list":
      return Array.isArray(value);
    case "record":
      return isRecord(value);
  }
}

/** A value in plain words, for a message. */
function describe(value: unknown): string {
  if (typeof value === "string") {
    return `the text "${value.length > 40 ? `${value.slice(0, 40)}...` : value}"`;
  }
  if (typeof value === "number") return `the number ${value}`;
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return "a date";
  if (Array.isArray(value)) return "a list";
  return "a group of values";
}

/** What is wrong with one field, or null when nothing is. */
function fieldProblem(row: Record<string, unknown>, field: string, rule: FieldRule): string | null {
  const optional = rule.endsWith("?");
  const nullable = optional || rule.includes("|null");
  const kind = rule.replace("?", "").replace("|null", "") as ValueKind;
  const value = row[field];
  if (value === undefined) return optional ? null : `has no "${field}"`;
  if (value === null) return nullable ? null : `has no "${field}"`;
  if (isKind(value, kind)) return null;
  if (kind === "date" && value instanceof Date) return `has "${field}" set to a date that does not exist`;
  return `has "${field}" as ${describe(value)}, not ${KIND_WORDS[kind]}`;
}

/**
 * The first problem with a row, or null. `where` names it (`weigh-in 3 of 5 in
 * "bodyweight"`), followed by its id when `withId` and it has one.
 */
function rowProblem(row: unknown, rules: RowRules, where: string, withId = true): string | null {
  if (!isRecord(row)) return `${where} is damaged: it is ${describe(row)}, not a group of values`;
  const named = withId && typeof row.id === "string" ? `${where} (id "${row.id}")` : where;
  for (const [field, rule] of Object.entries(rules)) {
    const problem = fieldProblem(row, field, rule);
    if (problem) return `${named} ${problem}`;
  }
  return null;
}

/**
 * Checks every row of every log table (dates already revived) and throws one
 * plain-language Error naming the table, the row and the problem. Nothing is written.
 */
function checkRows(tables: Readonly<Record<string, unknown>>): void {
  const refuse = (problem: string): never => {
    throw new Error(`This backup cannot be restored, so nothing was changed: ${problem}.`);
  };
  for (const name of TABLE_NAMES) {
    const rows = tables[name];
    if (!Array.isArray(rows)) refuse(`it has no "${name}" list`);
    const list = rows as unknown[];
    const rules: RowRules = { id: "string", ...ROW_RULES[name], ...STAMP_RULES };
    const nested = NESTED_RULES[name];
    list.forEach((row, index) => {
      const where = `${ROW_NOUNS[name]} ${index + 1} of ${list.length} in "${name}"`;
      const problem = rowProblem(row, rules, where);
      if (problem) refuse(problem);
      if (!nested) return;
      // The row passed, so it has its id and the list. The row's id is the one to look for.
      const named = `${where} (id "${(row as { id: string }).id}")`;
      const entries = (row as Record<string, unknown[]>)[nested.field];
      entries.forEach((entry, at) => {
        const inner = `${nested.noun} ${at + 1} of ${entries.length} of ${named}`;
        const entryProblem = rowProblem(entry, nested.rules, inner, false);
        if (entryProblem) refuse(entryProblem);
      });
    });
  }
}

/** Reads one table's list; an optional table a file lacks is empty. */
function readTable(source: Record<string, unknown>, name: string, required: boolean): unknown[] {
  const rows = source[name];
  if (rows === undefined && !required) return [];
  if (!Array.isArray(rows)) {
    throw new Error(`This backup file has no "${name}" list, so it cannot be restored.`);
  }
  return rows;
}

/**
 * A version 1 row may predate `clientId` (the profile, pain entries and readiness
 * check-ins had none): it takes the row's id, as every row created since does.
 */
function withClientId(row: unknown): unknown {
  if (!isRecord(row) || typeof row.id !== "string" || row.clientId != null) return row;
  return { ...row, clientId: row.id };
}

/**
 * Reads a backup file and checks every row before anything is replaced.
 *
 * - Version 2: `tables` holds every log table; those added after the format was set
 *   (OPTIONAL_TABLES) may be missing. Every row needs its `clientId`.
 * - Version 1, the old flat file: only `workouts` and `userProfile` must be there; a
 *   row without a `clientId` takes its id; `sets`, `liftStates` and `estimated1RMs`
 *   are ignored (the sets live in their workouts, the rest is rebuilt).
 *
 * ISO dates become Dates. Throws an Error with a plain-language message naming the
 * table, the row and the problem for anything it cannot restore.
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
  const tables: Record<string, unknown[]> = {};
  if (parsed.version === 2) {
    if (!isRecord(parsed.tables)) {
      throw new Error("This backup file has no data tables, so it cannot be restored.");
    }
    for (const name of TABLE_NAMES) {
      const rows = readTable(parsed.tables, name, !OPTIONAL_TABLES.has(name));
      tables[name] = reviveDates(rows) as unknown[];
    }
  } else if (parsed.version === 1) {
    for (const name of TABLE_NAMES) {
      // A version 1 file always had workouts and a profile; the rest may be missing.
      const rows = readTable(parsed, name, name === "workouts" || name === "userProfile");
      tables[name] = reviveDates(rows.map(withClientId)) as unknown[];
    }
  } else {
    throw new Error(
      `This backup file has version ${String(parsed.version)}, which this app cannot read.`
    );
  }

  checkRows(tables);
  return { version: 2, exportedAt, tables: tables as unknown as BackupTables };
}

type StampedRow = {
  id: string;
  clientId?: unknown;
  settings?: unknown;
  updatedAt?: number;
  deletedAt?: number | null;
};

/**
 * Replaces the log with the backup's rows, then rebuilds the derived tables. One
 * transaction, opened only after every row passed the same checks as `parseBackup`:
 * a backup with one bad row replaces nothing. Restored rows are marked unsynced with a
 * fresh stamp so the restore wins on the next sync, and sync forgets how far it
 * pulled, so the next pull reads the server's rows the backup lacks again. A row
 * without a `clientId` gets its `id`, and the profile's settings are made safe to read
 * (`sanitizeSettings`).
 */
export async function importBackup(backup: BackupV2): Promise<void> {
  checkRows(isRecord(backup?.tables) ? backup.tables : {});
  const now = Date.now();
  await db.transaction("rw", [...logTables(), ...rebuildTables()], async () => {
    for (const name of TABLE_NAMES) {
      const table = db[name] as Table;
      await table.clear();
      const rows = (backup.tables[name] as unknown as StampedRow[]).map((row) => ({
        ...row,
        // Every synced row needs one; the server refuses a row without it, for good.
        clientId: typeof row.clientId === "string" && row.clientId ? row.clientId : row.id,
        ...(name === "userProfile" ? { settings: sanitizeSettings(row.settings) } : {}),
        ...editStamps(row, now),
        deletedAt: row.deletedAt ?? null,
      }));
      if (rows.length > 0) await table.bulkPut(rows);
    }
    await applyRebuild();
  });
  resetPullState(db.name);
}
