// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  isSyncAuthorized,
  findUnknownColumns,
  toPostgresRow,
  buildUpsert,
  SYNC_ALLOWED_COLUMNS,
  SYNC_JSON_COLUMNS,
} from './syncGuard';
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from '@/db/seed';

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

describe('SYNC_ALLOWED_COLUMNS', () => {
  it('covers all ten synced tables', () => {
    expect(Object.keys(SYNC_ALLOWED_COLUMNS).sort()).toEqual(
      [
        'activities', 'bodyweight', 'estimated1RMs', 'liftStates', 'painEntries',
        'readinessLogs', 'runs', 'sets', 'userProfile', 'workouts',
      ].sort()
    );
  });

  it('lists snake_case Postgres column names from the schema', () => {
    expect(SYNC_ALLOWED_COLUMNS.workouts.has('client_id')).toBe(true);
    expect(SYNC_ALLOWED_COLUMNS.workouts.has('total_duration_seconds')).toBe(true);
    expect(SYNC_ALLOWED_COLUMNS.liftStates.has('recent_amrap_reps')).toBe(true);
    expect(SYNC_ALLOWED_COLUMNS.workouts.has('clientId')).toBe(false);
  });
});

describe('findUnknownColumns', () => {
  it('returns nothing when every column is allowed', () => {
    expect(
      findUnknownColumns(['id', 'client_id', 'weight', 'synced'], SYNC_ALLOWED_COLUMNS.bodyweight)
    ).toEqual([]);
  });

  it('returns columns that are not in the schema', () => {
    expect(
      findUnknownColumns(['id', 'not_a_column'], SYNC_ALLOWED_COLUMNS.bodyweight)
    ).toEqual(['not_a_column']);
  });

  it('flags an injection attempt in a column name', () => {
    const evil = 'id") VALUES ($1); DROP TABLE workouts; --';
    expect(findUnknownColumns(['id', evil], SYNC_ALLOWED_COLUMNS.workouts)).toEqual([evil]);
  });
});

describe('toPostgresRow', () => {
  const workout = {
    id: 'w1', clientId: 'c1', templateId: 'A1', location: 'gym',
    startedAt: '2026-11-11T10:00:00.000Z', completedAt: null, totalDurationSeconds: 0,
    includeWarmUps: true, selectedAccessories: ['face_pull'],
    sets: [{ id: 's1', weight: 190 }], preWorkoutPainEntries: [], modifications: [],
    endedEarly: true, synced: false,
  };

  it('maps keys to snake_case columns and marks the row synced', () => {
    const row = toPostgresRow('workouts', workout);
    expect(row.client_id).toBe('c1');
    expect(row.total_duration_seconds).toBe(0);
    expect(row.synced).toBe(true);
    expect('clientId' in row).toBe(false);
  });

  it('serialises JSON columns itself, so arrays are not sent as Postgres arrays', () => {
    const row = toPostgresRow('workouts', workout);
    expect(row.sets).toBe('[{"id":"s1","weight":190}]');
    expect(row.selected_accessories).toBe('["face_pull"]');
    expect(row.modifications).toBe('[]');
    expect(row.completed_at).toBeNull();
  });

  it('drops fields that exist only on the device and have no column', () => {
    const row = toPostgresRow('workouts', workout);
    expect('endedEarly' in row).toBe(false);
    expect(findUnknownColumns(Object.keys(row), SYNC_ALLOWED_COLUMNS.workouts)).toEqual([]);
  });

  it('still lets an unexpected field through to be rejected by the column check', () => {
    const row = toPostgresRow('workouts', { ...workout, 'id") --': 1 });
    expect(findUnknownColumns(Object.keys(row), SYNC_ALLOWED_COLUMNS.workouts)).toEqual(['id") --']);
  });

  it('knows which columns hold JSON', () => {
    expect(SYNC_JSON_COLUMNS.liftStates.has('recent_e1rms')).toBe(true);
    expect(SYNC_JSON_COLUMNS.userProfile.has('settings')).toBe(true);
    expect(SYNC_JSON_COLUMNS.sets.size).toBe(0);
  });

  it('the seeded profile and lift states map onto known columns only', () => {
    const profile = toPostgresRow('userProfile', {
      ...DEFAULT_USER_PROFILE, id: 'p1', clientId: 'p1', createdAt: '2026-11-11T10:00:00.000Z',
    });
    expect(findUnknownColumns(Object.keys(profile), SYNC_ALLOWED_COLUMNS.userProfile)).toEqual([]);
    expect(typeof profile.settings).toBe('string');
    for (const state of Object.values(INITIAL_LIFT_STATES)) {
      const row = toPostgresRow('liftStates', { ...state });
      expect(findUnknownColumns(Object.keys(row), SYNC_ALLOWED_COLUMNS.liftStates)).toEqual([]);
      expect(row.recent_e1rms).toBe('[]');
    }
  });
});

