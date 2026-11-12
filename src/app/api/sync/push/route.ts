import { NextRequest, NextResponse } from 'next/server';
import { neonSql } from '@/db/drizzle';
import {
  isSyncAuthorized,
  isSyncTableName,
  findUnknownColumns,
  toPostgresRow,
  buildUpsert,
  SYNC_ALLOWED_COLUMNS,
} from '@/lib/syncGuard';

export async function POST(request: NextRequest) {
  if (!isSyncAuthorized(request.headers.get('authorization'), process.env.SYNC_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { table, rows } = await request.json() as {
      table: string;
      rows: Record<string, unknown>[];
    };

    if (!isSyncTableName(table)) {
      return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
    }

    if (!rows?.length) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const allowedColumns = SYNC_ALLOWED_COLUMNS[table];

    // Column names are interpolated into the SQL, so every one must be a known
    // schema column. Validate all rows before writing any of them.
    const mappedRows = rows.map((row) => toPostgresRow(table, row));
    for (const mapped of mappedRows) {
      if (findUnknownColumns(Object.keys(mapped), allowedColumns).length > 0) {
        return NextResponse.json(
          { error: `Unknown column in rows for table: ${table}` },
          { status: 400 }
        );
      }
    }

    for (const mapped of mappedRows) {
      const { text, values } = buildUpsert(table, mapped);
      await neonSql.query(text, values);
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
