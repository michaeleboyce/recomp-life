// Server-only guards and row mapping for the /api/sync routes. Do not import from
// client code. Everything per table is derived from SYNC_REGISTRY plus the Drizzle
// schema; there is no second list of tables or columns here.
import { createHash, timingSafeEqual } from 'crypto';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { SYNC_REGISTRY, PROFILE_ID, type SyncTableDef } from '@/lib/sync/registry';
import { MAX_CLOCK_SKEW_MS, type WireRow } from '@/lib/sync/wire';

/**
 * Checks an `Authorization: Bearer <passphrase>` header against the server's
 * SYNC_SECRET. Fails closed: if no secret is configured, nothing is authorized.
 */
export function isSyncAuthorized(
  authHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const provided = authHeader.slice('Bearer '.length);
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/** A row keyed by Postgres column name, as sent to or read from the database. */
export type PgRow = Record<string, unknown>;

/** Everything the server knows about one synced table. */
export interface SyncTableInfo {
  def: SyncTableDef;
  /** Every Postgres column of the table, from the Drizzle schema. */
  columns: ReadonlySet<string>;
  /** Postgres columns that hold JSON (jsonb). */
  jsonColumns: ReadonlySet<string>;
  /** Postgres columns holding epoch-ms stamps (bigint), which the driver returns as strings. */
  bigintColumns: ReadonlySet<string>;
  /** Postgres columns that may be null: a row that omits one clears it on the server. */
  nullableColumns: ReadonlySet<string>;
  /** Client field -> Postgres column, for every accepted client field. */
  fieldToColumn: ReadonlyMap<string, string>;
  /** Postgres column -> client field (the reverse of `fieldToColumn`). */
  columnToField: ReadonlyMap<string, string>;
}

const DRIZZLE_TABLES: readonly PgTable[] = (Object.values(schema) as unknown[]).filter(
  (value): value is PgTable => is(value, PgTable)
);

/** The Drizzle table whose Postgres name is `pgName`, if any. */
export function drizzleTableFor(pgName: string): PgTable | undefined {
  return DRIZZLE_TABLES.find((table) => getTableName(table) === pgName);
}

function buildInfo(def: SyncTableDef): SyncTableInfo {
  const table = drizzleTableFor(def.pgName);
  if (!table) {
    throw new Error(`Sync registry table ${def.name} has no Drizzle table "${def.pgName}"`);
  }
  const drizzleColumns = Object.values(getTableColumns(table));
  const columns = new Set(drizzleColumns.map((column) => column.name));
  const jsonColumns = new Set(
    drizzleColumns.filter((column) => column.getSQLType() === 'jsonb').map((c) => c.name)
  );
  const bigintColumns = new Set(
    drizzleColumns.filter((column) => column.getSQLType() === 'bigint').map((c) => c.name)
  );

  const nullableColumns = new Set(
    drizzleColumns.filter((column) => !column.notNull).map((c) => c.name)
  );

  const mappedTargets = new Set(Object.values(def.columns));
  const fieldToColumn = new Map<string, string>(Object.entries(def.columns));
  // An unmapped client field keeps its name, so every column that is not the target
  // of a mapping is reachable under its own name.
  for (const column of columns) {
    if (!mappedTargets.has(column)) fieldToColumn.set(column, column);
  }
  const columnToField = new Map<string, string>();
  for (const [field, column] of fieldToColumn) columnToField.set(column, field);

  return {
    def, columns, jsonColumns, bigintColumns, nullableColumns, fieldToColumn, columnToField,
  };
}

const TABLE_INFO: ReadonlyMap<string, SyncTableInfo> = new Map(
  SYNC_REGISTRY.map((def) => [def.name, buildInfo(def)])
);

export function isSyncTableName(name: unknown): name is string {
  return typeof name === 'string' && TABLE_INFO.has(name);
}

/** Server-side facts about a registry table. Throws for a name not in the registry. */
export function getSyncTableInfo(name: string): SyncTableInfo {
  const info = TABLE_INFO.get(name);
  if (!info) throw new Error(`Unknown sync table: ${name}`);
  return info;
}

/** Client fields of `row` that do not map to a column of the table. */
export function findUnknownFields(table: string, row: WireRow): string[] {
  const { fieldToColumn } = getSyncTableInfo(table);
  return Object.keys(row).filter((field) => !fieldToColumn.has(field));
}

/**
 * Turns a wire row into the column/value pairs to upsert. Client fields become
 * Postgres columns via the registry (unmapped fields keep their name), JSON fields are
 * serialised here (the driver would send a JS array as a Postgres array, which is not
 * valid JSON), and the row is marked synced. A nullable column the row does not carry
 * (omitted or `undefined`) is written as NULL: rows travel whole, and a field cleared
 * on the device has no key at all, so leaving it out would keep the old value on the
 * server forever. `updatedAt`
 * defaults to the server clock and is clamped to it when the client's clock runs more
 * than MAX_CLOCK_SKEW_MS ahead, so one bad clock cannot win every future conflict.
 * The profile always gets the fixed PROFILE_ID, so two devices share one row.
 *
 * Unknown fields are passed through under their own name; reject them first with
 * `prepareBatch` / `findUnknownFields` (column names are interpolated into SQL).
 */
export function toPostgresRow(table: string, row: WireRow, serverNow: number): PgRow {
  const { def, jsonColumns, nullableColumns, fieldToColumn } = getSyncTableInfo(table);
  const result: PgRow = {};
  for (const [field, value] of Object.entries(row)) {
    if (value === undefined) continue;
    const column = fieldToColumn.get(field) ?? field;
    result[column] =
      jsonColumns.has(column) && value !== null ? JSON.stringify(value) : value;
  }

  for (const column of nullableColumns) {
    if (!(column in result)) result[column] = null;
  }

  const stamp = result.updated_at;
  if (typeof stamp !== 'number' || !Number.isFinite(stamp)) {
    result.updated_at = serverNow;
  } else if (stamp > serverNow + MAX_CLOCK_SKEW_MS) {
    result.updated_at = serverNow;
  }

  if (def.singleRow) {
    result.id = PROFILE_ID;
    result.client_id = PROFILE_ID;
  }
  result.synced = true;
  return result;
}

export type PreparedBatch =
  | { ok: true; rows: PgRow[] }
  | { ok: false; error: string };

/**
 * Validates a whole push batch before anything is written: the table must be in the
 * registry, `rows` an array of objects, and every field of every row a known client
 * field. Returns the mapped rows, or the reason the batch is refused.
 */
export function prepareBatch(table: unknown, rows: unknown, serverNow: number): PreparedBatch {
  if (!isSyncTableName(table)) {
    return { ok: false, error: `Unknown table: ${String(table)}` };
  }
  if (!Array.isArray(rows)) {
    return { ok: false, error: 'rows must be an array' };
  }
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      return { ok: false, error: `Invalid row for table: ${table}` };
    }
    if (findUnknownFields(table, row as WireRow).length > 0) {
      return { ok: false, error: `Unknown column in rows for table: ${table}` };
    }
  }
  return { ok: true, rows: rows.map((row) => toPostgresRow(table, row as WireRow, serverNow)) };
}

