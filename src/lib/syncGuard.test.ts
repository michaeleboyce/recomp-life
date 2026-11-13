// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import {
  isSyncAuthorized,
  isSyncTableName,
  getSyncTableInfo,
  drizzleTableFor,
  findUnknownFields,
  toPostgresRow,
  prepareBatch,
  buildUpsert,
  buildSelectAll,
  fromPostgresRow,
} from './syncGuard';
import * as schema from '@/db/schema';
import { SYNC_REGISTRY, PROFILE_ID } from '@/lib/sync/registry';
import { MAX_CLOCK_SKEW_MS } from '@/lib/sync/wire';
import { DEFAULT_USER_PROFILE } from '@/db/seed';

const NOW = 1_763_000_000_000;

describe('isSyncAuthorized', () => {
  it('accepts a matching bearer token', () => {
    expect(isSyncAuthorized('Bearer hunter2-long-passphrase', 'hunter2-long-passphrase')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isSyncAuthorized('Bearer nope', 'hunter2-long-passphrase')).toBe(false);
  });

  it('rejects a token that is a prefix of the secret', () => {
    expect(isSyncAuthorized('Bearer hunter2', 'hunter2-long-passphrase')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isSyncAuthorized(null, 'secret')).toBe(false);
    expect(isSyncAuthorized(undefined, 'secret')).toBe(false);
    expect(isSyncAuthorized('', 'secret')).toBe(false);
  });

  it('rejects a header without the Bearer scheme', () => {
    expect(isSyncAuthorized('secret', 'secret')).toBe(false);
    expect(isSyncAuthorized('Basic secret', 'secret')).toBe(false);
  });

  it('fails closed when no secret is configured on the server', () => {
    expect(isSyncAuthorized('Bearer anything', undefined)).toBe(false);
    expect(isSyncAuthorized('Bearer ', '')).toBe(false);
    expect(isSyncAuthorized('Bearer ', undefined)).toBe(false);
  });
});

describe('registry and Drizzle schema agree', () => {
  it('the schema has exactly one table per registry entry and nothing else', () => {
    const schemaNames = Object.values(schema).map((table) => getTableName(table)).sort();
    expect(schemaNames).toEqual(SYNC_REGISTRY.map((d) => d.pgName).sort());
  });

  it('old tables are gone: no sets, lift_states or estimated_1rms', () => {
    expect(drizzleTableFor('sets')).toBeUndefined();
    expect(drizzleTableFor('lift_states')).toBeUndefined();
    expect(drizzleTableFor('estimated_1rms')).toBeUndefined();
    expect(isSyncTableName('sets')).toBe(false);
    expect(isSyncTableName('liftStates')).toBe(false);
    expect(isSyncTableName('estimated1RMs')).toBe(false);
  });

  for (const def of SYNC_REGISTRY) {
    describe(def.name, () => {
      const table = drizzleTableFor(def.pgName)!;
      const columns = Object.values(getTableColumns(table));
      const columnNames = new Set(columns.map((c) => c.name));
      const info = getSyncTableInfo(def.name);

      it('every mapped column exists in the Drizzle table', () => {
        for (const column of Object.values(def.columns)) {
          expect(columnNames, `${def.name}.${column}`).toContain(column);
        }
      });

      it("the registry's jsonFields are exactly the table's jsonb columns", () => {
        const jsonColumns = columns.filter((c) => c.getSQLType() === 'jsonb').map((c) => c.name);
        const fromRegistry = def.jsonFields.map((field) => def.columns[field] ?? field);
        expect([...fromRegistry].sort()).toEqual(jsonColumns.sort());
      });

      it('every Drizzle column is reachable from a client field', () => {
        for (const name of columnNames) {
          const field = info.columnToField.get(name);
          expect(field, `${def.name}.${name}`).toBeDefined();
          expect(info.fieldToColumn.get(field!)).toBe(name);
        }
      });

      it('carries the sync stamps as epoch-ms bigints', () => {
        expect([...info.bigintColumns].sort()).toEqual(['deleted_at', 'updated_at']);
        for (const stamp of ['id', 'client_id', 'updated_at', 'deleted_at', 'external_id', 'synced']) {
          expect(columnNames).toContain(stamp);
        }
      });
    });
  }

  it('workouts gain ended_early, prescribed and completion_context; efforts are optional', () => {
    const workouts = getTableColumns(schema.workouts);
    expect(workouts.endedEarly.notNull).toBe(false);
    expect(workouts.prescribed.getSQLType()).toBe('jsonb');
    expect(workouts.completionContext.getSQLType()).toBe('jsonb');
    expect(getTableColumns(schema.runs).perceivedEffort.notNull).toBe(false);
    expect(getTableColumns(schema.activities).perceivedEffort.notNull).toBe(false);
  });
});

