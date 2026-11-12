// Server-only guards for the /api/sync routes. Do not import from client code.
import { createHash, timingSafeEqual } from 'crypto';
import { getTableColumns } from 'drizzle-orm';
import * as schema from '@/db/schema';

/**
 * Checks an `Authorization: Bearer <passphrase>` header against the server's
 * SYNC_SECRET. Fails closed: if no secret is configured, nothing is authorized.
 */
export function isSyncAuthorized(
  authHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const provided = authHeader.slice('Bearer '.length);
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

const SYNC_TABLES = {
  workouts: schema.workouts,
  sets: schema.sets,
  runs: schema.runs,
  activities: schema.activities,
  bodyweight: schema.bodyweight,
  painEntries: schema.painEntries,
  estimated1RMs: schema.estimated1RMs,
  liftStates: schema.liftStates,
  userProfile: schema.userProfile,
  readinessLogs: schema.readinessLogs,
} as const;

export type SyncTableName = keyof typeof SYNC_TABLES;

function columnNames(table: (typeof SYNC_TABLES)[SyncTableName]): ReadonlySet<string> {
  return new Set(Object.values(getTableColumns(table)).map((column) => column.name));
}

/** Postgres column names each synced table accepts, derived from the Drizzle schema. */
export const SYNC_ALLOWED_COLUMNS: Record<SyncTableName, ReadonlySet<string>> = {
  workouts: columnNames(SYNC_TABLES.workouts),
  sets: columnNames(SYNC_TABLES.sets),
  runs: columnNames(SYNC_TABLES.runs),
  activities: columnNames(SYNC_TABLES.activities),
  bodyweight: columnNames(SYNC_TABLES.bodyweight),
  painEntries: columnNames(SYNC_TABLES.painEntries),
  estimated1RMs: columnNames(SYNC_TABLES.estimated1RMs),
  liftStates: columnNames(SYNC_TABLES.liftStates),
  userProfile: columnNames(SYNC_TABLES.userProfile),
  readinessLogs: columnNames(SYNC_TABLES.readinessLogs),
};

/** Returns the columns that are not part of the table's schema. */
export function findUnknownColumns(
  columns: string[],
  allowed: ReadonlySet<string>
): string[] {
  return columns.filter((column) => !allowed.has(column));
}

function jsonColumnNames(table: (typeof SYNC_TABLES)[SyncTableName]): ReadonlySet<string> {
  return new Set(
    Object.values(getTableColumns(table))
      .filter((column) => column.columnType === 'PgJsonb')
      .map((column) => column.name)
  );
}

/** Postgres columns of each synced table that hold JSON. */
export const SYNC_JSON_COLUMNS: Record<SyncTableName, ReadonlySet<string>> = {
  workouts: jsonColumnNames(SYNC_TABLES.workouts),
  sets: jsonColumnNames(SYNC_TABLES.sets),
  runs: jsonColumnNames(SYNC_TABLES.runs),
  activities: jsonColumnNames(SYNC_TABLES.activities),
  bodyweight: jsonColumnNames(SYNC_TABLES.bodyweight),
  painEntries: jsonColumnNames(SYNC_TABLES.painEntries),
  estimated1RMs: jsonColumnNames(SYNC_TABLES.estimated1RMs),
  liftStates: jsonColumnNames(SYNC_TABLES.liftStates),
  userProfile: jsonColumnNames(SYNC_TABLES.userProfile),
  readinessLogs: jsonColumnNames(SYNC_TABLES.readinessLogs),
};

// Map camelCase client keys to snake_case Postgres column names per table
const COLUMN_MAPS: Record<SyncTableName, Record<string, string>> = {
  workouts: {
    clientId: 'client_id', templateId: 'template_id', startedAt: 'started_at',
    completedAt: 'completed_at', totalDurationSeconds: 'total_duration_seconds',
    includeWarmUps: 'include_warm_ups', selectedAccessories: 'selected_accessories',
    preWorkoutPainEntries: 'pre_workout_pain_entries',
  },
  sets: {
    clientId: 'client_id', exerciseId: 'exercise_id', setNumber: 'set_number',
    targetReps: 'target_reps', actualReps: 'actual_reps', isAMRAP: 'is_amrap',
    completedAt: 'completed_at', restAfterSeconds: 'rest_after_seconds',
    originalWeight: 'original_weight', isSubstituted: 'is_substituted',
    substituteExerciseId: 'substitute_exercise_id',
  },
  runs: {
    clientId: 'client_id', durationMinutes: 'duration_minutes',
    distanceMiles: 'distance_miles', perceivedEffort: 'perceived_effort',
  },
  activities: {
    clientId: 'client_id', durationMinutes: 'duration_minutes',
    distanceMiles: 'distance_miles', perceivedEffort: 'perceived_effort',
  },
  bodyweight: { clientId: 'client_id', timeOfDay: 'time_of_day' },
  painEntries: { clientId: 'client_id', associatedWorkoutId: 'associated_workout_id' },
  estimated1RMs: {
    clientId: 'client_id', exerciseId: 'exercise_id', workingWeight: 'working_weight',
    repsCompleted: 'reps_completed', estimated1RM: 'estimated_1rm',
    workoutSessionId: 'workout_session_id',
  },
  liftStates: {
    exerciseId: 'exercise_id', clientId: 'client_id', t1Weight: 't1_weight',
    t1Stage: 't1_stage', t1FailCount: 't1_fail_count', t2Weight: 't2_weight',
    t2Stage: 't2_stage', t2FailCount: 't2_fail_count', t3Weight: 't3_weight',
    t1LastResetWeight: 't1_last_reset_weight', t2LastResetWeight: 't2_last_reset_weight',
    t1LastWorkoutDate: 't1_last_workout_date', t2LastWorkoutDate: 't2_last_workout_date',
    deloadActive: 'deload_active', deloadSessionsRemaining: 'deload_sessions_remaining',
    preDeloadT1Weight: 'pre_deload_t1_weight', preDeloadT2Weight: 'pre_deload_t2_weight',
    t2LoadDropCount: 't2_load_drop_count', recentE1RMs: 'recent_e1rms',
    recentAvgRPEs: 'recent_avg_rpes', recentAMRAPReps: 'recent_amrap_reps',
  },
  userProfile: {
    clientId: 'client_id', heightInches: 'height_inches', createdAt: 'created_at',
  },
  readinessLogs: {
    clientId: 'client_id', sessionId: 'session_id', sleepHours: 'sleep_hours',
    stressLevel: 'stress_level',
  },
};

/**
 * Fields the app keeps on local rows that have no Postgres column yet. They are left
 * out of the upload instead of failing it; anything else unknown is still rejected.
 */
const DEVICE_ONLY_FIELDS: Partial<Record<SyncTableName, ReadonlySet<string>>> = {
  workouts: new Set(['endedEarly']),
};

/**
 * Turns a row as stored on the device into the column/value pairs to upsert:
 * camelCase keys become snake_case columns, device-only fields are dropped, JSON
 * columns are serialised here (the driver would send a JS array as a Postgres
 * array, which is not valid JSON), and the row is marked synced.
 */
export function toPostgresRow(
  table: SyncTableName,
  row: Record<string, unknown>
): Record<string, unknown> {
  const map = COLUMN_MAPS[table];
  const deviceOnly = DEVICE_ONLY_FIELDS[table];
  const jsonColumns = SYNC_JSON_COLUMNS[table];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (deviceOnly?.has(key)) continue;
    const column = map[key] || key;
    result[column] =
      jsonColumns.has(column) && value !== null && value !== undefined
        ? JSON.stringify(value)
        : value;
  }
  result.synced = true;
  return result;
}

