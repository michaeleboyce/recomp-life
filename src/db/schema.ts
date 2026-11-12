import { pgTable, text, integer, real, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Workouts
export const workouts = pgTable('workouts', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  templateId: text('template_id').notNull(),
  location: text('location').notNull(),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  totalDurationSeconds: integer('total_duration_seconds').notNull(),
  includeWarmUps: boolean('include_warm_ups').notNull(),
  selectedAccessories: jsonb('selected_accessories').notNull(),
  sets: jsonb('sets').notNull(),
  preWorkoutPainEntries: jsonb('pre_workout_pain_entries').notNull(),
  modifications: jsonb('modifications').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// Sets
export const sets = pgTable('sets', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  exerciseId: text('exercise_id').notNull(),
  tier: text('tier').notNull(),
  setNumber: integer('set_number').notNull(),
  targetReps: integer('target_reps').notNull(),
  actualReps: integer('actual_reps').notNull(),
  weight: real('weight').notNull(),
  isAMRAP: boolean('is_amrap').notNull(),
  completedAt: timestamp('completed_at').notNull(),
  restAfterSeconds: integer('rest_after_seconds').notNull(),
  status: text('status').notNull(),
  originalWeight: real('original_weight'),
  isSubstituted: boolean('is_substituted').notNull(),
  substituteExerciseId: text('substitute_exercise_id'),
  rpe: real('rpe'),
  location: text('location').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// Runs
export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  date: timestamp('date').notNull(),
  durationMinutes: real('duration_minutes').notNull(),
  distanceMiles: real('distance_miles'),
  type: text('type').notNull(),
  category: text('category').notNull(),
  notes: text('notes').notNull(),
  perceivedEffort: integer('perceived_effort').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// Activities (yoga, cycling, hiking, walking; runs have their own table)
export const activities = pgTable('activities', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  date: timestamp('date').notNull(),
  kind: text('kind').notNull(),
  durationMinutes: real('duration_minutes').notNull(),
  style: text('style'),
  distanceMiles: real('distance_miles'),
  notes: text('notes').notNull(),
  perceivedEffort: integer('perceived_effort').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// Bodyweight
export const bodyweight = pgTable('bodyweight', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  date: timestamp('date').notNull(),
  weight: real('weight').notNull(),
  timeOfDay: text('time_of_day').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// Pain Entries
export const painEntries = pgTable('pain_entries', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  date: timestamp('date').notNull(),
  region: text('region').notNull(),
  sensation: text('sensation').notNull(),
  severity: integer('severity').notNull(),
  notes: text('notes'),
  associatedWorkoutId: text('associated_workout_id'),
  synced: boolean('synced').notNull().default(true),
});

// Estimated 1RMs
export const estimated1RMs = pgTable('estimated_1rms', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  date: timestamp('date').notNull(),
  exerciseId: text('exercise_id').notNull(),
  workingWeight: real('working_weight').notNull(),
  repsCompleted: integer('reps_completed').notNull(),
  estimated1RM: real('estimated_1rm').notNull(),
  workoutSessionId: text('workout_session_id').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// Lift States
export const liftStates = pgTable('lift_states', {
  exerciseId: text('exercise_id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  t1Weight: real('t1_weight').notNull(),
  t1Stage: text('t1_stage').notNull(),
  t1FailCount: integer('t1_fail_count').notNull(),
  t2Weight: real('t2_weight').notNull(),
  t2Stage: text('t2_stage').notNull(),
  t2FailCount: integer('t2_fail_count').notNull(),
  t3Weight: real('t3_weight').notNull(),
  t1LastResetWeight: real('t1_last_reset_weight'),
  t2LastResetWeight: real('t2_last_reset_weight'),
  t1LastWorkoutDate: timestamp('t1_last_workout_date'),
  t2LastWorkoutDate: timestamp('t2_last_workout_date'),
  deloadActive: boolean('deload_active').notNull(),
  deloadSessionsRemaining: integer('deload_sessions_remaining').notNull(),
  preDeloadT1Weight: real('pre_deload_t1_weight'),
  preDeloadT2Weight: real('pre_deload_t2_weight'),
  t2LoadDropCount: integer('t2_load_drop_count').notNull(),
  recentE1RMs: jsonb('recent_e1rms').notNull(),
  recentAvgRPEs: jsonb('recent_avg_rpes').notNull(),
  recentAMRAPReps: jsonb('recent_amrap_reps').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// User Profile
export const userProfile = pgTable('user_profile', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  name: text('name').notNull(),
  bodyweight: real('bodyweight').notNull(),
  heightInches: real('height_inches').notNull(),
  createdAt: timestamp('created_at').notNull(),
  settings: jsonb('settings').notNull(),
  synced: boolean('synced').notNull().default(true),
});

// Readiness Logs
export const readinessLogs = pgTable('readiness_logs', {
  id: text('id').primaryKey(),
  clientId: text('client_id').unique().notNull(),
  sessionId: text('session_id').notNull(),
  sleepHours: text('sleep_hours').notNull(),
  stressLevel: text('stress_level').notNull(),
  date: timestamp('date').notNull(),
  synced: boolean('synced').notNull().default(true),
});