/**
 * The last-write-wins upsert for one row already mapped by `toPostgresRow`: insert, or
 * on a `client_id` conflict update every column except `id` and `client_id`, but only
 * when the incoming `updated_at` is newer than or equal to the stored one. RETURNING
 * yields one row when the write was applied and none when it was skipped.
 *
 * Values are parameters; column names are interpolated, so any column that is not in
 * the table's schema throws.
 */
export function buildUpsert(table: string, row: PgRow): { text: string; values: unknown[] } {
  const { def, columns: allowed } = getSyncTableInfo(table);
  const columns = Object.keys(row);
  if (columns.some((column) => !allowed.has(column))) {
    throw new Error(`Unknown column in rows for table: ${table}`);
  }

  const pg = def.pgName;
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updates = columns.filter((c) => c !== 'client_id' && c !== 'id');
  const onConflict = updates.length
    ? `DO UPDATE SET ${updates.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')} ` +
      `WHERE COALESCE(EXCLUDED."updated_at", 0) >= COALESCE("${pg}"."updated_at", 0)`
    : 'DO NOTHING';

  return {
    text: `INSERT INTO "${pg}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("client_id") ${onConflict} RETURNING "client_id"`,
    values: Object.values(row),
  };
}

/** The query that reads every row of a table for pull, soft-deleted rows included. */
export function buildSelectAll(table: string): string {
  return `SELECT * FROM "${getSyncTableInfo(table).def.pgName}"`;
}

function toStampNumber(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'bigint') return Number(value);
  return value;
}

/**
 * Turns a row read from Postgres into a wire row: columns become client fields (the
 * reverse of the registry map), and bigint stamps, which the driver returns as
 * strings, become numbers (null stays null). JSON columns already arrive parsed.
 */
export function fromPostgresRow(table: string, row: PgRow): WireRow {
  const { columnToField, bigintColumns } = getSyncTableInfo(table);
  const result: WireRow = {};
  for (const [column, value] of Object.entries(row)) {
    const field = columnToField.get(column) ?? column;
    result[field] = bigintColumns.has(column) ? toStampNumber(value) : value;
  }
  return result;
}
