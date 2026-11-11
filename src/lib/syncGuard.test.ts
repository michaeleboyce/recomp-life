// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  isSyncAuthorized,
  findUnknownColumns,
  SYNC_ALLOWED_COLUMNS,
} from './syncGuard';

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
