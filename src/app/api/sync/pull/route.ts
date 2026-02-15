import { NextResponse } from 'next/server';
import { neonSql } from '@/db/drizzle';

const TABLES = [
  { name: 'workouts', pgName: 'workouts' },
  { name: 'sets', pgName: 'sets' },
  { name: 'runs', pgName: 'runs' },
  { name: 'bodyweight', pgName: 'bodyweight' },
  { name: 'painEntries', pgName: 'pain_entries' },
  { name: 'estimated1RMs', pgName: 'estimated_1rms' },
  { name: 'liftStates', pgName: 'lift_states' },
  { name: 'userProfile', pgName: 'user_profile' },
  { name: 'readinessLogs', pgName: 'readiness_logs' },
] as const;

// Reverse mapping: snake_case -> camelCase per table
const REVERSE_COLUMN_MAPS: Record<string, Record<string, string>> = {
  workouts: {
    client_id: 'clientId', template_id: 'templateId', started_at: 'startedAt',
    completed_at: 'completedAt', total_duration_seconds: 'totalDurationSeconds',
    include_warm_ups: 'includeWarmUps', selected_accessories: 'selectedAccessories',
    pre_workout_pain_entries: 'preWorkoutPainEntries',
  },
  sets: {
    client_id: 'clientId', exercise_id: 'exerciseId', set_number: 'setNumber',
    target_reps: 'targetReps', actual_reps: 'actualReps', is_amrap: 'isAMRAP',
    completed_at: 'completedAt', rest_after_seconds: 'restAfterSeconds',
    original_weight: 'originalWeight', is_substituted: 'isSubstituted',
    substitute_exercise_id: 'substituteExerciseId',
  },
  runs: {
    client_id: 'clientId', duration_minutes: 'durationMinutes',
    distance_miles: 'distanceMiles', perceived_effort: 'perceivedEffort',
  },
  bodyweight: { client_id: 'clientId', time_of_day: 'timeOfDay' },
  pain_entries: { client_id: 'clientId', associated_workout_id: 'associatedWorkoutId' },
  estimated_1rms: {
    client_id: 'clientId', exercise_id: 'exerciseId', working_weight: 'workingWeight',
    reps_completed: 'repsCompleted', estimated_1rm: 'estimated1RM',
    workout_session_id: 'workoutSessionId',
  },
  lift_states: {
    exercise_id: 'exerciseId', client_id: 'clientId', t1_weight: 't1Weight',
    t1_stage: 't1Stage', t1_fail_count: 't1FailCount', t2_weight: 't2Weight',
    t2_stage: 't2Stage', t2_fail_count: 't2FailCount', t3_weight: 't3Weight',
    t1_last_reset_weight: 't1LastResetWeight', t2_last_reset_weight: 't2LastResetWeight',
    t1_last_workout_date: 't1LastWorkoutDate', t2_last_workout_date: 't2LastWorkoutDate',
    deload_active: 'deloadActive', deload_sessions_remaining: 'deloadSessionsRemaining',
    pre_deload_t1_weight: 'preDeloadT1Weight', pre_deload_t2_weight: 'preDeloadT2Weight',
    t2_load_drop_count: 't2LoadDropCount', recent_e1rms: 'recentE1RMs',
    recent_avg_rpes: 'recentAvgRPEs', recent_amrap_reps: 'recentAMRAPReps',
  },
  user_profile: {
    client_id: 'clientId', height_inches: 'heightInches', created_at: 'createdAt',
  },
  readiness_logs: {
    client_id: 'clientId', session_id: 'sessionId', sleep_hours: 'sleepHours',
    stress_level: 'stressLevel',
  },
};

function toCamelCase(pgTableName: string, row: Record<string, unknown>): Record<string, unknown> {
  const map = REVERSE_COLUMN_MAPS[pgTableName] || {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[map[key] || key] = value;
  }
  return result;
}

export async function GET() {
  try {
    const result: Record<string, unknown[]> = {};

    for (const { name, pgName } of TABLES) {
      const rows = await neonSql.query(`SELECT * FROM "${pgName}"`);
      result[name] = rows.map(row => toCamelCase(pgName, row as Record<string, unknown>));
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Sync pull error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
