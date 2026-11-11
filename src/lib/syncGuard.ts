// Server-only guards for the /api/sync routes. Do not import from client code.
import { createHash, timingSafeEqual } from 'crypto';
import { getTableColumns } from 'drizzle-orm';
import * as schema from '@/db/schema';

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

const SYNC_TABLES = {
  workouts: schema.workouts,
  sets: schema.sets,
  runs: schema.runs,
  bodyweight: schema.bodyweight,
  painEntries: schema.painEntries,
  estimated1RMs: schema.estimated1RMs,
  liftStates: schema.liftStates,
  userProfile: schema.userProfile,
  readinessLogs: schema.readinessLogs,
} as const;

export type SyncTableName = keyof typeof SYNC_TABLES;

function columnNames(table: (typeof SYNC_TABLES)[SyncTableName]): ReadonlySet<string> {
  return new Set(Object.values(getTableColumns(table)).map((column) => column.name));
}

/** Postgres column names each synced table accepts, derived from the Drizzle schema. */
export const SYNC_ALLOWED_COLUMNS: Record<SyncTableName, ReadonlySet<string>> = {
  workouts: columnNames(SYNC_TABLES.workouts),
  sets: columnNames(SYNC_TABLES.sets),
  runs: columnNames(SYNC_TABLES.runs),
  bodyweight: columnNames(SYNC_TABLES.bodyweight),
  painEntries: columnNames(SYNC_TABLES.painEntries),
  estimated1RMs: columnNames(SYNC_TABLES.estimated1RMs),
  liftStates: columnNames(SYNC_TABLES.liftStates),
  userProfile: columnNames(SYNC_TABLES.userProfile),
  readinessLogs: columnNames(SYNC_TABLES.readinessLogs),
};

/** Returns the columns that are not part of the table's schema. */
export function findUnknownColumns(
  columns: string[],
  allowed: ReadonlySet<string>
): string[] {
  return columns.filter((column) => !allowed.has(column));
}
