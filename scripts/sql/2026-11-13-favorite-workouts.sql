-- ReComp Life: favourite workouts and workout edits (13 Nov 2026)
--
-- Additive: it adds two columns to "workouts" and creates "favorite_workouts". It
-- drops nothing and changes no existing row, and it is safe to run more than once.
-- Run it by hand, once, with Michael's go-ahead, BEFORE deploying the app version that
-- syncs favourites: until it has run, uploads of workouts that carry plan edits and of
-- favourites are rejected by the database.
--
-- The same columns and table are also in 2026-11-12-clean-schema.sql, so a database
-- created from scratch with that script needs nothing from this one.

BEGIN;

ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "plan_edits" jsonb;
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "favorite_id" text;

CREATE TABLE IF NOT EXISTS "favorite_workouts" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "name" text NOT NULL,
  "template_id" text NOT NULL,
  "location" text NOT NULL,
  "include_warm_ups" boolean NOT NULL,
  "selected_accessories" jsonb NOT NULL,
  "substitutes" jsonb NOT NULL,
  "edits" jsonb NOT NULL,
  "snapshot" jsonb NOT NULL,
  "source_session_id" text,
  "created_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone
);

COMMIT;
