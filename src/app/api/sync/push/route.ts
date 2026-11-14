import { NextRequest, NextResponse } from 'next/server';
import { neonSql } from '@/db/drizzle';
import { isSyncAuthorized, prepareBatch, buildUpsert } from '@/lib/syncGuard';
import type { PushRequest, PushResponse } from '@/lib/sync/wire';

/** Last-write-wins upsert of one batch of rows into one registry table. */
export async function POST(request: NextRequest) {
  if (!isSyncAuthorized(request.headers.get('authorization'), process.env.SYNC_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<PushRequest>;
  try {
    body = (await request.json()) as Partial<PushRequest>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The whole batch is validated (table, every column of every row) before any write.
  const batch = prepareBatch(body?.table, body?.rows, Date.now());
  if (!batch.ok) {
    return NextResponse.json({ error: batch.error }, { status: 400 });
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
    return NextResponse.json(response);
  } catch (error) {
    console.error('Sync push error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
