# Favourite workouts and workout edits: design

Date: 2026-11-12. Branch: `feat/favorite-workouts`. Companion: `2026-11-12-favorite-workouts-plan.md`.

## Goal

GZCLP stays the default. On any day the user can change the workout (swap an exercise, add or remove exercises, change sets and reps, change a weight, pull a different day than the one due), save a workout they liked as a favourite, and start a favourite either exactly as saved or with today's weights. Progression accounts for what was actually done, lift by lift.

Upcoming workouts (the forecast, its screen and the "Coming up" line on Today) are built by the UI-refresh work in `src/lib/workout/upcoming.ts` and are out of scope here. This design only has to keep that forecast correct (R6).

## Requirements

| Id | Requirement | Acceptance check |
|---|---|---|
| R1 | Edit a workout before starting: swap, remove, add, change sets × reps, change weight, pick a different day | Each edit shows in the plan preview and is what the in-workout screen performs, including after a reload mid-workout |
| R2 | Save a favourite from the pre-workout screen (named) and from a finished workout (star on the summary and on its Log entry) | The favourite stores day, location, warm-ups, accessories, substitutes, edits, and a frozen copy of every entry |
| R3 | Start a favourite "exactly as saved" or with "today's weights" | After a lift progresses, "today's weights" shows the new weight and "exactly as saved" the old one |
| R4 | Progression credits each lift on its own (rules below) | Unit test per rule; an unedited day produces byte-identical lift states to before |
| R5 | The user sees the impact while editing: each edited entry says whether it counts toward progression, with an evidence line; the muscle map follows the edited plan | Component test per state |
| R6 | Downstream figures pick it up: muscle load, recovery warnings, weekly counts, e1RM, PRs, insights, and the upcoming forecast | An off-program session adds to weekly muscle load and does not move the forecast's next day |
| R7 | Favourites screen (from More and from the quick-add sheet): list, start, rename, delete | A deleted favourite stays deleted after a sync pull; a rename syncs |
| R8 | The crediting rule is a registered coaching rule | Evidence registry and contract tests pass; `docs/coaching-rules.md` regenerated |

## R4: crediting rules

Evaluated per plan entry, from the session's stored `prescribed` list and its logged sets only. Never from how an edit was made, the database or the clock, so the replay of past sessions gives the same answer.

1. **Program entry.** The exercise is a T1/T2/T3 lift of the session's base day, at the prescribed tier and sets × reps, at a weight no lower than prescribed. Evaluated exactly as today (pass, fail, stage change, partial freeze). A home equipment substitute (`overrides`) is still a program entry: DB-adapted workouts at home count as passes.
   The weight compared is `set.originalWeight ?? set.weight`, over every working set that is not an autoregulated load drop. So a home substitute (dumbbell weight in `weight`, barbell prescription in `originalWeight`) and an accepted T2 load drop are both program entries, and the lift is "lighter" only when all of those sets are below the prescription, so one mistyped set does not flip it.
2. **Heavier than prescribed.** Still a program entry. The next weight is computed from the prescribed weight, not the heavier one.
3. **Lighter, or a different scheme.** Logged only. No lift-state change at all: not a pass, not a failure, not a freeze trigger.
4. **Removed program lift.** No lift-state change.
5. **Swapped-in or added exercise.** Logged only. Its suggested weight next time is the last weight logged for that exercise; no new progression maths.
6. **Rotation.** The session counts for the rotation only when its base day was the due day and its T1 lift is still in the plan and is a program entry (an unedited day ended early still counts, as it does today). Otherwise the due day stays due. An out-of-order day therefore progresses its lifts (rules 1 to 5) without moving the rotation.

Sessions with no `prescribed` list (everything before this change) are treated as unedited program sessions.

This is a convention of this app, not part of GZCLP. Rule id `off-program-credit`, area `progression`, grade `heuristic`, no sources, with that stated in `caveat`.

## Data model

All additions to `src/types/index.ts` are additive. Nothing is renamed or reordered.

```ts
/** A change to one entry of a day's plan, applied after the program's prescription. */
export type PlanEdit =
  | { kind: "swap"; exerciseId: string; tier: Tier; replacementId: string }
  | { kind: "remove"; exerciseId: string; tier: Tier }
  | { kind: "add"; exerciseId: string; sets: number; reps: number; weight: number; isAMRAP: boolean }
  | { kind: "scheme"; exerciseId: string; tier: Tier; sets: number; reps: number }
  | { kind: "weight"; exerciseId: string; tier: Tier; weight: number };

/** What the program prescribed for one program lift when the session started, before edits. */
export interface PrescribedEntry {
  exerciseId: string;
  tier: Tier;
  weight: number;
  sets: number;
  reps: number;
  stage?: T1Stage | T2Stage;
}

// WorkoutSession gains (all optional):
//   planEdits?: PlanEdit[];
//   prescribed?: PrescribedEntry[];
//   favoriteId?: string;
//   countsForRotation?: boolean;

/** One entry of a favourite's frozen copy. */
export interface FavoriteSnapshotEntry {
  exerciseId: string;
  tier: Tier;
  sets: number;
  reps: number;
  weight: number;
  isAMRAP: boolean;
}

export interface FavoriteWorkout {
  id: string;
  clientId: string;
  name: string;
  templateId: string;
  location: WorkoutLocation;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  /** Home substitutes: template exerciseId -> substitute exerciseId. */
  substitutes: Record<string, string>;
  /** Structural edits only (swap, remove, add). Weights and schemes live in the snapshot. */
  edits: PlanEdit[];
  snapshot: FavoriteSnapshotEntry[];
  sourceSessionId?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  /** Epoch ms, the edit/rebuild work's `Stamped` convention: last write wins by number. */
  updatedAt: number;
  /** Soft delete (epoch ms): a hard delete would be re-created by the next sync pull. */
  deletedAt: number | null;
  synced: boolean;
}
```

