import { NextRequest } from 'next/server';
import { neonSql } from '@/db/drizzle';
import { isSyncAuthorized, prepareBatch, buildUpsert } from '@/lib/syncGuard';
import type { PushRequest, PushResponse } from '@/lib/sync/wire';
import { syncJson } from '../respond';

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

  // The whole batch is validated (table, every column of every row) before any write.
  const batch = prepareBatch(body?.table, body?.rows, Date.now());
  if (!batch.ok) {
    return syncJson({ error: batch.error }, 400);
  }

  try {
    let applied = 0;
    for (const row of batch.rows) {
      const { text, values } = buildUpsert(body.table as string, row);
      const result = await neonSql.query(text, values);
      if (result.length > 0) applied += 1;
    }
    const response: PushResponse = {
      success: true,
      applied,
      skipped: batch.rows.length - applied,
    };
    return syncJson(response);
  } catch (error) {
    console.error('Sync push error:', error);
    return syncJson(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
}