/** Postgres table behind each synced table. */
export const SYNC_PG_TABLE_NAMES: Record<SyncTableName, string> = {
  workouts: 'workouts', sets: 'sets', runs: 'runs', activities: 'activities', bodyweight: 'bodyweight',
  painEntries: 'pain_entries', estimated1RMs: 'estimated_1rms',
  liftStates: 'lift_states', userProfile: 'user_profile', readinessLogs: 'readiness_logs',
};

/** Primary key column of each synced table. */
const PK_COLUMNS: Record<SyncTableName, string> = {
  workouts: 'id', sets: 'id', runs: 'id', activities: 'id', bodyweight: 'id',
  painEntries: 'id', estimated1RMs: 'id', liftStates: 'exercise_id',
  userProfile: 'id', readinessLogs: 'id',
};

export function isSyncTableName(table: string): table is SyncTableName {
  return Object.prototype.hasOwnProperty.call(SYNC_PG_TABLE_NAMES, table);
}

/**
 * The upsert for one row already mapped by `toPostgresRow`: insert, or on a
 * `client_id` conflict update every column except the primary key and `client_id`.
 * Values are passed as parameters; column names are interpolated, so a column that is
 * not in the table's schema throws.
 *
 * Every table conflicts on `client_id`, including `lift_states`, whose primary key is
 * `exercise_id`. A second device seeds its own lift states with new client ids, so its
 * first push of that table fails on the primary key. Conflicting on `exercise_id`
 * instead would let that freshly seeded device overwrite the stored progression with
 * seed values, so that is not done here.
 */
export function buildUpsert(
  table: SyncTableName,
  row: Record<string, unknown>
): { text: string; values: unknown[] } {
  const columns = Object.keys(row);
  const unknown = findUnknownColumns(columns, SYNC_ALLOWED_COLUMNS[table]);
  if (unknown.length > 0) {
    throw new Error(`Unknown column in rows for table: ${table}`);
  }

  const pk = PK_COLUMNS[table];
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = columns
    .filter((c) => c !== 'client_id' && c !== pk)
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const onConflict = updateSet ? `DO UPDATE SET ${updateSet}` : 'DO NOTHING';

  return {
    text: `INSERT INTO "${SYNC_PG_TABLE_NAMES[table]}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("client_id") ${onConflict}`,
    values: Object.values(row),
  };
}
