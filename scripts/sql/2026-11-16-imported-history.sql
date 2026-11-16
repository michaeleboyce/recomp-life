-- ReComp Life: sessions imported from other apps, and home-exercise adjustments (16 Nov 2026)
--
-- Additive: it creates one empty table ("imported_sessions") and adds one nullable column
-- ("variant") to "lift_adjustments". It drops nothing, touches no existing data, changes no existing row,
-- and is safe to run more than once (every statement uses IF NOT EXISTS).
-- Run it by hand, once, with Michael's go-ahead, BEFORE deploying the app version that
-- syncs these records: until it has run, uploads of imported sessions, and of adjustments
-- that carry a variant, are rejected by the database.
--
-- The same table and column are also in 2026-11-12-clean-schema.sql, so a database
-- created from scratch with that script needs nothing from this one.

BEGIN;

ALTER TABLE "lift_adjustments" ADD COLUMN IF NOT EXISTS "variant" jsonb;

CREATE TABLE IF NOT EXISTS "imported_sessions" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "external_id" text,
  "synced" boolean NOT NULL DEFAULT true,
  "source_app" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "start_is_local" boolean NOT NULL,
  "ended_at" timestamp with time zone,
  "title" text NOT NULL,
  "notes" text NOT NULL,
  "import_batch_id" text NOT NULL,
  "sets" jsonb NOT NULL
);

COMMIT;
