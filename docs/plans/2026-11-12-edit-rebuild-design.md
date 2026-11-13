# Edit or delete any log entry, and rebuild everything derived from it

## Context

Today the log is write-once. A finished workout, run, activity or weigh-in cannot be corrected, and the numbers the app derives from the log (next weights, stages, estimated 1RM history, PRs, projections) are written once at finish and never recomputed. Sync makes it worse: a delete comes back on the next pull and an edit never reaches a second device.

Michael wants any past entry to be editable or deletable, interactively, with every projection and suggestion rebuilding by itself.

**Decision already made (12 Nov):** existing data is wiped and the schema starts clean. That removes all migration work and lets the design be the simple one: the log is the only truth, everything else is recomputed from it.

**Agreed with the other sessions:**
- UI-refresh: this plan takes the whole Log lane (`src/app/log/**`, new `/log/workout/[id]`, `src/app/workout/summary/page.tsx`, `src/components/WorkoutSummary/**`) and adds the toast primitive. It stays out of their in-flight lanes (`src/app/more/**`, `src/components/{Today,PreWorkout,ActiveWorkout,Upcoming,Glossary,More}/**`, `src/lib/workout/upcoming.ts`, `src/app/settings/page.tsx`) until they say landed.
- Interactive-anatomy (favourites, free edits to a workout): one shared completion function (`computeCompletion`, signature unchanged); sessions store the program's prescription; a no-edit session behaves exactly as today.
- Favourites session owns the `prescribed` field on the session row (written in `startWorkout`) and an additive `CompletionInput.dueTemplateId`; this plan consumes both. Its new columns and `favoriteWorkouts` table go into this plan's single database script.
- A relayed statement that Neon may be changed freely is not treated as approval here: the database step keeps its own gate with Michael (D1).
- HealthKit session: log rows carry an optional `externalId`; a soft-deleted imported row is never re-imported.
- Dexie version numbers are assigned at merge time; later merges rebase.

## Findings

| # | Finding | Where |
|---|---|---|
| F1 | `liftStates` and `estimated1RMs` are written at finish and never recomputed; ~25 displays read them | `src/lib/data/workouts.ts`, `useActiveWorkout.ts` |
| F2 | Completion is already one pure function, but its inputs (prescription, phase, increments) are not stored on the workout | `src/lib/workout/completeWorkout.ts` |
| F3 | Accepting a time-off reduction overwrites weights with no record; starting weights are a code constant | `useWorkoutSetup.ts`, `src/db/seed.ts` |
| F4 | No edit/delete for finished workouts, sets, runs, activities; bodyweight has edit but no delete | `src/app/log/page.tsx`, `src/lib/data/records.ts` |
| F5 | Sync only adds rows: no `updatedAt`, no tombstones, pull skips rows it already has | `src/lib/sync.ts`, `src/lib/syncGuard.ts` |
| F6 | Sets are stored twice; the `sets` table is read by nothing | `src/lib/data/workouts.ts` |
| F7 | Sync table list exists three times; one missing table fails the whole pull; `lift_states` key conflict; two devices create two profiles | `sync.ts`, `syncGuard.ts`, `api/sync/pull/route.ts` |
| F8 | Defects in the Log lane: PR badge compares a session with itself; summary "next weight" reads current state; demo generator re-implements completion differently | `app/log/page.tsx`, `app/workout/summary/page.tsx`, `src/lib/demo/generateDemoData.ts` |

## Principles

