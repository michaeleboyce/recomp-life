-- ReComp Life: which import added each run and activity (16 Nov 2026)
--
-- Additive: it adds one nullable column ("import_batch_id") to "runs" and to "activities".
-- It drops nothing, touches no existing data and changes no existing row, and it is
-- safe to run more than once (every statement uses IF NOT EXISTS).
-- Run it by hand, once, with Michael's go-ahead, BEFORE deploying the app version that
-- undoes imports from Recently deleted: until it has run, uploads of imported runs and
-- activities, which carry the column, are rejected by the database.
--
-- The same columns are also in 2026-11-12-clean-schema.sql, so a database created from
-- scratch with that script needs nothing from this one.

BEGIN;

ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "import_batch_id" text;
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "import_batch_id" text;

COMMIT;
