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
-- Dates are timestamp with time zone, so an ISO string with Z is stored and read back
-- as the same instant whatever the server's time zone.

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
DROP TABLE IF EXISTS "health_daily";

CREATE TABLE "workouts" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "template_id" text NOT NULL,
  "location" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "total_duration_seconds" integer NOT NULL,
  "include_warm_ups" boolean NOT NULL,
  "selected_accessories" jsonb NOT NULL,
  "sets" jsonb NOT NULL,
  "pre_workout_pain_entries" jsonb NOT NULL,
  "modifications" jsonb NOT NULL,
  "ended_early" boolean,
  "prescribed" jsonb,
  "completion_context" jsonb,
  "health" jsonb
);

CREATE TABLE "lift_adjustments" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "exercise_id" text NOT NULL,
  "at" timestamp with time zone NOT NULL,
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
  "date" timestamp with time zone NOT NULL,
  "duration_minutes" real NOT NULL,
  "distance_miles" real,
  "type" text NOT NULL,
  "category" text NOT NULL,
  "notes" text NOT NULL,
  "perceived_effort" integer,
  "source" text,
  "source_name" text
);

CREATE TABLE "activities" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "date" timestamp with time zone NOT NULL,
  "kind" text NOT NULL,
  "duration_minutes" real NOT NULL,
  "style" text,
  "distance_miles" real,
  "notes" text NOT NULL,
  "perceived_effort" integer,
  "source" text,
  "source_name" text
);

CREATE TABLE "bodyweight" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "date" timestamp with time zone NOT NULL,
  "weight" real NOT NULL,
  "time_of_day" text NOT NULL,
  "source" text,
  "source_name" text
);

CREATE TABLE "pain_entries" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "date" timestamp with time zone NOT NULL,
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
  "date" timestamp with time zone NOT NULL,
  "sleep_minutes" real,
  "sleep_source" text
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
  "created_at" timestamp with time zone NOT NULL,
  "settings" jsonb NOT NULL
);

CREATE TABLE "health_daily" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "day" text NOT NULL,
  "sleep_minutes" real,
  "sleep_deep_minutes" real,
  "sleep_rem_minutes" real,
  "steps" real,
  "resting_hr" real,
  "hrv_ms" real,
  "active_energy_kcal" real,
  "exercise_minutes" real,
  "vo2_max" real,
  "body_fat_pct" real,
  "lean_mass_lbs" real,
  "dietary_kcal" real,
  "protein_g" real
);

COMMIT;
