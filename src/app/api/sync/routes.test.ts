// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  MAX_PUSH_ROWS,
  PULL_PAGE_BYTES,
  PULL_PAGE_ROWS,
  PULL_SINCE_OVERLAP_MS,
  decodePullCursor,
  encodePullCursor,
  type PullPageResponse,
  type PushResponse,
} from '@/lib/sync/wire';
import { SYNC_REGISTRY } from '@/lib/sync/registry';

const query = vi.fn();
vi.mock('@/db/drizzle', () => ({ neonSql: { query: (...args: unknown[]) => query(...args) } }));

import { POST, maxDuration as pushMaxDuration } from './push/route';
import { GET, maxDuration as pullMaxDuration } from './pull/route';
import { GET as STATUS } from './status/route';
import { PUSH_FAILED_MESSAGE, READ_FAILED_REASON } from './respond';

// At least MIN_SECRET_LENGTH characters, so the short-secret warning stays out of these tests.
const SECRET = 'test-sync-secret-long-enough';
const AUTH = { authorization: `Bearer ${SECRET}` };

function pushRequest(body: unknown, headers: Record<string, string> = AUTH) {
  return new NextRequest('http://localhost/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function pullRequest(headers: Record<string, string> = AUTH, query = 'table=runs') {
  return new NextRequest(`http://localhost/api/sync/pull?${query}`, { headers });
}

const run = (id: string, updatedAt: number) => ({
  id, clientId: id, date: '2026-11-11T07:00:00.000Z', durationMinutes: 30, distanceMiles: 3,
  type: 'outdoor', category: 'easy', notes: '', perceivedEffort: 3, updatedAt, deletedAt: null,
});

beforeEach(() => {
  vi.stubEnv('SYNC_SECRET', SECRET);
  query.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/sync/push', () => {
  it('401 without the right passphrase, and nothing is written', async () => {
    expect((await POST(pushRequest({ table: 'runs', rows: [] }, {}))).status).toBe(401);
    expect((await POST(pushRequest({ table: 'runs', rows: [] }, { authorization: 'Bearer wrong' }))).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('401 when the server has no secret configured', async () => {
    vi.stubEnv('SYNC_SECRET', '');
    expect((await POST(pushRequest({ table: 'runs', rows: [] }))).status).toBe(401);
  });

  it('400 for an unknown table, including tables that no longer sync', async () => {
    for (const table of ['nope', 'sets', 'liftStates', 'estimated1RMs']) {
      const res = await POST(pushRequest({ table, rows: [run('r1', 1)] }));
      expect(res.status, table).toBe(400);
      expect((await res.json()).error).toMatch(/Unknown table/);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('400 for an unknown column anywhere in the batch, before any row is written', async () => {
    const res = await POST(pushRequest({
      table: 'runs',
      rows: [run('r1', 1), { ...run('r2', 1), 'id") VALUES (1); DROP TABLE runs; --': 1 }],
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Unknown column in rows for table: runs');
    expect(query).not.toHaveBeenCalled();
  });

  it('400 for a body that is not JSON', async () => {
    expect((await POST(pushRequest('{not json'))).status).toBe(400);
  });

  it('counts applied rows (a row returned) and skipped rows (server already newer)', async () => {
    query
      .mockResolvedValueOnce([{ client_id: 'r1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ client_id: 'r3' }]);
    const res = await POST(pushRequest({ table: 'runs', rows: [run('r1', 1), run('r2', 2), run('r3', 3)] }));
    expect(res.status).toBe(200);
    const body: PushResponse = await res.json();
    expect(body).toEqual({ success: true, applied: 2, skipped: 1 });

    expect(query).toHaveBeenCalledTimes(3);
    const [text, values] = query.mock.calls[0];
    expect(text).toMatch(/^INSERT INTO "runs" /);
    expect(text).toContain('WHERE COALESCE(EXCLUDED."updated_at", 0) >= COALESCE("runs"."updated_at", 0)');
    expect(text).toMatch(/RETURNING "client_id"$/);
    expect(values).toContain('r1');
  });

  it(`accepts a batch of exactly ${MAX_PUSH_ROWS} rows`, async () => {
    expect(MAX_PUSH_ROWS).toBe(500);
    query.mockResolvedValue([{ client_id: 'x' }]);
    const rows = Array.from({ length: MAX_PUSH_ROWS }, (_, i) => run(`r${i}`, 1));
    const res = await POST(pushRequest({ table: 'runs', rows }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, applied: MAX_PUSH_ROWS, skipped: 0 });
  });

  it('413 for a batch over the limit, with a clear message, and nothing is written', async () => {
    const rows = Array.from({ length: MAX_PUSH_ROWS + 1 }, (_, i) => run(`r${i}`, 1));
    const res = await POST(pushRequest({ table: 'runs', rows }));
    expect(res.status).toBe(413);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.code).toBe('push_too_large');
    expect(body.error).toBe(`Too many rows in one push: 501. Send at most 500 rows per request.`);
    expect(query).not.toHaveBeenCalled();
  });

  it('the limit is checked after the passphrase', async () => {
    const rows = Array.from({ length: MAX_PUSH_ROWS + 1 }, (_, i) => run(`r${i}`, 1));
    expect((await POST(pushRequest({ table: 'runs', rows }, {}))).status).toBe(401);
  });

  it('an empty batch writes nothing', async () => {
    const res = await POST(pushRequest({ table: 'bodyweight', rows: [] }));
    expect(await res.json()).toEqual({ success: true, applied: 0, skipped: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it('the profile is always written under the fixed id', async () => {
    query.mockResolvedValueOnce([{ client_id: 'profile' }]);
    await POST(pushRequest({
      table: 'userProfile',
      rows: [{ id: 'local-uuid', clientId: 'local-uuid', name: 'M', bodyweight: 220, heightInches: 70,
        createdAt: '2026-11-11T07:00:00.000Z', settings: { phase: 'cutting' }, updatedAt: 5 }],
    }));
    const [text, values] = query.mock.calls[0];
    expect(text).toMatch(/^INSERT INTO "user_profile" \("id", "client_id",/);
    expect(values.slice(0, 2)).toEqual(['profile', 'profile']);
    expect(values).not.toContain('local-uuid');
  });

  it('500 with a generic message and code when a write fails; the database error only in the log', async () => {
    const dbError = new Error('relation "runs" does not exist');
    query.mockRejectedValueOnce(dbError);
    const res = await POST(pushRequest({ table: 'runs', rows: [run('r1', 1)] }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: PUSH_FAILED_MESSAGE, code: 'push_failed' });
    expect(text).not.toMatch(/relation|does not exist/);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), dbError);
  });

  it('a driver error that is not an Error is not returned either', async () => {
    query.mockRejectedValueOnce({ message: 'password authentication failed for user "neondb"' });
    const res = await POST(pushRequest({ table: 'runs', rows: [run('r1', 1)] }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/password|neondb/);
  });
});

describe('GET /api/sync/pull', () => {
  it('401 without the right passphrase', async () => {
    expect((await GET(pullRequest({}))).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 for a missing or unknown table, a bad since or a bad cursor, before any read', async () => {
    for (const q of ['', 'table=nope', 'table=sets', 'table=runs&since=-1', 'table=runs&since=abc', 'table=runs&cursor=x']) {
      const res = await GET(pullRequest(AUTH, q));
      expect(res.status, q).toBe(400);
      expect(res.headers.get('cache-control'), q).toBe('no-store');
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('returns one page of the table with client field names and numeric stamps', async () => {
    query.mockResolvedValueOnce([{
      id: 'w1', client_id: 'w1', template_id: 'A1', updated_at: '1763000000000',
      deleted_at: '1763000000500', external_id: null, completion_context: { phaseMode: 'cutting' },
      ended_early: false, synced: true, server_updated_at: '1763000000900',
    }]);
    const before = Date.now();
    const res = await GET(pullRequest(AUTH, 'table=workouts'));
    expect(res.status).toBe(200);
    const body: PullPageResponse = await res.json();

    expect(body.table).toBe('workouts');
    expect(body.nextCursor).toBeNull();
    expect(body.serverTime).toBeGreaterThanOrEqual(before);
    expect(body.rows).toEqual([{
      id: 'w1', clientId: 'w1', templateId: 'A1', updatedAt: 1763000000000, deletedAt: 1763000000500,
      externalId: null, completionContext: { phaseMode: 'cutting' }, endedEarly: false, synced: true,
    }]);
    // Soft-deleted rows are included: no filter on deleted_at.
    const [text, values] = query.mock.calls[0];
    expect(text).toBe(`SELECT * FROM "workouts" ORDER BY "server_updated_at", "client_id" LIMIT ${PULL_PAGE_ROWS}`);
    expect(values).toEqual([]);
  });

  it('passes since and the cursor to the query as parameters', async () => {
    query.mockResolvedValue([]);
    const cursor = encodePullCursor({ stamp: 42, clientId: 'c-9' });
    await GET(pullRequest(AUTH, `table=runs&since=40&cursor=${encodeURIComponent(cursor)}`));
    const [text, values] = query.mock.calls[0];
    expect(text).toContain('WHERE "server_updated_at" >= $1::bigint AND ("server_updated_at", "client_id") > ($2::bigint, $3::text)');
    expect(values).toEqual([40, 42, 'c-9']);
  });

  it('a full page names its last row as the next cursor', async () => {
    query.mockResolvedValueOnce(
      Array.from({ length: PULL_PAGE_ROWS }, (_, i) => ({
        id: `r${i}`, client_id: `r${String(i).padStart(4, '0')}`, updated_at: '1', server_updated_at: String(100 + i),
      }))
    );
    const body: PullPageResponse = await (await GET(pullRequest())).json();
    expect(body.rows).toHaveLength(PULL_PAGE_ROWS);
    expect(decodePullCursor(body.nextCursor)).toEqual({ stamp: 100 + PULL_PAGE_ROWS - 1, clientId: `r0${PULL_PAGE_ROWS - 1}` });
  });

  it('keeps a page of large rows under the byte budget, far below the 4.5 MB response limit', async () => {
    const notes = 'n'.repeat(10_000);
    query.mockResolvedValueOnce(
      Array.from({ length: PULL_PAGE_ROWS }, (_, i) => ({
        id: `r${i}`, client_id: `r${String(i).padStart(4, '0')}`, updated_at: '1', server_updated_at: '7', notes,
      }))
    );
    const res = await GET(pullRequest());
    const text = await res.text();
    const body: PullPageResponse = JSON.parse(text);
    expect(body.rows.length).toBeLessThan(PULL_PAGE_ROWS);
    expect(Buffer.byteLength(text)).toBeLessThan(PULL_PAGE_BYTES + 20_000);
    expect(Buffer.byteLength(text)).toBeLessThan(4_500_000);
    expect(decodePullCursor(body.nextCursor)?.clientId).toBe(body.rows[body.rows.length - 1].clientId);
  });

  it('a pushed date comes back from pull as the same instant', async () => {
    const iso = '2026-11-11T07:30:15.250Z';
    // Push: the ISO string with Z is sent to the timestamptz column unchanged.
    query.mockResolvedValueOnce([{ client_id: 'r1' }]);
    await POST(pushRequest({ table: 'runs', rows: [{ ...run('r1', 1), date: iso }] }));
    const [text, values] = query.mock.calls[0];
    const columns = [...(text as string).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).slice(1);
    expect(values[columns.indexOf('date')]).toBe(iso);

    // Pull: the driver parses timestamptz into a Date; the response carries the same instant.
    query.mockReset();
    query.mockResolvedValueOnce([{ id: 'r1', client_id: 'r1', date: new Date(iso), updated_at: '1', deleted_at: null }]);
    const body: PullPageResponse = await (await GET(pullRequest())).json();
    const pulled = body.rows[0].date as string;
    expect(pulled).toBe(iso);
    expect(new Date(pulled).getTime()).toBe(Date.parse(iso));
  });

  it('a table that cannot be read answers 500 with a generic reason; the database error only in the log', async () => {
    const dbError = new Error('relation "lift_adjustments" does not exist');
    query.mockRejectedValueOnce(dbError);
    const res = await GET(pullRequest(AUTH, 'table=liftAdjustments'));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: READ_FAILED_REASON, code: 'read_failed' });
    expect(READ_FAILED_REASON).toContain('read_failed');
    expect(text).not.toMatch(/relation|does not exist/);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('liftAdjustments'), dbError);
  });

  it('every registry table can be pulled by its client name', async () => {
    query.mockResolvedValue([]);
    for (const { name, pgName } of SYNC_REGISTRY) {
      const res = await GET(pullRequest(AUTH, `table=${name}`));
      expect(res.status, name).toBe(200);
      expect(query.mock.calls.at(-1)?.[0], name).toContain(`FROM "${pgName}"`);
    }
  });
});

describe('route time limits', () => {
  it('push and pull may run a minute: a 500-row batch is one upsert per row', () => {
    expect(pushMaxDuration).toBe(60);
    expect(pullMaxDuration).toBe(60);
  });

  it("the next pull's overlap covers a push that runs its whole time limit", () => {
    expect(PULL_SINCE_OVERLAP_MS).toBeGreaterThan(pushMaxDuration * 1000);
  });
});

describe('no sync response is cached', () => {
  const noStore = (res: Response, label: string) =>
    expect(res.headers.get('cache-control'), label).toBe('no-store');

  it('push: refused, invalid, failed and accepted', async () => {
    noStore(await POST(pushRequest({ table: 'runs', rows: [] }, {})), '401');
    noStore(await POST(pushRequest('{not json')), '400 json');
    noStore(await POST(pushRequest({ table: 'nope', rows: [] })), '400 table');
    query.mockRejectedValueOnce(new Error('boom'));
    noStore(await POST(pushRequest({ table: 'runs', rows: [run('r1', 1)] })), '500');
    query.mockResolvedValueOnce([{ client_id: 'r1' }]);
    noStore(await POST(pushRequest({ table: 'runs', rows: [run('r1', 1)] })), '200');
  });

  it('pull: refused, invalid, failed and accepted', async () => {
    noStore(await GET(pullRequest({})), '401');
    noStore(await GET(pullRequest(AUTH, 'table=nope')), '400');
    query.mockRejectedValue(new Error('boom'));
    noStore(await GET(pullRequest()), '500');
    query.mockReset().mockResolvedValue([]);
    noStore(await GET(pullRequest()), '200');
  });

  it('status', async () => {
    noStore(await STATUS(), '200');
  });
});
