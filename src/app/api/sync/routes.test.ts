// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { PullResponse, PushResponse } from '@/lib/sync/wire';
import { SYNC_REGISTRY } from '@/lib/sync/registry';

const query = vi.fn();
vi.mock('@/db/drizzle', () => ({ neonSql: { query: (...args: unknown[]) => query(...args) } }));

import { POST } from './push/route';
import { GET } from './pull/route';

const SECRET = 'test-sync-secret';
const AUTH = { authorization: `Bearer ${SECRET}` };

function pushRequest(body: unknown, headers: Record<string, string> = AUTH) {
  return new NextRequest('http://localhost/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function pullRequest(headers: Record<string, string> = AUTH) {
  return new NextRequest('http://localhost/api/sync/pull', { headers });
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

  it('500 with the database message when a write fails', async () => {
    query.mockRejectedValueOnce(new Error('relation "runs" does not exist'));
    const res = await POST(pushRequest({ table: 'runs', rows: [run('r1', 1)] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('relation "runs" does not exist');
  });
});

describe('GET /api/sync/pull', () => {
  it('401 without the right passphrase', async () => {
    expect((await GET(pullRequest({}))).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns every registry table with client field names and numeric stamps', async () => {
    query.mockImplementation(async (text: string) => {
      if (text === 'SELECT * FROM "workouts"') {
        return [{
          id: 'w1', client_id: 'w1', template_id: 'A1', updated_at: '1763000000000',
          deleted_at: '1763000000500', external_id: null, completion_context: { phaseMode: 'cutting' },
          ended_early: false, synced: true,
        }];
      }
      return [];
    });
    const before = Date.now();
    const res = await GET(pullRequest());
    expect(res.status).toBe(200);
    const body: PullResponse = await res.json();

    expect(Object.keys(body.rows).sort()).toEqual(SYNC_REGISTRY.map((d) => d.name).sort());
    expect(body.errors).toEqual({});
    expect(body.serverTime).toBeGreaterThanOrEqual(before);
    expect(body.rows.workouts).toEqual([{
      id: 'w1', clientId: 'w1', templateId: 'A1', updatedAt: 1763000000000, deletedAt: 1763000000500,
      externalId: null, completionContext: { phaseMode: 'cutting' }, endedEarly: false, synced: true,
    }]);
    // Soft-deleted rows are included: no WHERE on deleted_at.
    for (const [text] of query.mock.calls) expect(text).not.toMatch(/WHERE/);
  });

  it('a table that cannot be read goes into errors; the rest still arrive with 200', async () => {
    query.mockImplementation(async (text: string) => {
      if (text.includes('"lift_adjustments"')) throw new Error('relation "lift_adjustments" does not exist');
      if (text.includes('"runs"')) return [{ id: 'r1', client_id: 'r1', updated_at: '7', deleted_at: null }];
      return [];
    });
    const res = await GET(pullRequest());
    expect(res.status).toBe(200);
    const body: PullResponse = await res.json();
    expect(body.errors).toEqual({ liftAdjustments: 'relation "lift_adjustments" does not exist' });
    expect(body.rows.liftAdjustments).toBeUndefined();
    expect(body.rows.runs).toEqual([{ id: 'r1', clientId: 'r1', updatedAt: 7, deletedAt: null }]);
    expect(Object.keys(body.rows)).toHaveLength(SYNC_REGISTRY.length - 1);
  });
});
