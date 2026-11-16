/**
 * Preloading exports straight into the database (scripts/import-history.ts): the same
 * parsers, mapping (the built-in table only, no remembered choices) and record building
 * as the import screen, then rows in the sync format, written so every device pulls them
 * on its next sync. Node only: it uses the server's sync mapping (`@/lib/syncGuard`).
 *
 * Nothing here prints or returns row contents: totals are counts only.
 */
import { prepareBatch, getSyncTableInfo, type PgRow } from "@/lib/syncGuard";
import type { WireRow } from "@/lib/sync/wire";
import type { ImportedSessionRecord } from "@/types";
import { planCardio, type TimedRow } from "./cardio";
import { summariseMapping } from "./mapping";
import { parseExport } from "./parse";
import { buildCardioRows, buildSessionRecords, type CardioRow } from "./records";

/** One export's text. Totals name a file by its place in the list, never its name or path. */
export interface PreloadFile {
  text: string;
}

export interface PreloadFileTotals {
  app: string;
  rows: number;
  sessions: number;
  sets: number;
  warmups: number;
  drops: number;
  cardio: number;
  cardioNoDuration: number;
  rejected: number;
  error?: string;
}

export interface PreloadTotals {
  files: PreloadFileTotals[];
  /** Distinct sessions across the files. */
  sessions: number;
  sets: number;
  /** Cardio rows after the overlap check among the files themselves. */
  cardio: { runs: number; activities: number; overlapping: number; noDuration: number };
  /** Distinct exercise names by how they map, and the sets under each. */
  names: Record<"mapped" | "guessed" | "unknown", { names: number; sets: number }>;
}

export interface PreloadPlan {
  sessions: ImportedSessionRecord[];
  cardio: CardioRow[];
  totals: PreloadTotals;
}

/** Parses and maps every file and builds the rows (built-in mapping only). */
export function planPreload(files: readonly PreloadFile[], batchId: string): PreloadPlan {
  const byId = new Map<string, ImportedSessionRecord>();
  const cardio: CardioRow[] = [];
  const fileTotals: PreloadFileTotals[] = [];
  let noDuration = 0;
  for (const file of files) {
    const parsed = parseExport(file.text);
    const sessions = buildSessionRecords(parsed, batchId);
    const built = buildCardioRows(parsed);
    noDuration += built.noDuration;
    cardio.push(...built.rows);
    for (const s of sessions) if (!byId.has(s.id)) byId.set(s.id, s);
    const sets = sessions.flatMap((s) => s.sets);
    fileTotals.push({
      app: parsed.app,
      rows: parsed.rowCount,
      sessions: sessions.length,
      sets: sets.length,
      warmups: sets.filter((s) => s.role === "warmup").length,
      drops: sets.filter((s) => s.role === "drop").length,
      cardio: parsed.cardio.length,
      cardioNoDuration: built.noDuration,
      rejected: parsed.rejected.length,
      ...(parsed.error ? { error: parsed.error } : {}),
    });
  }
  const sessions = [...byId.values()].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || (a.id < b.id ? -1 : 1));
  const within = planCardio(cardio, []);

  const summary = summariseMapping(sessions.flatMap((s) => s.sets.map((set) => set.exerciseName)));
  const names: PreloadTotals["names"] = {
    mapped: { names: 0, sets: 0 },
    guessed: { names: 0, sets: 0 },
    unknown: { names: 0, sets: 0 },
  };
  for (const row of summary.rows) {
    const group = row.mapping.kind === "mapped" || row.mapping.kind === "custom" ? "mapped" : row.mapping.kind === "guess" ? "guessed" : "unknown";
    names[group].names += 1;
    names[group].sets += row.occurrences;
  }

  return {
    sessions,
    cardio: within.add,
    totals: {
      files: fileTotals,
      sessions: sessions.length,
      sets: sessions.reduce((n, s) => n + s.sets.length, 0),
      cardio: {
        runs: within.add.filter((c) => c.table === "runs").length,
        activities: within.add.filter((c) => c.table === "activities").length,
        overlapping: within.overlapping,
        noDuration,
      },
      names,
    },
  };
}

/** The totals as lines to print: counts only. */
export function formatTotals(totals: PreloadTotals): string[] {
  const lines = totals.files.map((f, i) =>
    f.error
      ? `File ${i + 1}: not read (${f.error})`
      : `File ${i + 1} (${f.app}): ${f.rows} rows, ${f.sessions} sessions, ${f.sets} sets (${f.warmups} warm-ups, ${f.drops} drops), ${f.cardio} cardio entries (${f.cardioNoDuration} without a duration), ${f.rejected} rows rejected`
  );
  const n = totals.names;
  lines.push(
    `All files: ${totals.sessions} sessions, ${totals.sets} sets; cardio to add: ${totals.cardio.runs} runs and ${totals.cardio.activities} activities (${totals.cardio.overlapping} overlapping another entry in the files, ${totals.cardio.noDuration} without a duration)`,
    `Exercise names: ${n.mapped.names} mapped (${n.mapped.sets} sets), ${n.guessed.names} muscle-guessed (${n.guessed.sets} sets), ${n.unknown.names} unknown (${n.unknown.sets} sets)`
  );
  return lines;
}

