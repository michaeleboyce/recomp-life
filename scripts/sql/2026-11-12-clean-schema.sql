-- ReComp Life: clean sync schema (edit and rebuild, 12 Nov 2026)
--
-- WARNING: THIS SCRIPT DESTROYS ALL DATA. It drops every sync table, old and new,
-- and recreates them empty. Run it once, by hand, at deploy checkpoint D1, and only
-- with Michael's explicit go-ahead at that moment (see
-- docs/plans/2026-11-12-edit-rebuild-design.md). It is idempotent: running it again
-- gives the same empty schema.
--
-- It must match src/db/schema.ts exactly; src/app/api/sync/schemaSql.test.ts checks
-- that every Drizzle table and column appears here.
--
-- Not created on purpose: sets (workouts hold their sets), lift_states and
-- estimated_1rms (rebuilt on each device, never synced).
--
-- Stamps: updated_at / deleted_at are epoch milliseconds (bigint). The newest
-- updated_at wins a conflict; a non-null deleted_at is a soft delete.

BEGIN;

DROP TABLE IF EXISTS "workouts";
DROP TABLE IF EXISTS "sets";
DROP TABLE IF EXISTS "runs";
DROP TABLE IF EXISTS "activities";
DROP TABLE IF EXISTS "bodyweight";
DROP TABLE IF EXISTS "pain_entries";
DROP TABLE IF EXISTS "estimated_1rms";
DROP TABLE IF EXISTS "lift_states";
DROP TABLE IF EXISTS "user_profile";
DROP TABLE IF EXISTS "readiness_logs";
DROP TABLE IF EXISTS "lift_adjustments";

CREATE TABLE "workouts" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "template_id" text NOT NULL,
  "location" text NOT NULL,
  "started_at" timestamp NOT NULL,
  "completed_at" timestamp,
  "total_duration_seconds" integer NOT NULL,
  "include_warm_ups" boolean NOT NULL,
  "selected_accessories" jsonb NOT NULL,
  "sets" jsonb NOT NULL,
  "pre_workout_pain_entries" jsonb NOT NULL,
  "modifications" jsonb NOT NULL,
  "ended_early" boolean,
  "prescribed" jsonb,
  "completion_context" jsonb
);

CREATE TABLE "lift_adjustments" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "exercise_id" text NOT NULL,
  "at" timestamp NOT NULL,
  "source" text NOT NULL,
  "set" jsonb NOT NULL,
  "note" text
);

CREATE TABLE "runs" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "date" timestamp NOT NULL,
  "duration_minutes" real NOT NULL,
  "distance_miles" real,
  "type" text NOT NULL,
  "category" text NOT NULL,
  "notes" text NOT NULL,
  "perceived_effort" integer
);

CREATE TABLE "activities" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "date" timestamp NOT NULL,
  "kind" text NOT NULL,
  "duration_minutes" real NOT NULL,
  "style" text,
  "distance_miles" real,
  "notes" text NOT NULL,
  "perceived_effort" integer
);

CREATE TABLE "bodyweight" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "date" timestamp NOT NULL,
  "weight" real NOT NULL,
  "time_of_day" text NOT NULL
);

CREATE TABLE "pain_entries" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "date" timestamp NOT NULL,
  "region" text NOT NULL,
  "sensation" text NOT NULL,
  "severity" integer NOT NULL,
  "notes" text,
  "associated_workout_id" text
);

CREATE TABLE "readiness_logs" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "session_id" text NOT NULL,
  "sleep_hours" text NOT NULL,
  "stress_level" text NOT NULL,
  "date" timestamp NOT NULL
);

CREATE TABLE "user_profile" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "name" text NOT NULL,
  "bodyweight" real NOT NULL,
  "height_inches" real NOT NULL,
  "created_at" timestamp NOT NULL,
  "settings" jsonb NOT NULL
);

COMMIT;
