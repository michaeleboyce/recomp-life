# Favourite workouts and workout edits: implementation plan

Date: 2026-11-12. Design: `2026-11-12-favorite-workouts-design.md` (requirement ids R1 to R8 refer to it).

## Working rules

1. Tests first: each task writes its failing tests before the implementation.
2. Every agent has an exclusive file list and works in its own worktree. A change outside the list is requested, not made.
3. Unedited behaviour does not change: `src/lib/workout/buildPlan.test.ts` and `src/lib/workout/completeWorkout.test.ts` stay green without edits, and helper signatures in `src/lib/workout/testFixtures.ts` do not change (additions only).
4. Pages and components import data only through `src/hooks` and `src/lib/data`; colours only through tokens. `src/architecture.test.ts` stays green.
5. Nothing is pushed to the real database. Schema changes are code only until Michael runs or approves the migration.
6. Code starts after the UI-refresh session reports its current wave landed, rebased on `origin/main` at that point.

## Step 0: spec

Commit this file and the design.

## Step 1: contracts (one commit, lead)

- `src/types/index.ts`: `PlanEdit`, `PrescribedEntry`, `FavoriteSnapshotEntry`, `FavoriteWorkout`, the four optional `WorkoutSession` fields.
- `src/lib/workout/types.ts`: `BuildPlanInput.edits?`, `CompletionInput.dueTemplateId?`, `CompletionResult.sessionPatch.countsForRotation?`.
- Signatures with doc comments and failing tests for `planEdits.ts`, `credit.ts`, `favorites.ts`, `swapCandidates.ts`.
- `src/lib/data/workouts.ts`: `StartWorkoutInput` fields.
- Evidence rule id `off-program-credit` reserved.
- Paths and signatures sent to the UI-refresh, evidence-registry and HealthKit sessions.

## Step 2: wave 1 (parallel)

| Agent | Model | Exclusive files | Tasks | Req |
|---|---|---|---|---|
| plan-edits | opus | `src/lib/workout/planEdits.ts`, `src/lib/workout/buildPlan.ts`, `src/lib/swapCandidates.ts` and their tests | `applyPlanEdits`, `editsFromSession`, `pinSnapshot`, `prescribedFor`; `edits` in the builder with the swap/overrides precedence in its doc comment; `swapCandidates` | R1, R3 |
| credit | opus | `src/lib/workout/credit.ts`, `src/lib/workout/completeWorkout.ts`, `src/lib/evidence/**`, `docs/coaching-rules.md` (generated) and their tests | `classifyEntry`, `countsForRotation`, per-entry `computeCompletion`; the `describeNextWorkout` filter is handed to plan-edits as a named task; evidence rule, changelog, `npm run docs:evidence`; the R6 test | R4, R6, R8 |
| storage | sonnet | `src/db/**`, `src/lib/sync.ts`, `src/lib/syncGuard.ts`, `src/app/api/sync/**`, `src/lib/data/records.ts`, `src/hooks/useRecords.ts`, `src/hooks/index.ts`, the export block of `src/app/settings/page.tsx`, and their tests | `favoriteWorkouts` table end to end, soft delete with numeric `updatedAt` / `deletedAt`, the four workout columns. Sync goes through `src/lib/sync/registry.ts` if the edit/rebuild contracts are on main (one entry), see the design's "Storage and sync" | R2, R7 |
| favorites-lib | sonnet | `src/lib/favorites.ts` and its test | `favoriteFromSetup`, `favoriteFromSession`, `resolveFavorite` | R2, R3 |

Merge order: plan-edits, credit, favorites-lib, storage. Full test run after each merge.

## Step 3: wave 2 (parallel)

| Agent | Model | Exclusive files | Tasks | Req |
|---|---|---|---|---|
| pre-workout | sonnet | `src/components/PreWorkout/**`, `src/components/ActiveWorkout/useActiveWorkout.ts`, `src/lib/data/workouts.ts`, `src/lib/glossary.ts` (one entry) | Day selector, edit sheet, impact lines with `EvidenceLine`, save as favourite, favourites picker; store `planEdits`, `prescribed`, `favoriteId` at start; pass edits and `dueTemplateId` through | R1, R3, R5 |
| favourites-screen | sonnet | `src/app/favorites/**`, `src/components/Favorites/**`, `src/components/nav/QuickAddSheet.tsx`, `src/components/nav/TabBar.tsx`, the More list | Screen, quick-add row, More row, tab prefix | R7 |
| stars | haiku | `src/components/Favorites/FavoriteStar.tsx` and its test | Self-contained star (session id in). Mounted on the Log rows and workout detail by the edit/rebuild work, which owns `src/app/log/**`, `src/app/workout/summary/page.tsx` and `src/components/WorkoutSummary/**` | R2 |

## Step 4: review and verification

- Review of the whole diff by an opus reviewer; fixes applied.
- `npx vitest run`, reported as "X/Y tests passing (Z pre-existing failures)".
- `npm run docs:evidence` leaves no diff.
- Playwright, phone width, dev server:
  1. Edit the due day (swap one lift, change one scheme), start, reload mid-workout, finish. The swapped lift's program weight is unchanged, the untouched lift progressed, the due day is still due.
  2. Save it as a favourite, start it both ways, compare weights.
  3. Star a workout from the Log; delete a favourite, sync, confirm it stays deleted.
  4. The upcoming list still shows the right next day.
- Tell the UI-refresh session before the Dexie and sync change lands, and the day of the merge.
