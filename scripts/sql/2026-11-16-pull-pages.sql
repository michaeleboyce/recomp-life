-- ReComp Life: the server's own write stamp on every synced table, for paged pull (16 Nov 2026)
--
-- Additive: it adds one column ("server_updated_at", epoch milliseconds, 0 for rows
-- already there) to every synced table. It drops nothing, touches no existing data and
-- changes no existing row's values, and it is safe to run more than once (every
-- statement uses IF NOT EXISTS). Adding a column with a constant default does not
-- rewrite the table.
-- Run it by hand, once, with Michael's go-ahead, BEFORE deploying the app version that
-- pulls in pages: until it has run, that version's pushes and pulls are refused by the
-- database (the data stays on each device and goes up once the script has run).
-- It can run before or after 2026-11-16-imported-history.sql: that script creates
-- "imported_sessions" with the column already, and this one adds it if the table exists.
--
-- The same column is also in 2026-11-12-clean-schema.sql, so a database created from
-- scratch with that script needs nothing from this one.

BEGIN;

ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "lift_adjustments" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "bodyweight" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "pain_entries" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "readiness_logs" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "health_daily" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "favorite_workouts" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "forecasts" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE "coach_events" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS "imported_sessions" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;

COMMIT;