/** A row as the sync client would push it (dates as ISO strings), stamped as written now. */
export function toWireRow(record: object, serverNow: number): WireRow {
  const row = JSON.parse(JSON.stringify(record)) as WireRow;
  row.updatedAt = serverNow;
  row.deletedAt = null;
  return row;
}

export type PreloadTable = "importedSessions" | "runs" | "activities";

/** Rows mapped to Postgres columns exactly as the push route maps them (`prepareBatch`). */
export function toPgRows(table: PreloadTable, records: readonly object[], serverNow: number): PgRow[] {
  const batch = prepareBatch(table, records.map((r) => toWireRow(r, serverNow)), serverNow);
  if (!batch.ok) throw new Error(batch.error);
  return batch.rows;
}

export interface Statement {
  text: string;
  values: unknown[];
}

/**
 * One multi-row insert that skips any row whose id (or client id) is already stored:
 * idempotent, and it never overwrites a row a device has changed or deleted since.
 * RETURNING gives one row per row inserted.
 */
export function insertIgnoring(table: PreloadTable, rows: readonly PgRow[]): Statement {
  if (rows.length === 0) throw new Error("No rows to insert");
  const { def, columns: allowed } = getSyncTableInfo(table);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  for (const column of columns) {
    if (!allowed.has(column)) throw new Error(`Unknown column in rows for table: ${table}`);
  }
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const slots = columns.map((column) => {
      values.push(column in row ? row[column] : null);
      return `$${values.length}`;
    });
    return `(${slots.join(", ")})`;
  });
  return {
    text: `INSERT INTO "${def.pgName}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${tuples.join(", ")} ON CONFLICT DO NOTHING RETURNING "id"`,
    values,
  };
}

/** Rows per insert: well under Postgres's parameter limit and a modest request size. */
export const PRELOAD_BATCH_SIZE = 100;

export interface PreloadDatabase {
  /** Runs the statements in one transaction; one result (its rows) per statement. */
  transaction(statements: Statement[]): Promise<unknown[][]>;
  /** Every stored run and activity (soft-deleted included), for the overlap check. */
  loggedCardio(): Promise<TimedRow[]>;
}

export interface PreloadWriteResult {
  sessionsInserted: number;
  sessionsSkipped: number;
  runsInserted: number;
  activitiesInserted: number;
  cardioOverlappingLogged: number;
  cardioAlreadyStored: number;
  batches: number;
}

async function writeTable(
  db: PreloadDatabase,
  table: PreloadTable,
  records: readonly object[],
  serverNow: number,
  onBatch?: (table: PreloadTable, done: number, total: number) => void
): Promise<{ inserted: number; batches: number }> {
  let inserted = 0;
  let batches = 0;
  for (let i = 0; i < records.length; i += PRELOAD_BATCH_SIZE) {
    const slice = records.slice(i, i + PRELOAD_BATCH_SIZE);
    const [rows] = await db.transaction([insertIgnoring(table, toPgRows(table, slice, serverNow))]);
    inserted += rows.length;
    batches += 1;
    onBatch?.(table, Math.min(i + PRELOAD_BATCH_SIZE, records.length), records.length);
  }
  return { inserted, batches };
}

/**
 * Writes a plan: the sessions, then the cardio that overlaps nothing already stored in
 * the database, in batches of PRELOAD_BATCH_SIZE, one transaction per batch.
 */
export async function writePreload(
  plan: PreloadPlan,
  db: PreloadDatabase,
  serverNow: number,
  onBatch?: (table: PreloadTable, done: number, total: number) => void
): Promise<PreloadWriteResult> {
  const sessions = await writeTable(db, "importedSessions", plan.sessions, serverNow, onBatch);
  const cardio = planCardio(plan.cardio, await db.loggedCardio());
  const runs = await writeTable(db, "runs", cardio.add.filter((c) => c.table === "runs").map((c) => c.row), serverNow, onBatch);
  const activities = await writeTable(
    db,
    "activities",
    cardio.add.filter((c) => c.table === "activities").map((c) => c.row),
    serverNow,
    onBatch
  );
  return {
    sessionsInserted: sessions.inserted,
    sessionsSkipped: plan.sessions.length - sessions.inserted,
    runsInserted: runs.inserted,
    activitiesInserted: activities.inserted,
    cardioOverlappingLogged: cardio.overlapping,
    cardioAlreadyStored: cardio.alreadyStored,
    batches: sessions.batches + runs.batches + activities.batches,
  };
}
