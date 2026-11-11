import { NextRequest, NextResponse } from 'next/server';
import { neonSql } from '@/db/drizzle';
import {
  isSyncAuthorized,
  findUnknownColumns,
  SYNC_ALLOWED_COLUMNS,
  type SyncTableName,
} from '@/lib/syncGuard';

// Map camelCase client keys to snake_case Postgres column names per table
const COLUMN_MAPS: Record<string, Record<string, string>> = {
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

function toSnakeCase(tableName: string, row: Record<string, unknown>): Record<string, unknown> {
  const map = COLUMN_MAPS[tableName] || {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[map[key] || key] = value;
  }
  result.synced = true;
  return result;
}

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
    const mappedRows = rows.map((row) => toSnakeCase(table, row));
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
