// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  isSyncAuthorized,
  findUnknownColumns,
  toPostgresRow,
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
  it('covers all nine synced tables', () => {
    expect(Object.keys(SYNC_ALLOWED_COLUMNS).sort()).toEqual(
      [
        'bodyweight', 'estimated1RMs', 'liftStates', 'painEntries',
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
