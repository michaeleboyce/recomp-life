-- ReComp Life: stored forecasts, the coach's change log and workout decisions (14 Nov 2026)
--
-- Additive: it adds one column ("decisions") to "workouts" and creates "forecasts" and
-- "coach_events". It drops nothing, touches no existing data and changes no existing row,
-- and it is safe to run more than once (every statement uses IF NOT EXISTS).
-- Run it by hand, once, with Michael's go-ahead, BEFORE deploying the app version that
-- syncs these records: until it has run, uploads of workouts that carry decisions, of
-- forecasts and of coach events are rejected by the database.
--
-- The same column and tables are also in 2026-11-12-clean-schema.sql, so a database
-- created from scratch with that script needs nothing from this one.

BEGIN;

ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "decisions" jsonb;

CREATE TABLE IF NOT EXISTS "forecasts" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "slot" text NOT NULL,
  "kind" text NOT NULL,
  "workout_id" text,
  "exercise_id" text,
  "tier" text,
  "made_at" timestamp with time zone NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "event" jsonb NOT NULL,
  "prediction" jsonb NOT NULL,
  "basis" text NOT NULL,
  "inputs" jsonb NOT NULL,
  "model_version" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "coach_events" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "at" timestamp with time zone NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "detail" text NOT NULL,
  "rule_id" text,
  "data" jsonb
);

COMMIT;
