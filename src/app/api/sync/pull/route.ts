import { NextRequest } from 'next/server';
import { neonSql } from '@/db/drizzle';
import { isSyncAuthorized, isSyncTableName, buildSelectPage, pagePullRows, type PgRow } from '@/lib/syncGuard';
import {
  PULL_PAGE_BYTES,
  PULL_PAGE_ROWS,
  decodePullCursor,
  type PullCursor,
  type PullPageResponse,
} from '@/lib/sync/wire';
import { READ_FAILED_REASON, SYNC_ERROR_CODE, syncJson } from '../respond';

/** Seconds this route may run: one page is one query, so a minute is far more than enough. A literal: Next.js reads it from the source. */
export const maxDuration = 60;

/**
 * One page of one registry table (`?table=<name>`), soft-deleted rows included, in the
 * server's write order: from `since` (epoch ms, optional) and after `cursor` (the
 * previous page's `nextCursor`, optional). A page holds at most PULL_PAGE_ROWS rows and
 * about PULL_PAGE_BYTES of JSON, far below the size a function may return. The client
 * asks again with `nextCursor` until it is null. See `PullPageResponse`.
 */
export async function GET(request: NextRequest) {
  if (!isSyncAuthorized(request.headers.get('authorization'), process.env.SYNC_SECRET)) {
    return syncJson({ error: 'Unauthorized' }, 401);
  }

  const params = request.nextUrl.searchParams;
  const table = params.get('table');
  if (!isSyncTableName(table)) {
    return syncJson({ error: `Unknown table: ${String(table)}` }, 400);
  }

  let since: number | undefined;
  const sinceText = params.get('since');
  if (sinceText !== null) {
    if (!/^\d{1,16}$/.test(sinceText)) return syncJson({ error: 'since must be a stamp in epoch milliseconds' }, 400);
    since = Number(sinceText);
  }

  let cursor: PullCursor | undefined;
  const cursorText = params.get('cursor');
  if (cursorText !== null) {
    const decoded = decodePullCursor(cursorText);
    if (!decoded) return syncJson({ error: 'cursor must be a nextCursor from an earlier page' }, 400);
    cursor = decoded;
  }

  try {
    const { text, values } = buildSelectPage(table, { since, cursor, limit: PULL_PAGE_ROWS });
    const result = (await neonSql.query(text, values)) as PgRow[];
    const page = pagePullRows(table, result, { maxRows: PULL_PAGE_ROWS, maxBytes: PULL_PAGE_BYTES });
    const response: PullPageResponse = {
      table,
      rows: page.rows,
      nextCursor: page.nextCursor,
      serverTime: Date.now(),
    };
    return syncJson(response);
  } catch (error) {
    // The database error stays in the log: it can name tables, users or hosts.
    console.error(`Sync pull error (${table}):`, error);
    return syncJson({ error: READ_FAILED_REASON, code: SYNC_ERROR_CODE.readFailed }, 500);
  }
}
