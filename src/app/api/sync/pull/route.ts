import { NextRequest, NextResponse } from 'next/server';
import { neonSql } from '@/db/drizzle';
import { isSyncAuthorized, buildSelectAll, fromPostgresRow, type PgRow } from '@/lib/syncGuard';
import { SYNC_REGISTRY } from '@/lib/sync/registry';
import type { PullResponse, WireRow } from '@/lib/sync/wire';

/**
 * Every row of every registry table, soft-deleted rows included. Each table is read on
 * its own, so one that cannot be read (for example not created yet) is reported in
 * `errors` and the rest still arrive.
 */
export async function GET(request: NextRequest) {
  if (!isSyncAuthorized(request.headers.get('authorization'), process.env.SYNC_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows: Record<string, WireRow[]> = {};
  const errors: Record<string, string> = {};

  for (const { name } of SYNC_REGISTRY) {
    try {
      const result = await neonSql.query(buildSelectAll(name));
      rows[name] = (result as PgRow[]).map((row) => fromPostgresRow(name, row));
    } catch (error) {
      console.error(`Sync pull error (${name}):`, error);
      errors[name] = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  const response: PullResponse = { rows, errors, serverTime: Date.now() };
  return NextResponse.json(response);
}