1. **The log is the truth.** Workouts, adjustments, runs, activities, weigh-ins. Lift state and e1RM history are projections of it and are never edited directly.
2. **Logged sessions are facts.** Editing one session never rewrites another. Each session records what the program prescribed, so a later session stays as it was lifted.
3. **Finish and rebuild are one code path.** Finishing a workout just runs the rebuild.
4. **Show the consequence first.** When an edit changes the next workout, a preview says so before saving.
5. **Every delete can be undone.**

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| E1 | Pure `rebuildDerived` produces every lift state and e1RM row from workouts + adjustments | Unit tests: pass, fail cascade, reset, partial, home substitute, T2 drop, T3, late set |
| E2 | Finish equals rebuild | Seeded property test: after every workout in a random log, the incremental state equals a full rebuild; rebuild twice writes zero rows |
| E3 | Sessions store `prescribed` (per program lift: tier, weight, sets, reps, stage; added by the favourites session, or by this plan's contracts commit if that has not landed) at start and `completionContext` (phase, increments) at finish | Change phase or increments after a workout, rebuild: that workout's outcome is unchanged |
| E4 | Editing the latest session of a lift changes the next prescription; editing an older one changes only history, windows and PRs | Unit tests for both |
| E5 | Workouts: edit a set (reps, weight, RPE), add or delete a set, edit date and location, delete, restore | Data tests; browser: change yesterday's T1 AMRAP from 5 to 2, Today shows the new stage |
| E6 | Runs, activities, weigh-ins, pain entries: edit, delete, restore | Data tests; browser: delete a weigh-in, Undo, it returns |
| E7 | Preview lists changes to the next workout, PRs and e1RM, or says "Nothing else changes"; shown before saving whenever the next workout changes | Unit tests on `previewLogChange`; browser reads "Squat next T1: 205 → 200" |
| E8 | Deleted rows vanish from every screen; "Recently deleted" (30 days) restores them | Test: every log read in `src/hooks` passes through `liveRows`; browser restore |
| E9 | Starting weights, manual weight changes and accepted time-off reductions are dated `liftAdjustments`; "Adjust weight" on lift detail; starting weights editable | Accept a reduction, rebuild: weight persists and an adjustment row exists |
| E10 | Sync carries edits and deletes between devices (last write wins); derived tables do not sync, each device rebuilds | Two-device scenario test (see Verification) |
| E11 | One sync table registry; pull tolerates a missing table; profile has a fixed id | Contract test: registry is the only list; pull returns 200 with one table missing |
| E12 | More > Data: "Check derived data", "Rebuild from log"; backup format v2 (adjustments included, dates revived, version checked) | Corrupt a lift state in a test: check reports it, rebuild fixes it |
| E13 | Log screens to U12: filterable history with a month strip; `/log/workout/[id]` shows every set, with editing built in; post-workout summary is the same page | Browser: tap a day → detail → edit |
| E14 | A set logged in the workout in progress can be corrected before finishing | Browser: log, fix reps in the overview sheet, finish; progression reflects the fix |
| E15 | Tidy-ups: PR badge, summary shows the state as of that workout, demo generator folds the engine, `t3-progression` rule activated with its citation on the T3 row | Unit tests; evidence contract tests green |
| E16 | No logic regression | A scripted A1 gym and A1 home workout give the same lift states as main (`useActiveWorkout.test.ts` golden) |

## Architecture

**Stores (clean schema, old data dropped)**
- `workouts` holds its sets (`workouts.sets` is the only copy; the `sets` table is removed). Adds `prescribed`, `completionContext`, `endedEarly`.
- New `liftAdjustments` (append-only events: `start | manual | decay | import`, exerciseId, date, fields set).
- `liftStates` and `estimated1RMs` stay as local tables so readers do not change, but are rebuilt, never synced.
- Every synced row: `updatedAt` (epoch ms), `deletedAt`, optional `externalId`. Profile uses a fixed id.

**Contracts (signatures fixed in the contracts commit)**

```ts
// src/types/index.ts
interface Stamped { updatedAt: number; deletedAt: number | null; externalId?: string }
interface Prescription { exerciseId: string; tier: Tier; weight: number; stage: number }
interface CompletionContext { phaseMode: TrainingPhase["mode"]; gymBarbellIncrementLbs: number; dumbbellIncrementLbs: number }
interface LiftAdjustment extends Stamped { id; clientId; exerciseId; at: Date;
  source: "start" | "manual" | "decay" | "import"; set: Partial<LiftState>; note?: string; synced: boolean }

// src/lib/rebuild/ (pure)
rebuildDerived(input: { workouts; adjustments; settingsNow; }): { liftStates; e1rms; snapshots: Map<workoutId, LiftState[]> }
type LogChange = editSet | addSet | deleteSet | editWorkout | deleteWorkout | restoreWorkout | adjustLift
applyChange(log, change): log
previewLogChange(input, change): { nextWorkout: {exerciseId, tier, before, after}[]; prChanges; e1rmChanges; unaffected: boolean }

// src/lib/data/
applyRebuild(): Promise<DerivedDiff>            // inside the caller's transaction; writes changed rows only
commitLogChange(change: LogChange): Promise<DerivedDiff>
softDelete(table, id) / restore(table, id)
updateRun(id, patch) / updateActivity(id, patch) / recordAdjustment(a)

// src/hooks/
liveRows(rows)   useLogChangePreview(change)   useRecentlyDeleted()   useDerivedCheck()
```

- The fold: order sessions by `completedAt`; before each, apply earlier adjustments, then set each program lift to the session's `prescribed`; build the plan with `buildWorkoutPlan`; call `computeCompletion`; regenerate that session's e1RM rows from eligible sets (deterministic id from workout + set).
- `appendSet`, `finishWorkout`, `discardWorkout`, `saveLiftState` keep their names and call shapes so the UI-refresh session's `ActiveWorkout` / `PreWorkout` code keeps working; internally `finishWorkout` runs the rebuild and `saveLiftState` records an adjustment.
- A workout in progress keeps the prescription it started with; an edit to an earlier session applies from the next one.
- Sync: client stamps `updatedAt = max(now, previous + 1)`; server upsert applies only when the incoming stamp is newer or equal; cleared fields are sent as `null`; pull overwrites a local row when the server's is newer and the local one is not dirty; a row is marked synced only if it has not changed since it was pushed; after a pull that changed any workout or adjustment, run `applyRebuild()`.
- Postgres: one checked-in script, `scripts/sql/2026-11-12-clean-schema.sql` (drop and recreate; no `sets`, `lift_states`, `estimated_1rms`; adds `lift_adjustments`). Dexie: fresh database name, single version.
- Evidence: no threshold changes. One sentence added to `gzclp-progression` (history edits re-run progression) with a changelog entry; `t3-progression` set active; `docs/coaching-rules.md` regenerated.

## Execution

Spec-driven, parallel agents in separate worktrees with exclusive lanes; a Fable review agent after each wave.

- **Step 0:** commit `docs/plans/2026-11-12-edit-rebuild-design.md` and `-plan.md` (this plan in the repo's spec format).
- **Step 1 (lead, serial):** contracts commit: types, stubs that throw, the SQL file, the fresh Dexie schema, the sync registry type, `liveRows` wired into `src/hooks/{useWorkouts,useRecords}.ts`. Message the other sessions the final shapes.

| Wave | Package | Model | Exclusive lane | Requirements |
|---|---|---|---|---|
| 1 | rebuild-engine | Fable | `src/lib/rebuild/**` | E1, E2, E4, E7 |
| 1 | sync-server | Opus | `src/app/api/sync/**`, `src/lib/syncGuard.ts`, `src/lib/sync/registry.ts`, `src/db/schema.ts`, `scripts/sql/**` | E10, E11 |
| 1 | toast | Sonnet | `src/components/ui/toast.tsx`, mount in `src/components/AppChrome.tsx` | E5, E6 |
| 2 | data-edits | Fable | `src/lib/data/**`, `src/db/{local,init,seed}.ts` | E2, E3, E5, E6, E9, E16 |
| 2 | sync-client | Opus | `src/lib/sync.ts`, `src/lib/sync/**` (not registry) | E10 |
| 2 | edit-components | Opus | `src/components/LogEdit/**`, `src/hooks/useLogEdit.ts` | E5–E9, E12 |
| 3 | log-screens | Opus | `src/app/log/**`, `src/app/workout/summary/page.tsx`, `src/components/WorkoutSummary/**` | E13, E15 |
| 3 | tidy | Sonnet | `src/lib/demo/**`, `src/lib/evidence/**`, backup v2 in `src/lib/data/backup.ts` | E12, E15 |
| 4 | after UI-refresh lands | Fable | `src/components/ActiveWorkout/**` (set correction), `src/components/Lift/**` (Adjust weight), rows under More and Settings | E9, E12, E14 |

**Deploy checkpoints** (each: tests, type-check, build, review clean, browser pass)

| Checkpoint | What goes live | Gate |
|---|---|---|
| D1 after Wave 2 | Clean schema, rebuild engine, edit data layer, sync v2 | **Michael approves running the SQL script himself or explicitly at that moment.** Script, server and client deploy together, announced to the other sessions first so no deploy goes out against a half-changed database; the app's local data resets on next open. Afterwards Michael does one real sync from his phone to confirm it end to end |
| D2 after Wave 3 | Log screens with editing, preview, undo, Recently deleted | Normal |
| D3 after Wave 4 | In-workout correction, Adjust weight, data tools under More | Normal |

## Critical files

- **New:** `src/lib/rebuild/**`, `src/lib/data/{derived,logEdits,adjustments,backup}.ts`, `src/lib/sync/registry.ts`, `src/components/LogEdit/**`, `src/components/ui/toast.tsx`, `src/app/log/workout/[id]/page.tsx`, `scripts/sql/2026-11-12-clean-schema.sql`
- **Changed:** `src/lib/data/{workouts,records}.ts`, `src/lib/sync.ts`, `src/lib/syncGuard.ts`, `src/app/api/sync/{push,pull}/route.ts`, `src/db/{local,schema,init,seed}.ts`, `src/hooks/{useWorkouts,useRecords}.ts`, `src/types/index.ts`, `src/app/log/page.tsx`, `src/lib/demo/generateDemoData.ts`
- **Reused unchanged:** `src/lib/workout/completeWorkout.ts` (`computeCompletion`), `src/lib/workout/buildPlan.ts`, `src/lib/progression.ts`, `src/lib/e1rm.ts` (`calculateE1RM`, `isE1RMEligibleSet`), `src/lib/workout/testFixtures.ts`, `src/lib/data/testUtils.ts`, UI kit (`sheet`, `dialog`, `list-row`, `callout`, `page-shell`)

## Verification

- **Unit and property tests** in `src/lib/rebuild/`: E1 and E4 cases; finish equals rebuild; rebuild is idempotent; editing a non-latest session leaves prescriptions unchanged; delete then restore is the identity.
- **Two-device sync test:** two fake-indexeddb databases and an in-memory server. A edits a set → B pulls → B's next prescription matches A's. A deletes a run → B loses it. Simultaneous edits resolve to the later stamp. An edit made mid-push stays dirty.
- **Existing suites** stay green, including the `useActiveWorkout.test.ts` golden, architecture and evidence contract tests. Report as "X/Y passing (Z pre-existing failures)".
- **Browser at 390×844 (Playwright):**
  1. Finish two workouts; edit the latest T1 AMRAP reps; preview appears; save; Today shows the new stage.
  2. Edit the older workout; the sheet says "Nothing else changes"; the e1RM chart and PR update.
  3. Delete a workout; Undo from the toast; delete again; restore from Recently deleted.
  4. Edit and delete a run, an activity and a weigh-in; trends update.
  5. "Check derived data" reports all consistent.

## Risks

- **Three sessions edit shared files** (`src/types/index.ts`, `src/db/local.ts`, hooks). The contracts commit lands first; others rebase; stable function names keep the UI-refresh screens working.
- **The schema reset is destructive.** It is approved in principle; the script still runs only at D1 with Michael's go-ahead, and production's database target is confirmed then (it was not verifiable on 11 Nov).
- **Favourites' crediting rule changes `computeCompletion`'s behaviour.** The shared golden test (a no-edit session is identical to today) guards the rebuild whichever lands first.
- **Preview folds the whole log per change.** Fine at hundreds of workouts; memoise on a log version if it grows.