describe('isSyncTableName', () => {
  it('accepts registry names only', () => {
    for (const def of SYNC_REGISTRY) expect(isSyncTableName(def.name)).toBe(true);
    expect(isSyncTableName('pain_entries')).toBe(false); // Postgres name, not the client one
    expect(isSyncTableName('constructor')).toBe(false);
    expect(isSyncTableName(undefined)).toBe(false);
    expect(isSyncTableName(42)).toBe(false);
  });
});

describe('toPostgresRow', () => {
  const workout = {
    id: 'w1', clientId: 'c1', templateId: 'A1', location: 'gym',
    startedAt: '2026-11-11T10:00:00.000Z', completedAt: null, totalDurationSeconds: 0,
    includeWarmUps: true, selectedAccessories: ['face_pull'],
    sets: [{ id: 's1', weight: 190 }], preWorkoutPainEntries: [], modifications: [],
    endedEarly: true, prescribed: [{ exerciseId: 'squat', tier: 'T1', weight: 185, sets: 5, reps: 3 }],
    completionContext: null, updatedAt: NOW - 1000, deletedAt: null, synced: false,
  };

  it('maps fields to columns via the registry and marks the row synced', () => {
    const row = toPostgresRow('workouts', workout, NOW);
    expect(row.client_id).toBe('c1');
    expect(row.total_duration_seconds).toBe(0);
    expect(row.ended_early).toBe(true);
    expect(row.updated_at).toBe(NOW - 1000);
    expect(row.deleted_at).toBeNull();
    expect(row.synced).toBe(true);
    expect('clientId' in row).toBe(false);
  });

  it('serialises JSON fields itself, so arrays are not sent as Postgres arrays; null stays null', () => {
    const row = toPostgresRow('workouts', workout, NOW);
    expect(row.sets).toBe('[{"id":"s1","weight":190}]');
    expect(row.selected_accessories).toBe('["face_pull"]');
    expect(row.modifications).toBe('[]');
    expect(row.prescribed).toBe('[{"exerciseId":"squat","tier":"T1","weight":185,"sets":5,"reps":3}]');
    expect(row.completion_context).toBeNull();
    expect(row.completed_at).toBeNull();
  });

  it('drops undefined fields but keeps nulls (a cleared field clears the server too)', () => {
    const row = toPostgresRow('painEntries', { id: 'p1', clientId: 'p1', notes: undefined, associatedWorkoutId: null }, NOW);
    expect('notes' in row).toBe(false);
    expect(row.associated_workout_id).toBeNull();
  });

  it('defaults a missing updatedAt to the server clock', () => {
    expect(toPostgresRow('runs', { id: 'r1', clientId: 'r1' }, NOW).updated_at).toBe(NOW);
    expect(toPostgresRow('runs', { id: 'r1', clientId: 'r1', updatedAt: null }, NOW).updated_at).toBe(NOW);
  });

  it('clamps a stamp more than MAX_CLOCK_SKEW_MS ahead to the server clock', () => {
    const atLimit = toPostgresRow('runs', { id: 'r1', clientId: 'r1', updatedAt: NOW + MAX_CLOCK_SKEW_MS }, NOW);
    expect(atLimit.updated_at).toBe(NOW + MAX_CLOCK_SKEW_MS);
    const ahead = toPostgresRow('runs', { id: 'r1', clientId: 'r1', updatedAt: NOW + MAX_CLOCK_SKEW_MS + 1 }, NOW);
    expect(ahead.updated_at).toBe(NOW);
  });

  it('forces the fixed id and client id on the single profile row', () => {
    const row = toPostgresRow('userProfile', {
      ...DEFAULT_USER_PROFILE, id: 'device-a-profile', clientId: 'device-a-profile',
      createdAt: '2026-11-11T10:00:00.000Z',
    }, NOW);
    expect(row.id).toBe(PROFILE_ID);
    expect(row.client_id).toBe(PROFILE_ID);
    expect(typeof row.settings).toBe('string');
    expect(findUnknownFields('userProfile', { ...DEFAULT_USER_PROFILE, id: 'x', clientId: 'x' })).toEqual([]);
  });

  it('a lift adjustment maps onto its columns with set as JSON', () => {
    const row = toPostgresRow('liftAdjustments', {
      id: 'la1', clientId: 'la1', exerciseId: 'squat', at: '2026-11-11T10:00:00.000Z',
      source: 'start', set: { t1Weight: 135 }, note: null, updatedAt: NOW, deletedAt: null, externalId: null,
    }, NOW);
    expect(row).toEqual({
      id: 'la1', client_id: 'la1', exercise_id: 'squat', at: '2026-11-11T10:00:00.000Z',
      source: 'start', set: '{"t1Weight":135}', note: null, updated_at: NOW, deleted_at: null,
      external_id: null, synced: true,
    });
  });

  it('an activity or run without an effort rating maps cleanly', () => {
    const row = toPostgresRow('activities', {
      id: 'a1', clientId: 'a1', date: '2026-11-11T10:00:00.000Z', kind: 'walking',
      durationMinutes: 45, style: null, distanceMiles: 2, notes: '', perceivedEffort: null,
      externalId: 'hk-123',
    }, NOW);
    expect(row.perceived_effort).toBeNull();
    expect(row.external_id).toBe('hk-123');
  });
});