describe('activities', () => {
  it('a logged activity maps onto known columns only', () => {
    const row = toPostgresRow('activities', {
      id: 'a1', clientId: 'a1', date: '2026-11-11T10:00:00.000Z', kind: 'yoga',
      durationMinutes: 45, style: 'power', distanceMiles: null, notes: '',
      perceivedEffort: 4, synced: false,
    });
    expect(row.duration_minutes).toBe(45);
    expect(row.perceived_effort).toBe(4);
    expect(findUnknownColumns(Object.keys(row), SYNC_ALLOWED_COLUMNS.activities)).toEqual([]);
  });
});

describe('buildUpsert', () => {
  it('builds a parameterised upsert keyed on client_id', () => {
    const row = toPostgresRow('bodyweight', {
      id: 'b1', clientId: 'c1', date: '2026-11-11T07:00:00.000Z', weight: 226,
      timeOfDay: 'morning', synced: false,
    });
    expect(buildUpsert('bodyweight', row)).toEqual({
      text:
        'INSERT INTO "bodyweight" ("id", "client_id", "date", "weight", "time_of_day", "synced") ' +
        'VALUES ($1, $2, $3, $4, $5, $6) ' +
        'ON CONFLICT ("client_id") DO UPDATE SET ' +
        '"date" = EXCLUDED."date", "weight" = EXCLUDED."weight", ' +
        '"time_of_day" = EXCLUDED."time_of_day", "synced" = EXCLUDED."synced"',
      values: ['b1', 'c1', '2026-11-11T07:00:00.000Z', 226, 'morning', true],
    });
  });

  it('uses the Postgres table name, not the client one', () => {
    const pain = buildUpsert('painEntries', toPostgresRow('painEntries', { id: 'p1', clientId: 'c1' }));
    expect(pain.text.startsWith('INSERT INTO "pain_entries" (')).toBe(true);
    const e1rm = buildUpsert('estimated1RMs', toPostgresRow('estimated1RMs', { id: 'e1', clientId: 'c1' }));
    expect(e1rm.text.startsWith('INSERT INTO "estimated_1rms" (')).toBe(true);
  });

  it('never puts a value into the SQL text', () => {
    const row = toPostgresRow('runs', { id: "r1'; DROP TABLE runs; --", clientId: 'c1', notes: '"x"' });
    const { text, values } = buildUpsert('runs', row);
    expect(text).not.toContain('DROP');
    expect(values).toContain("r1'; DROP TABLE runs; --");
    expect(text.match(/\$\d+/g)).toHaveLength(values.length);
  });

  it('refuses a column that is not in the schema, since names are interpolated', () => {
    expect(() => buildUpsert('runs', { id: 'r1', client_id: 'c1', 'id") --': 1 })).toThrow(
      /Unknown column/
    );
  });

  it('does nothing on conflict when there is no column left to update', () => {
    expect(buildUpsert('runs', { id: 'r1', client_id: 'c1' }).text).toBe(
      'INSERT INTO "runs" ("id", "client_id") VALUES ($1, $2) ON CONFLICT ("client_id") DO NOTHING'
    );
  });

  it('lift states: never rewrites the primary key or the client id of an existing row', () => {
    // lift_states is keyed by exercise_id, and each device seeds its own rows with
    // fresh client ids. Conflicting on exercise_id (and taking the new client_id)
    // would let a freshly seeded device overwrite the stored progression with its
    // seed values, so the conflict target deliberately stays client_id for now.
    const row = toPostgresRow('liftStates', { ...INITIAL_LIFT_STATES.squat, clientId: 'device-b' });
    const { text, values } = buildUpsert('liftStates', row);
    expect(text).toContain('INSERT INTO "lift_states" (');
    expect(text).toContain('ON CONFLICT ("client_id") DO UPDATE SET ');
    const updates = text.split(' DO UPDATE SET ')[1];
    expect(updates).not.toContain('"exercise_id" =');
    expect(updates).not.toContain('"client_id" =');
    expect(updates).toContain('"t1_weight" = EXCLUDED."t1_weight"');
    expect(values).toContain('device-b');
  });
});
