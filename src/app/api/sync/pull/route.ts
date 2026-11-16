import { NextRequest } from 'next/server';
import { neonSql } from '@/db/drizzle';
import { isSyncAuthorized, buildSelectAll, fromPostgresRow, type PgRow } from '@/lib/syncGuard';
import { SYNC_REGISTRY } from '@/lib/sync/registry';
import type { PullResponse, WireRow } from '@/lib/sync/wire';
import { READ_FAILED_REASON, syncJson } from '../respond';

/**
 * Every row of every registry table, soft-deleted rows included. Each table is read on
 * its own, so one that cannot be read (for example not created yet) is reported in
 * `errors` and the rest still arrive.
 */
export async function GET(request: NextRequest) {
  if (!isSyncAuthorized(request.headers.get('authorization'), process.env.SYNC_SECRET)) {
    return syncJson({ error: 'Unauthorized' }, 401);
  }

  const rows: Record<string, WireRow[]> = {};
  const errors: Record<string, string> = {};

  for (const { name } of SYNC_REGISTRY) {
    try {
      const result = await neonSql.query(buildSelectAll(name));
      rows[name] = (result as PgRow[]).map((row) => fromPostgresRow(name, row));
    } catch (error) {
      // The database error stays in the log: it can name tables, users or hosts.
      console.error(`Sync pull error (${name}):`, error);
      errors[name] = READ_FAILED_REASON;
    }
  }

  const response: PullResponse = { rows, errors, serverTime: Date.now() };
  return syncJson(response);
}