describe('prepareBatch (unknown tables and columns refuse the whole batch)', () => {
  const good = { id: 'b1', clientId: 'b1', date: '2026-11-11T07:00:00.000Z', weight: 226, timeOfDay: 'morning' };

  it('maps every row of a valid batch', () => {
    const batch = prepareBatch('bodyweight', [good, { ...good, id: 'b2', clientId: 'b2' }], NOW);
    expect(batch.ok).toBe(true);
    if (batch.ok) expect(batch.rows.map((r) => r.client_id)).toEqual(['b1', 'b2']);
  });

  it('refuses an unknown table, including old ones that no longer sync', () => {
    for (const table of ['sets', 'liftStates', 'estimated1RMs', 'nope', undefined, '__proto__']) {
      const batch = prepareBatch(table, [good], NOW);
      expect(batch.ok).toBe(false);
      if (!batch.ok) expect(batch.error).toMatch(/Unknown table/);
    }
  });

  it('refuses the whole batch when any row has an unknown column', () => {
    const batch = prepareBatch('bodyweight', [good, { ...good, mood: 'great' }], NOW);
    expect(batch).toEqual({ ok: false, error: 'Unknown column in rows for table: bodyweight' });
  });

  it('flags an injection attempt in a column name', () => {
    const evil = 'id") VALUES ($1); DROP TABLE workouts; --';
    expect(findUnknownFields('workouts', { id: 'w1', [evil]: 1 })).toEqual([evil]);
    expect(prepareBatch('workouts', [{ id: 'w1', clientId: 'c1', [evil]: 1 }], NOW).ok).toBe(false);
  });

  it('refuses a raw column name that a registry field maps to (only client names travel)', () => {
    expect(findUnknownFields('bodyweight', { ...good, time_of_day: 'evening' })).toEqual(['time_of_day']);
  });

  it('refuses rows that are not an array of objects', () => {
    expect(prepareBatch('bodyweight', 'rows', NOW).ok).toBe(false);
    expect(prepareBatch('bodyweight', [null], NOW).ok).toBe(false);
    expect(prepareBatch('bodyweight', [[1, 2]], NOW).ok).toBe(false);
  });

  it('accepts an empty batch', () => {
    expect(prepareBatch('runs', [], NOW)).toEqual({ ok: true, rows: [] });
  });
});

