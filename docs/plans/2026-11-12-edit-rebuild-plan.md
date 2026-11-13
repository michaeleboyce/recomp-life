# Edit and rebuild: execution plan

Spec: [2026-11-12-edit-rebuild-design.md](2026-11-12-edit-rebuild-design.md). Requirement ids (E1 to E16) refer to it.

## Rules for every work package

1. Work in your own worktree and branch. Never push, never merge, never deploy. The lead integrates.
2. Edit only the files in your lane. If something outside it must change, stop and report it.
3. TDD: failing test, implement, green. Pure logic lives in `src/lib` with a test file beside it.
4. Contract signatures (below) are fixed. Additions are fine; changes need the lead.
5. Only `src/lib/data`, `src/hooks`, `src/db` and `src/lib/sync*` import `@/db/local`. Never weaken `src/architecture.test.ts` or the evidence contract tests.
6. Weights in lbs, durations in seconds. Records hold `Date`; sync stamps (`updatedAt`, `deletedAt`) are epoch milliseconds. Wrap stored dates in `new Date(x)` before use.
7. Reuse what exists: `computeCompletion`, `buildWorkoutPlan`, `overridesFromSession`, `getPrescription`, `calculateE1RM`, `isE1RMEligibleSet`, `toRecentE1RMSeries`, the fixtures in `src/lib/workout/testFixtures.ts` and `src/lib/data/testUtils.ts`. Do not re-implement progression.
8. Do not touch the real database, read `.env*` files or run `drizzle-kit`. Tests use fake-indexeddb and in-memory fakes.
9. Report: what was built, files changed, "X/Y tests passing (Z pre-existing failures)", `npx tsc --noEmit` result, and anything left open.

## Contracts

| Contract | File | Implemented by |
|---|---|---|
| `Stamped`, `PrescribedEntry`, `CompletionContext`, `LiftAdjustment`, `AdjustableField`; `WorkoutSession.prescribed/completionContext`; `Estimated1RM.setId` | `src/types/index.ts` | contracts commit |
| `RebuildInput`, `RebuildResult`, `LogChange`, `ChangePreview`, `DerivedDiff`; `rebuildDerived`, `e1rmsForWorkout`, `applyChange`, `previewLogChange`, `diffDerived` | `src/lib/rebuild/{types,index}.ts` | rebuild-engine |
| `SyncTableDef`, `SYNC_REGISTRY` | `src/lib/sync/registry.ts` | contracts commit (data), sync-server and sync-client (use) |
| `liveRows` | `src/hooks/liveRows.ts` | contracts commit |
| `applyRebuild`, `checkDerived` | `src/lib/data/derived.ts` | data-edits |
| `commitLogChange`, `softDelete`, `restore`, `updateRun`, `updateActivity`, `listDeleted` | `src/lib/data/logEdits.ts` | data-edits |
| `recordAdjustment` | `src/lib/data/adjustments.ts` | data-edits |
| `appendSet(workoutId, set)`, `finishWorkout(workoutId, finish)` new call shapes | `src/lib/data/workouts.ts` | data-edits (call sites in `ActiveWorkout` and `PreWorkout` change in the same release, agreed with the UI-refresh session) |

## Engine rules (rebuild-engine must implement exactly these)

1. Inputs are filtered inside the engine: workouts and adjustments with `deletedAt` set are ignored.
2. Lift states start from the `start` adjustments. A lift with none starts from an empty state (weights 0, first stage, no history).
3. Completed workouts are folded in order of `completedAt`, then `startedAt`, then `id`.
4. Before each workout: apply every adjustment dated at or before its `startedAt` that has not been applied (absolute sets of the listed fields), then set each program lift's weight and stage to the session's `prescribed` entry when one is stored. The prescription is a fact; state computed from earlier sessions never overrides it.
5. The plan comes from `buildWorkoutPlan` with the anchored states, the session's location, accessories and `overridesFromSession(session)`. Settings come from the session's `completionContext` when stored, else the current settings.
6. `computeCompletion` is called with all of the session's sets (late sets count), `now = completedAt`, and the e1RM series as of that workout.
7. e1RM rows are regenerated from every non-deleted workout's eligible sets (finished or not), with id `e1rm:<workoutId>:<setId>`.
8. Adjustments dated after the last workout are applied last.
9. The result is deterministic: same input, deeply equal output. Derived rows are local-only (`synced: true`).

## Lanes

| Wave | Package | Model | Exclusive lane | Requirements |
|---|---|---|---|---|
| 1 | rebuild-engine | Fable | `src/lib/rebuild/**` | E1, E2, E4, E7 |
| 1 | sync-server | Opus | `src/app/api/sync/**`, `src/lib/syncGuard.ts`, `src/lib/syncGuard.test.ts`, `src/db/schema.ts`, `scripts/sql/**` | E10, E11 |
| 1 | toast | Sonnet | `src/components/ui/toast.tsx` (+ test), `src/components/AppChrome.tsx` | E5, E6 |
| 2 | data-edits | Fable | `src/lib/data/**`, `src/db/{local,init,seed}.ts` and their tests | E2, E3, E5, E6, E9, E16 |
| 2 | sync-client | Opus | `src/lib/sync.ts`, `src/lib/sync.test.ts`, `src/lib/sync/**` except `registry.ts`, `src/components/SyncProvider.tsx` | E10 |
| 2 | edit-components | Opus | `src/components/LogEdit/**`, `src/hooks/useLogEdit.ts` | E5 to E9, E12 |
| 3 | log-screens | Opus | `src/app/log/**`, `src/app/workout/summary/page.tsx`, `src/components/WorkoutSummary/**` | E13, E15 |
| 3 | tidy | Sonnet | `src/lib/demo/**`, `src/lib/evidence/**`, `src/lib/data/backup.ts` | E12, E15 |
| 4 | finishing | Fable | `src/components/ActiveWorkout/**`, `src/components/Lift/**`, rows under More and Settings (after the UI-refresh session reports landed) | E9, E12, E14 |

A Fable review agent reads each wave's diff against the requirements before the lead merges it.

## Deploy checkpoints

See the design doc. D1 includes the database script and needs Michael's go-ahead at that moment; the lead announces the window to the other sessions first.
