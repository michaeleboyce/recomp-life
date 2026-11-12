import { NextRequest, NextResponse } from 'next/server';
import { neonSql } from '@/db/drizzle';
import {
  isSyncAuthorized,
  findUnknownColumns,
  toPostgresRow,
  SYNC_ALLOWED_COLUMNS,
  type SyncTableName,
} from '@/lib/syncGuard';

const PG_TABLE_NAMES: Record<string, string> = {
  workouts: 'workouts', sets: 'sets', runs: 'runs', bodyweight: 'bodyweight',
  painEntries: 'pain_entries', estimated1RMs: 'estimated_1rms',
  liftStates: 'lift_states', userProfile: 'user_profile', readinessLogs: 'readiness_logs',
};

const PK_COLUMNS: Record<string, string> = {
  workouts: 'id', sets: 'id', runs: 'id', bodyweight: 'id',
  painEntries: 'id', estimated1RMs: 'id', liftStates: 'exercise_id',
  userProfile: 'id', readinessLogs: 'id',
};

const VALID_TABLES = new Set(Object.keys(PG_TABLE_NAMES));

export async function POST(request: NextRequest) {
  if (!isSyncAuthorized(request.headers.get('authorization'), process.env.SYNC_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { table, rows } = await request.json() as {
      table: string;
      rows: Record<string, unknown>[];
    };

    if (!VALID_TABLES.has(table)) {
      return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
    }

    if (!rows?.length) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const pgTableName = PG_TABLE_NAMES[table];
    const pk = PK_COLUMNS[table];
    const allowedColumns = SYNC_ALLOWED_COLUMNS[table as SyncTableName];

    // Column names are interpolated into the SQL below, so every one must be a
    // known schema column. Validate all rows before writing any of them.
    const mappedRows = rows.map((row) => toPostgresRow(table as SyncTableName, row));
    for (const mapped of mappedRows) {
      if (findUnknownColumns(Object.keys(mapped), allowedColumns).length > 0) {
        return NextResponse.json(
          { error: `Unknown column in rows for table: ${table}` },
          { status: 400 }
        );
      }
    }

    for (const mapped of mappedRows) {
      const columns = Object.keys(mapped);
      const values = Object.values(mapped);

      const colList = columns.map(c => `"${c}"`).join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const updateSet = columns
        .filter(c => c !== 'client_id' && c !== pk)
        .map(c => `"${c}" = EXCLUDED."${c}"`)
        .join(', ');

      await neonSql.query(
        `INSERT INTO "${pgTableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("client_id") DO UPDATE SET ${updateSet}`,
        values
      );
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch (error) {
    console.error('Sync push error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
