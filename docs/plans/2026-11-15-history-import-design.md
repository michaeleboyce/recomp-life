# Importing training history from other apps

Status: approved by Michael on 2026-11-15, including the new table and preloading his history. Builds on the strength-model spec
(`docs/plans/2026-11-15-strength-model-design.md`). Deployed and preloaded on 2026-11-17;
I9 was wired only to the muscle view and starting weights, and I10 was not built. Both are
being completed under `docs/plans/2026-11-17-imported-history-and-planning-paths.md`.

This repository is public. This document describes the file formats in general terms only.
Real exports never go into the repo, tests, fixtures, commit messages or any outside service;
tests use made-up files with the same columns.

## Why

Michael has years of training history in two other apps: a Fitbod-style export (one row per
set: date, exercise, reps, weight in kilograms, duration, distance, warm-up flag, a
"multiplier" for the number of implements) and a Gravl export (one row per set: date, start
time, workout, source, exercise, set number, set type including warm-up and drop set, reps,
weight in pounds, distance, duration, an effort word). The history is mostly dumbbell work
with barbell sessions mixed in, plus runs and walks.

That is the data the new strength model needs: barbell and dumbbell sessions of the same lifts
over time, which is how it learns the ratio between them. It also replaces the made-up
starting weights with ones based on real lifts (the "starting weights" item, A).

## Decisions (Michael can change any of them)

1. **The file is read on the device.** Settings → Import history: pick a file on the phone or
   the Mac; it is parsed in the browser; the resulting records sync to Michael's own database
   like everything else. The file itself is never uploaded.
2. **Imported sessions are history, not GZCLP sessions.** They feed the strength estimate, the
   muscle view, recovery and the lift history pages, labelled "Imported". They do not move the
   A1/B1/A2/B2 rotation, do not run GZCLP progression, and are not scored as forecasts.
3. **They are stored in their own synced table** (`importedSessions`, sets inside as JSON), not
   in the workouts table. Every screen that reads workouts today would otherwise have to learn
   to skip them, and a miss would corrupt the rotation or progression. Readers opt in. This
   needs one additive, empty table on the live database.
4. **Exercise names are matched to the app's library.** A built-in map covers the common names;
   frequent exercises the library lacks are added to it (with muscles); anything left is kept
   under its own name with a muscle guess from its words, and the import preview lists those
   so Michael can map or confirm them once. The mapping is remembered for the next import.
5. **Weights are stored as lifted.** Kilograms become pounds. Per-implement weight and the
   number of implements are kept (the multiplier), matching the per-hand flag in the strength
   spec. Drop sets and warm-ups keep their roles. Effort words become an approximate effort
   value graded `heuristic` (for example Easy, Ideal, Hard).
6. **Runs, walks, rides and other cardio become activities**, skipping any that overlap in time
   with one already logged (including Apple Health imports).
7. **Older history counts less.** The strength model already favours recent results; imported
   history uses the same recency weighting, so a 2019 bench press informs the long-term trend
   but not next week's weight.
8. **Starting weights are suggested, never applied silently.** After an import, each program
   lift gets a suggested starting weight from the recent history (the GZCLP guidance of about
   85% of a five-rep max for T1), shown with its working ("from your last eight weeks of dumbbell
   bench press, about …"), and Michael confirms or edits each before it is used.
9. **An import can be undone as a whole** from Recently deleted, and importing the same or an
   overlapping file again adds nothing twice (ids come from the file's rows).

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| I1 | Parsers for both formats into one neutral shape (session, sets with exercise name, reps, weight per implement, implement count, duration, distance, role, effort, time) | Made-up files of each format, including drop sets, warm-ups, timed holds, cardio and bad rows, parse to the expected records; bad rows are reported, not dropped silently |
| I2 | Units and implements: kilograms to pounds, the multiplier semantics confirmed against the format's documentation or from the data's internal consistency | Unit tests; a dumbbell bench press row reads as per-hand weight with two implements |
| I3 | Exercise mapping: built-in map, new library entries for frequent missing exercises, keyword muscle guesses, remembered user mappings | Every name in a made-up file of 60 common names maps or is listed for review; muscles are present for every mapped exercise |
| I4 | Storage: `importedSessions` table (Dexie version, Postgres table, sync registry, backup, additive SQL script) | Same recipe and tests as the forecasts table; the SQL script is additive and safe to run twice |
| I5 | Idempotent import: deterministic ids; a second import of the same file adds nothing | Import twice, count once |
| I6 | Import screen: pick file, preview (date range, sessions, sets, cardio, names to review), confirm, progress, result summary; undo as a batch | Scripted import of a made-up file on a 390-wide screen; undo restores the previous state |
| I7 | Cardio to activities with overlap de-duplication | Overlapping made-up Apple Health and imported walks import once |
| I8 | Rotation, GZCLP progression and forecast scoring ignore imported sessions | Golden rebuild unchanged after an import; rotation unchanged |
| I9 | Strength model, muscle volume and recovery read imported sets with recency weighting | Pooled estimate moves with imported history; a test pins the weighting |
| I10 | Lift history and the Log show imported sessions, labelled, with a filter | Component tests |
| I11 | Starting-weight suggestions with their working, confirmed by Michael | Suggestion equals the stated rule on made-up history; nothing changes until confirmed |
| I12 | Privacy guard: a test fails if any file under `src/` or `docs/` contains a row matching either export's header line with data after it | The guard test |
| I13 | Performance: a 12,000-row file parses and writes within a few seconds on a phone, in chunks, without freezing the screen | Timing test on made-up data; manual check on the phone |

## Packages

| Package | Model | Requirements | Lane (summary) |
|---|---|---|---|
| M1 parsers | Sonnet | I1, I2, I12, I13 (parsing) | new `src/lib/import/parse/**` |
| M2 mapping | Opus | I3 | new `src/lib/import/mapping/**`, library additions in `src/lib/exercises.ts` |
| M3 storage | Sonnet | I4, I5 | `src/db`, sync registry, backup, `scripts/sql` |
| M4 import screen | Opus | I6, I7 | `src/app/settings/import`, `src/components/Import/**`, data writer |
| M5 integration | Opus | I8, I9, I10, I11 | strength model inputs, muscle volume, Log, lift history, starting weights |

Order: M1 and M2 can start now (pure code, no shared files). M3 waits for the strength-core
package to land (it changes the shared types). M4 and M5 follow M3. An independent review
before the deploy. The live-database script (decision 3) is applied before M4 is deployed.

## Risks

- **Mis-mapped exercises** would feed wrong evidence into the strength model. Mitigation: the
  preview lists every mapping with its set count, unmatched names are never guessed into a
  program lift, and mappings can be changed later (re-deriving everything).
- **Unit or implement errors** (per hand against total) would skew every estimate by a factor
  of two. Mitigation: I2 tests, and the preview shows a few sample sets as "50 lb × 2 hands".
- **Personal data in a public repo.** Mitigation: decision 1, the I12 guard, synthetic tests.

## Preloading Michael's history (added on approval)

Michael asked for his existing exports to be loaded now rather than through the import screen
later. After M1 to M3 land, a script (`scripts/import-history.ts`, code only, reading file paths
from its arguments) runs the same parsers and mapping on the Mac and writes the records to the
live database in the sync format, so every device pulls them on its next sync. The exports
stay in a private folder outside the repository and are never committed; the script prints
counts only. The import screen (M4) is still built, for future exports.
