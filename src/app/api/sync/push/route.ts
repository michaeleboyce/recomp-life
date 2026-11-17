import { NextRequest } from 'next/server';
import { neonSql } from '@/db/drizzle';
import { isSyncAuthorized, prepareBatch, buildUpsert } from '@/lib/syncGuard';
import { MAX_PUSH_ROWS, type PushRequest, type PushResponse } from '@/lib/sync/wire';
import { PUSH_FAILED_MESSAGE, SYNC_ERROR_CODE, syncJson } from '../respond';

/**
 * Seconds this route may run: a full batch of MAX_PUSH_ROWS is one upsert per row, a
 * few seconds against Neon, so a minute leaves plenty of room. The next pull's
 * `since` reaches back further than this (PULL_SINCE_OVERLAP_MS). A literal: Next.js
 * reads it from the source.
 */
export const maxDuration = 60;

/** Failed rows, with none written before them, after which a push stops: the database is down. */
const PUSH_FAILURES_BEFORE_STOP = 3;

/** Last-write-wins upsert of one batch of rows into one registry table. */
export async function POST(request: NextRequest) {
  if (!isSyncAuthorized(request.headers.get('authorization'), process.env.SYNC_SECRET)) {
    return syncJson({ error: 'Unauthorized' }, 401);
  }

  let body: Partial<PushRequest>;
  try {
    body = (await request.json()) as Partial<PushRequest>;
  } catch {
    return syncJson({ error: 'Invalid JSON body' }, 400);
  }

  // One request does at most MAX_PUSH_ROWS upserts; the client sends larger tables in batches.
  if (Array.isArray(body?.rows) && body.rows.length > MAX_PUSH_ROWS) {
    return syncJson(
      {
        error: `Too many rows in one push: ${body.rows.length}. Send at most ${MAX_PUSH_ROWS} rows per request.`,
        code: SYNC_ERROR_CODE.pushTooLarge,
      },
      413
    );
  }

  // The whole batch is validated (table, every column of every row) before any write.
  const batch = prepareBatch(body?.table, body?.rows, Date.now());
  if (!batch.ok) {
    return syncJson({ error: batch.error }, 400);
  }

  // Each row is written on its own, so one the database refuses (a value it cannot
  // store) does not hold back the rest of its table on every later sync. When the
  // first rows all fail the database itself is failing: the push stops there.
  let applied = 0;
  let succeeded = 0;
  const failed: number[] = [];
  for (const [index, row] of batch.rows.entries()) {
    try {
      const { text, values } = buildUpsert(body.table as string, row);
      const result = await neonSql.query(text, values);
      succeeded += 1;
      if (result.length > 0) applied += 1;
    } catch (error) {
      failed.push(index);
      // The database error stays in the log: it can name tables, users or hosts.
      console.error(`Sync push error (${String(body.table)}, row ${index}):`, error);
      if (succeeded === 0 && failed.length >= PUSH_FAILURES_BEFORE_STOP) break;
    }
  }

  // Nothing written at all: the whole push failed, and the client keeps every row dirty.
  if (failed.length > 0 && succeeded === 0) {
    return syncJson({ error: PUSH_FAILED_MESSAGE, code: SYNC_ERROR_CODE.pushFailed }, 500);
  }
  const response: PushResponse = {
    success: true,
    applied,
    skipped: batch.rows.length - applied - failed.length,
    ...(failed.length > 0 ? { failed } : {}),
  };
  return syncJson(response);
}