`swap` and `overrides` are different things. `overrides` is the program lift done with different equipment and still credits the program lift. `swap` is a different exercise and is logged only. When both name the same exercise the swap wins and the override is ignored; home adaptation is not applied to a swapped-in exercise, and the picker only offers exercises that work at the current location.

## Logic

One mechanism: a session is a base day plus optional edits, and the existing builder produces the plan.

| Function | File | Notes |
|---|---|---|
| `buildWorkoutPlan(input)` | `src/lib/workout/buildPlan.ts` | `BuildPlanInput.edits?: PlanEdit[]`, applied after prescription. No edits: output identical to today |
| `applyPlanEdits(plan, edits)` | `src/lib/workout/planEdits.ts` (new) | Pure. Used by the builder |
| `editsFromSession(session)` | same | Structural edits and snapshot from a finished session's sets |
| `pinSnapshot(edits, snapshot)` | same | Structural edits plus a `scheme` and `weight` edit per snapshot entry: "exactly as saved" |
| `prescribedFor(template, liftStates)` | same | The `PrescribedEntry[]` stored at start, from `getPrescription` |
| `classifyEntry(entry, prescribed)` | `src/lib/workout/credit.ts` (new) | `"program" \| "logged-only"`. `@evidence off-program-credit` |
| `countsForRotation(session, sets, dueTemplateId)` | same | Rule 6 |
| `computeCompletion(input)` | `src/lib/workout/completeWorkout.ts` | Iterates plan entries, not the template list. `CompletionInput.dueTemplateId?` added; absent means the session counts. `sessionPatch.countsForRotation` added |
| `describeNextWorkout(input)` | `src/lib/workout/buildPlan.ts` | Ignores completed sessions with `countsForRotation === false` |
| `swapCandidates(exerciseId, location, equipment, prefs)` | `src/lib/swapCandidates.ts` (new) | Built on `exercisesForMuscle` and `applyPreferences` |
| `favoriteFromSetup`, `favoriteFromSession`, `resolveFavorite(favorite, mode)` | `src/lib/favorites.ts` (new) | `mode: "as-saved" \| "current"`; returns the input for `startWorkout` |

`startWorkout` (`src/lib/data/workouts.ts`) accepts `planEdits`, `prescribed` and `favoriteId` and stores them on the session row. `useActiveWorkout` passes `session.planEdits` to the builder, so a reload rebuilds the same plan.

## Storage and sync

New table `favoriteWorkouts`: Dexie store `'id, clientId, synced'`, Drizzle `favorite_workouts` (`updated_at bigint`, `deleted_at bigint`), Settings export/clear/restore, writers in `src/lib/data/records.ts`, a `useFavoriteWorkouts` hook that hides rows with `deletedAt`.

New columns on `workouts`: `plan_edits` (jsonb), `prescribed` (jsonb), `favorite_id`, `counts_for_rotation`.

Sync wiring depends on the edit/rebuild work (branch `feat/edit-rebuild`), which replaces the per-table lists with one registry, `src/lib/sync/registry.ts`, read by the client, the guard and both routes, and resets local Dexie to a single-version schema:
- If that registry is on main when the storage task starts: one registry entry plus the Drizzle table. Do not copy the old three-list `activities` pattern.
- The Dexie store goes into the fresh single-version schema if this lands before that work's deploy checkpoint D1, or one additive version after.
- The Postgres table and the four workout columns go into that work's single script if `schema.ts` here is on main before D1, otherwise a small additive script after. Michael approves the database step either way; nothing is pushed without him.

## UI

Built from the existing kit: `ui/sheet`, `ui/list-row`, `ui/section-header`, `ui/page-shell`, `ui/empty-state`, `ui/callout`, `ui/term` (with a glossary entry for "counts toward progression"), the shared tier key, `EvidenceLine`.

- **Pre-workout (`src/components/PreWorkout/**`).** A day selector (the due day is marked). "Edit workout" opens a bottom sheet: per entry, swap, remove, sets × reps and weight controls, plus "Add exercise". Each edited entry carries "counts toward progression" or "logged only" and `<EvidenceLine ruleId="off-program-credit" />`. "Save as favourite" asks for a name. A "Favourites" control opens a sheet listing favourites, each with "Today's weights" and "Exactly as saved".
- **Favourites screen (`src/app/favorites/page.tsx`).** List with last used date, start (both modes), rename, delete. Linked from More and from a "Start a favourite" row in `nav/QuickAddSheet.tsx`. `/favorites` is added to the More prefixes in `nav/TabBar.tsx`.
- **Stars.** A self-contained `FavoriteStar` component (`src/components/Favorites/FavoriteStar.tsx`, session id in) saves that session as a favourite or removes it. The Log list and the workout detail/summary pages belong to the edit/rebuild work, which mounts the star there; this work does not edit those files.

Pages and components reach data only through `src/hooks` and `src/lib/data` (`src/architecture.test.ts`).

## Open points

- A day pulled out of order progresses its lifts but does not move the rotation.
- A lift done heavier than prescribed is a normal pass from the prescribed weight.
