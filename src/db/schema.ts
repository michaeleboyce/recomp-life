import { pgTable, text, integer, real, boolean, timestamp, jsonb, bigint } from 'drizzle-orm/pg-core';

// Clean schema (12 Nov 2026): one table per SYNC_REGISTRY entry in
// src/lib/sync/registry.ts and nothing else. Lift states and estimated 1RMs are
// rebuilt on each device and never reach the server. The hand-run script
// scripts/sql/2026-11-12-clean-schema.sql creates exactly these tables; a test keeps
// the two in step.

/**
 * Columns every synced table carries. `updated_at` / `deleted_at` are epoch
 * milliseconds: the newest `updated_at` wins a conflict, a set `deleted_at` is a soft
 * delete. A function so each table gets its own column builders.
 */
function syncColumns() {
  return {
    id: text('id').primaryKey(),
    clientId: text('client_id').unique().notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
    deletedAt: bigint('deleted_at', { mode: 'number' }),
    externalId: text('external_id'),
    synced: boolean('synced').notNull().default(true),
  };
}

// Workouts (each holds its own sets; there is no separate sets table)
export const workouts = pgTable('workouts', {
  ...syncColumns(),
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
  endedEarly: boolean('ended_early'),
  prescribed: jsonb('prescribed'),
  completionContext: jsonb('completion_context'),
});

// Lift adjustments: dated, append-only changes to a lift made outside a workout
export const liftAdjustments = pgTable('lift_adjustments', {
  ...syncColumns(),
  exerciseId: text('exercise_id').notNull(),
  at: timestamp('at').notNull(),
  source: text('source').notNull(),
  set: jsonb('set').notNull(),
  note: text('note'),
});

// Runs
export const runs = pgTable('runs', {
  ...syncColumns(),
  date: timestamp('date').notNull(),
  durationMinutes: real('duration_minutes').notNull(),
  distanceMiles: real('distance_miles'),
  type: text('type').notNull(),
  category: text('category').notNull(),
  notes: text('notes').notNull(),
  perceivedEffort: integer('perceived_effort'),
});

// Activities (yoga, cycling, hiking, walking; runs have their own table)
export const activities = pgTable('activities', {
  ...syncColumns(),
  date: timestamp('date').notNull(),
  kind: text('kind').notNull(),
  durationMinutes: real('duration_minutes').notNull(),
  style: text('style'),
  distanceMiles: real('distance_miles'),
  notes: text('notes').notNull(),
  perceivedEffort: integer('perceived_effort'),
});

// Bodyweight
export const bodyweight = pgTable('bodyweight', {
  ...syncColumns(),
  date: timestamp('date').notNull(),
  weight: real('weight').notNull(),
  timeOfDay: text('time_of_day').notNull(),
});

// Pain Entries
export const painEntries = pgTable('pain_entries', {
  ...syncColumns(),
  date: timestamp('date').notNull(),
  region: text('region').notNull(),
  sensation: text('sensation').notNull(),
  severity: integer('severity').notNull(),
  notes: text('notes'),
  associatedWorkoutId: text('associated_workout_id'),
});

// Readiness Logs
export const readinessLogs = pgTable('readiness_logs', {
  ...syncColumns(),
  sessionId: text('session_id').notNull(),
  sleepHours: text('sleep_hours').notNull(),
  stressLevel: text('stress_level').notNull(),
  date: timestamp('date').notNull(),
});

// User Profile (a single row with the fixed id PROFILE_ID)
export const userProfile = pgTable('user_profile', {
  ...syncColumns(),
  name: text('name').notNull(),
  bodyweight: real('bodyweight').notNull(),
  heightInches: real('height_inches').notNull(),
  createdAt: timestamp('created_at').notNull(),
  settings: jsonb('settings').notNull(),
});