describe('buildUpsert', () => {
  it('builds a parameterised last-write-wins upsert keyed on client_id', () => {
    const row = toPostgresRow('bodyweight', {
      id: 'b1', clientId: 'c1', date: '2026-11-11T07:00:00.000Z', weight: 226,
      timeOfDay: 'morning', updatedAt: NOW, deletedAt: null, synced: false,
    }, NOW);
    expect(buildUpsert('bodyweight', row)).toEqual({
      text:
        'INSERT INTO "bodyweight" ("id", "client_id", "date", "weight", "time_of_day", "updated_at", "deleted_at", "synced") ' +
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ' +
        'ON CONFLICT ("client_id") DO UPDATE SET ' +
        '"date" = EXCLUDED."date", "weight" = EXCLUDED."weight", ' +
        '"time_of_day" = EXCLUDED."time_of_day", "updated_at" = EXCLUDED."updated_at", ' +
        '"deleted_at" = EXCLUDED."deleted_at", "synced" = EXCLUDED."synced" ' +
        'WHERE COALESCE(EXCLUDED."updated_at", 0) >= COALESCE("bodyweight"."updated_at", 0) ' +
        'RETURNING "client_id"',
      values: ['b1', 'c1', '2026-11-11T07:00:00.000Z', 226, 'morning', NOW, null, true],
    });
  });

  it('uses the Postgres table name, not the client one, in the insert and the stamp guard', () => {
    const { text } = buildUpsert('painEntries', toPostgresRow('painEntries', { id: 'p1', clientId: 'c1' }, NOW));
    expect(text.startsWith('INSERT INTO "pain_entries" (')).toBe(true);
    expect(text).toContain('COALESCE("pain_entries"."updated_at", 0)');
  });

  it('never rewrites id or client_id of an existing row', () => {
    const { text } = buildUpsert('runs', toPostgresRow('runs', { id: 'r1', clientId: 'c1', notes: 'x' }, NOW));
    const updates = text.split(' DO UPDATE SET ')[1];
    expect(updates).not.toContain('"id" =');
    expect(updates).not.toContain('"client_id" =');
  });

  it('never puts a value into the SQL text', () => {
    const row = toPostgresRow('runs', { id: "r1'; DROP TABLE runs; --", clientId: 'c1', notes: '"x"' }, NOW);
    const { text, values } = buildUpsert('runs', row);
    expect(text).not.toContain('DROP');
    expect(values).toContain("r1'; DROP TABLE runs; --");
    expect(text.match(/\$\d+/g)).toHaveLength(values.length);
  });

  it('refuses a column that is not in the schema, since names are interpolated', () => {
    expect(() => buildUpsert('runs', { id: 'r1', client_id: 'c1', 'id") --': 1 })).toThrow(/Unknown column/);
    // toPostgresRow passes unknown fields through, so the check must happen at build time too.
    const row = toPostgresRow('runs', { id: 'r1', clientId: 'c1', 'x" = 1; --': 1 }, NOW);
    expect(() => buildUpsert('runs', row)).toThrow(/Unknown column/);
  });

  it('refuses a table that is not in the registry', () => {
    expect(() => buildUpsert('liftStates', { id: 'x' })).toThrow(/Unknown sync table/);
  });

  it('does nothing on conflict when there is no column left to update', () => {
    expect(buildUpsert('runs', { id: 'r1', client_id: 'c1' }).text).toBe(
      'INSERT INTO "runs" ("id", "client_id") VALUES ($1, $2) ON CONFLICT ("client_id") DO NOTHING RETURNING "client_id"'
    );
  });
});

describe('fromPostgresRow', () => {
  it('maps columns back to client fields and bigint stamps (strings) to numbers', () => {
    const wire = fromPostgresRow('workouts', {
      id: 'w1', client_id: 'c1', template_id: 'A1', updated_at: '1763000000000', deleted_at: null,
      external_id: null, ended_early: false, completion_context: { phaseMode: 'cutting' },
      prescribed: [], sets: [], synced: true,
    });
    expect(wire).toEqual({
      id: 'w1', clientId: 'c1', templateId: 'A1', updatedAt: 1763000000000, deletedAt: null,
      externalId: null, endedEarly: false, completionContext: { phaseMode: 'cutting' },
      prescribed: [], sets: [], synced: true,
    });
  });

  it('converts a set deleted_at to a number', () => {
    expect(fromPostgresRow('runs', { deleted_at: '1763000000123' }).deletedAt).toBe(1763000000123);
  });

  it('round-trips every registry field name', () => {
    for (const def of SYNC_REGISTRY) {
      const info = getSyncTableInfo(def.name);
      for (const [field, column] of info.fieldToColumn) {
        expect(Object.keys(fromPostgresRow(def.name, { [column]: 'v' }))).toEqual([field]);
      }
    }
  });
});

describe('buildSelectAll', () => {
  it('reads every row, soft-deleted included, from the Postgres table', () => {
    expect(buildSelectAll('readinessLogs')).toBe('SELECT * FROM "readiness_logs"');
  });
});
