# ReComp Life: foundation refactor plan

## Context

A review of the app (walking a real workout locally, then reading the code) showed that the
facelift, the evidence-layer session and the anatomy session are all slowed by the same three
structural problems:

1. **Workout logic lives inside page components.** `src/app/workout/active/page.tsx` (1,064
   lines, 27 hooks) builds the exercise list, applies progression and writes to the database.
   `configure/page.tsx` and `summary/page.tsx` each re-implement parts of it, and they disagree.
2. **No data layer.** 28 page/component files import `@/db/local` directly. Each re-derives
   things like "skip warm-up sets" and "is the database seeded".
3. **Design tokens are bypassed.** 177 hardcoded Tailwind palette classes across 33 files, 64
   inline hex/oklch values, and repeated page-shell / callout / stagger markup.

Defects traced to those causes (all confirmed in code, on `main` at `7c3ca6b`):

| # | Defect | Where |
|---|---|---|
| D1 | Completed T1 rows show warm-up sets ("45 × 9" instead of "190 × 3") | `components/ActiveWorkout/SetProgressList.tsx:21` |
| D2 | Fresh device opening `/workout/configure` hangs forever on the active screen: seeding runs on 6 pages but not configure/active/history/summary | `db/init.ts`, callers |
| D3 | Reloading mid-workout (iOS evicting the PWA) loses all progress: state is only in Zustand, and logged sets are not attached to the workout until completion | `stores/workoutStore.ts`, `active/page.tsx:194-331` |
| D4 | Discarding an unfinished workout leaves its sets orphaned in the `sets` table | `active/page.tsx:558`, `AbandonedWorkoutBanner.tsx:48` |
| D5 | Home substitute chosen on Configure is ignored: Active always uses `dumbbellAlternative`, never `adaptExerciseForHome` or the user's override | `active/page.tsx:260-271` vs `configure/page.tsx:326-402` |
| D6 | Configure previews warm-ups for T1 and T2; Active only generates them for T1 | `configure/page.tsx:411`, `active/page.tsx:274` |
| D7 | Built but never rendered: `AbandonedWorkoutBanner`, `InactivityBanner`, `WeighInPrompt`, `BodyweightChart` | no importers |
| D8 | Bottom nav shows during a workout and covers the RPE row | `app/layout.tsx:56` |
| D9 | Logic never called by the app: `evaluateT3Progression` (T3 never progresses), `deload`, `rateOfLoss`, `volumeRatio`, `painAutoClear` | `src/lib/` |

D9 belongs to the evidence session's area; this plan reports it to them, it does not fix it.

**Outcome:** pages become layout only; one tested place owns workout building, logging and
completion; one data layer; one token set. The facelift and both other sessions build on that.

## Constraints from the other two sessions

- `evidence-registry-coaching-rules` (branch `feat/evidence-layer`, main checkout) is editing
  `active/page.tsx`, `RestTimer`, `AMRAPIndicator`, `RPESelector`, `progression.ts`, `e1rm.ts`,
  and adding `lib/restTimes.ts`, `lib/evidence/**`, `components/Evidence/*`.
- `interactive-anatomy-exercise-demos` (branch `feat/interactive-anatomy`) is rewriting
  `BodyMapSVG.tsx`, changing `Exercise.primaryMuscles` to `MuscleId[]`, and inserting small
  slots into `ExerciseBlock`, `WorkoutOverviewSheet`, `NextWorkoutCard`, `app/page.tsx`.
- Both asked that wide sweeps (data hooks, colour tokens) wait for their merge. Neither touches
  `app/layout.tsx`, `globals.css`, `stores/`, `db/`, `SetProgressList.tsx`, or `src/hooks/`.
- Merging to `main` is Michael's decision. I work only in my own worktree, never in the main
  checkout's working tree, and commit/push only when asked.

So the work splits by who else is touching a file. **Stage A is additive** (new files plus
edits to files nobody else touches). **Stage B migrates existing call sites**: the files
neither session touches can be migrated now (Wave 2), the rest after both branches are on
`main` (Wave 3). The task sections below define the work; the Execution model section assigns
it to parallel agents.

## Requirements

Each task below cites the requirement it satisfies.

| ID | Requirement | Acceptance check |
|---|---|---|
| R1 | The local database is initialised once at app level before any page content renders | Fresh browser profile → open `/workout/configure` → start → active screen renders the first set |
| R2 | A workout's exercise list is produced by one pure function used by Configure, Active and Summary | Unit tests; Configure preview and Active show identical exercises, weights and warm-ups for gym and home |
| R3 | The home substitute chosen on Configure is the one performed | Pick a non-default alternative on Configure → Active shows that exercise and weight |
| R4 | Every logged set is persisted on its workout record immediately | Log 3 sets → reload page → Active resumes at set 4 with rows 1-3 shown |
| R5 | Discarding a workout removes its sets and e1RM rows | After discard, `sets` and `estimated1RMs` contain no rows from that session |
| R6 | Completed-set rows show only that exercise's working sets | With warm-ups on, T1 row 1 shows the T1 weight, reps and RPE |
| R7 | Workout completion (progression, freeze, tracking arrays, session update) is one tested function, with T1/T2 sharing one code path | Unit tests reproduce today's behaviour for pass, fail, partial (freeze), ended-early, home-adapted |
| R8 | Pages and components read/write data only through `src/hooks/` and `src/lib/data/` | Architecture test: no `@/db/local` import under `src/app` or `src/components` |
| R9 | Tier, status and feedback colours come from named tokens | Architecture test: no raw palette class (`text-red-500` etc.) under `src/app` or `src/components`, except an explicit allowlist |
| R10 | Shared UI shells replace repeated markup | `PageShell`, `Callout`, `TierBadge`, `Stagger` exist with tests; the 19 shell and 12 stagger copies are gone |
| R11 | Navigation chrome is hidden on the active workout | No bottom nav on `/workout/active`; present everywhere else |
| R12 | Existing-but-unrendered features are surfaced | Dashboard shows resume banner for an unfinished workout, inactivity banner, weigh-in prompt |
| R13 | No behaviour change beyond D1-D8 | Full suite passes; before/after Playwright walkthrough matches apart from the listed fixes |

## Execution model: spec first, then a parallel agent team

I act as lead: I write the spec and the contracts, create one git worktree per agent, hand each
agent a brief, then integrate and verify. Agents never touch `main`, the main checkout, or each
other's files, and never push.

**Why contracts first:** the work packages depend on each other's interfaces (pages need hook
names, components need token names). If the signatures are committed before anyone starts,
every package can be built and tested in parallel against stable names.

### Step 0 (lead, serial): spec + contracts commit

1. Branch `refactor/foundation` from `main` in a fresh worktree.
2. Write `docs/plans/2026-11-11-foundation-refactor-design.md` (context, R1-R13, module design)
   and `-plan.md` (work packages, owners, requirement IDs), matching the `docs/plans/`
   convention. Commit.
3. Contracts commit, signatures only, no behaviour:
   - `src/lib/workout/types.ts` and exported function signatures for every file in A4 (bodies
     `throw new Error("not implemented")`).
   - `src/lib/data/*.ts` and `src/hooks/*.ts` signatures (A5).
   - Token names in `globals.css`, prop types for `TierBadge`, `Callout`, `PageShell`,
     `Stagger`, `tierStyle` (A6).
   - `src/architecture.test.ts` with the allowlist of today's offenders (A7), `fake-indexeddb`
     installed, `vitest.config.ts` excluding `.claude/**`.
4. Message both other sessions: what is coming that they can use, the file list each wave will
   touch, and D9 to the evidence session.

### Waves

Each agent gets: its requirement IDs and acceptance checks, an **exclusive file list**, a
forbidden list (everything the other sessions own, see Constraints), the contracts it must
implement or consume, TDD order (failing test first), and a required report: files changed,
"X/Y tests passing (Z pre-existing failures)", `tsc` result, anything it could not do.

| Wave | Agent | Owns (exclusive) | Tasks |
|---|---|---|---|
| 1 | `workout-domain` | `src/lib/workout/**`, `SetProgressList.tsx` (+ its test) | A1, A4 |
| 1 | `data-layer` | `src/lib/data/**`, `src/hooks/**`, `src/db/init.ts`, `DbProvider.tsx`, `AppChrome.tsx`, `app/layout.tsx` | A2, A3, A5 |
| 1 | `design-system` | `globals.css`, `src/lib/tierStyle.ts`, `components/ui/{tier-badge,callout,page-shell,stagger}.tsx` | A6 |
| 2 | `migrate-pages` | `app/{weigh-in,body-check,plate-calculator,run,history}/page.tsx`, `RunLogger.tsx`, `WeighInPrompt.tsx` | B5/B6 for these files |
| 2 | `migrate-dashboard` | `Dashboard/{WeightTrend,GymDebtBanner,AbandonedWorkoutBanner}.tsx`, `BodyMap/{RegionDetail,PainHistory}.tsx`, `Equipment/*`, `Settings/*`, `SyncProvider.tsx` | B5/B6 for these files |
| 2 | `migrate-workout-parts` | `ActiveWorkout/{SetLogger,WorkoutHeader,WorkoutMiniMap,EndWorkoutConfirmDialog,WarmUpSet}.tsx`, `WorkoutSummary/{EquipmentAdaptedResult,PostWorkoutBodyCheck}.tsx`, `PreWorkout/{LocationToggle,WarmUpToggle,TimeEstimate,TechniqueChecklist}.tsx` | B6 for these files |
| 3 | `active-page` | `app/workout/active/page.tsx`, `stores/workoutStore.ts`, `ActiveWorkout/{ExerciseBlock,WorkoutOverviewSheet,RestTimer,AMRAPIndicator,RPESelector}.tsx` | B2 |
| 3 | `configure-page` | `app/workout/configure/page.tsx`, `PreWorkout/{ReadinessCheck,AccessoryPicker}.tsx` | B3 |
| 3 | `summary-history` | `app/workout/summary/page.tsx`, `WorkoutSummary/LiftResult.tsx`, `Charts/*` | B4, B6 |
| 3 | `dashboard-rest` | `app/page.tsx`, remaining `Dashboard/*`, `app/{program,tools,settings,exercises,1rm-calculator}/page.tsx`, `Exercises/*` | B5, B6, B7 |

- **Wave 1** starts right after Step 0. Three agents, no shared files.
- **Wave 2** starts once Wave 1 is integrated. It migrates only files that neither other
  session touches, so it can run now too. Each agent removes its files from the architecture
  test allowlist as it goes; the allowlist is a one-entry-per-line list so removals in
  different regions merge cleanly.
- **Wave 3** waits for `feat/evidence-layer` and `feat/interactive-anatomy` to be on `main`.
  The lead does B1 (reconcile `lib/workout` with the merged logic) serially first, then the
  four agents run in parallel on the merged code. B8 (empty the allowlist, split oversized
  pages) is the lead's closing step.

### Model per agent

By default every agent would run on the same model as the lead (Fable 5.2). The plan instead
matches the model to how much judgment the package needs:

| Agents | Model | Why |
|---|---|---|
| Lead (spec, contracts, B1 reconcile, integration, Playwright) | Fable 5.2 | Sets the interfaces everything else depends on |
| `workout-domain`, `active-page`, `configure-page` | Fable 5.2 | Progression, freeze and resume logic; a subtle mistake changes training weights |
| `data-layer`, `summary-history`, `dashboard-rest` | Opus 5.5 | Real design work but well specified by the contracts |
| `design-system`, `migrate-pages`, `migrate-dashboard`, `migrate-workout-parts` | Sonnet 5.5 | Mechanical: swap class names and imports to a fixed mapping, guarded by the architecture test |
| Review agent after each wave | Fable 5.2 | The check on the cheaper agents' output |

No agent uses Haiku. If a Sonnet package comes back with review findings twice, the lead
re-runs it on Opus instead of iterating.

### Integration after each wave (lead)

1. Merge each agent branch into `refactor/foundation` (file ownership is disjoint, so merges
   should be clean; a conflict means an agent left its lane and its change is sent back).
2. Run the full suite, `tsc`, lint.
3. One independent review agent reads the wave's diff against the requirement IDs and the
   forbidden list; confirmed findings go back to the owning agent.
4. Lead runs the Playwright acceptance checks (only the lead drives the browser and dev
   server, so agents do not fight over ports).
5. Report to Michael; nothing is merged to `main` or pushed without his say-so.

Worktrees: created by the lead under `.claude/worktrees/<agent>` from the contracts commit,
each with its own `npm ci`. Removed after the wave is integrated.

## Stage A: additive foundation (Wave 1)

Every item is a new file or an edit to a file neither other session touches. TDD throughout:
failing test first.

### A1. Bug fix D1 (R6)
- New `src/lib/workout/setSelectors.ts`: `workingSetsFor(sets, exerciseId, tier)`,
  `isWarmUpSet(set)`. Tests cover warm-up exclusion and substituted exercises.
- `SetProgressList.tsx` uses it. Add the first component test (RTL) for this component.

### A2. App-level database initialisation (R1, fixes D2)
- New `src/components/DbProvider.tsx` (client): calls `initializeDatabase()` once, exposes
  `useDbReady()`, renders children only when ready (existing skeleton as fallback).
- `src/app/layout.tsx`: wrap `{children}` in `<DbProvider>`.
- Make `initializeDatabase()` idempotent under concurrent calls (module-level promise) so the
  six existing per-page calls, and the other sessions' new pages, stay harmless until Stage B
  deletes them.

### A3. Route-aware chrome (R11, fixes D8)
- New `src/components/AppChrome.tsx` (client): renders `BottomNav` and the bottom padding
  unless `pathname` starts with `/workout/active`. Used from `layout.tsx`.
- `BottomNav.tsx` itself is not edited (both other sessions touch its `alsoActive` list).

### A4. Pure workout domain, `src/lib/workout/` (R2, R3, R7)
New files with tests, not yet wired into pages:
- `prescription.ts`: `getPrescription(tier, liftState, templateExercise)` → `{weight, sets,
  reps}`. Replaces the four separate `stageConfig` tables in Active and Summary and
  `getWeightForExercise` in Configure.
- `buildPlan.ts`: `buildWorkoutPlan({template, liftStates, location, equipment,
  includeWarmUps, selectedAccessories, overrides})` → `WorkoutExerciseState[]`. Reuses
  `adaptExerciseForHome` (`lib/autoAdapt.ts`), `generateWarmUpSets` (`lib/warmups.ts`),
  `WORKOUT_TEMPLATES`, `EXERCISES`, `DEFAULT_ACCESSORY_WEIGHTS`. Warm-up tiers become one
  named constant so Configure and Active agree (D6: keep Active's current T1-only behaviour as
  the default and make Configure match, since that is what is actually performed today).
- `rehydrate.ts`: `rehydratePlan(plan, loggedSets)` → plan with `completedSets` filled and the
  current exercise index. This is what makes resume work (R4).
- `logSet.ts`: `createSetLog(...)` (the `SetLog` object built at `active/page.tsx:383-407`) and
  `nextStep(plan, index)` → `"rest" | "next-set" | "next-exercise" | "done"`.
- `completeWorkout.ts`: `computeCompletion({session, plan, sets, liftStates, settings,
  recentE1RMs, now})` → `{liftStateUpdates, sessionPatch}`. One path for T1 and T2 (today two
  near-identical 37-line blocks at `active/page.tsx:638-712`), calling the existing
  `evaluateT1Progression`, `evaluateT2Progression`, `shouldFreezeProgression`.
- Move `WorkoutExerciseState` from `stores/workoutStore.ts` to `src/lib/workout/types.ts` and
  re-export it from the store so existing imports keep working.

Tests are written against today's behaviour on `main` (characterisation tests) so Stage B can
prove nothing changed. The evidence session's edits to the same logic (e1RM recording rule,
`recentE1RMs` ordering, `lib/restTimes`) are re-applied to these functions in B1, from their
merged code, not guessed now.

### A5. Data layer, `src/lib/data/` and `src/hooks/` (R8)
- `src/lib/data/`: plain async functions, the only place besides `db/` and `lib/sync.ts` that
  imports `db`. `workouts.ts` (`startWorkout`, `appendSet`, `discardWorkout`, `finishWorkout`),
  `profile.ts` (`updateSettings`), `pain.ts`, `bodyweight.ts`, `runs.ts`. They cover the 32
  direct write call sites found in pages/components. `appendSet` writes the set to `db.sets`
  **and** appends it to `workout.sets` with `synced: false` in one Dexie transaction (R4);
  `discardWorkout` deletes the workout, its sets and its e1RM rows (R5). No schema change is
  needed: `workouts.sets` is already a JSON column locally and in Postgres.
- `src/hooks/`: thin `useLiveQuery` wrappers matching current usage (11 profile, 9 workouts,
  8 liftStates, 5 bodyweight, 4 pain, 4 e1RM, 2 runs): `useProfile`, `useSettings`,
  `useLiftStates`, `useWorkout(id)`, `useCompletedWorkouts`, `useUnfinishedWorkout`,
  `useBodyweightLog`, `usePainEntries`, `useE1RMs(exerciseId?)`, `useRuns`,
  `useNextWorkout` (template, prescription, home adaptation: what `NextWorkoutCard`, Program
  and Configure each compute separately).
- Tests use `fake-indexeddb` (new dev dependency) for `lib/data`, RTL for hooks.

### A6. Tokens and shared UI (R9, R10)
- `src/app/globals.css`, additive only: `--tier-t1`, `--tier-t2`, `--tier-t3`,
  `--tier-accessory`, `--tier-warmup` and `-soft` variants, mapped in `@theme inline`;
  `success` / `warning` / `info` / `destructive` already exist and get `-soft` variants. Also
  remove the duplicated `@apply` lines at 150-155.
- New `src/lib/tierStyle.ts`: one `tierStyle(tier)` replacing the separate switch statements in
  `WorkoutMiniMap.tsx` and `ExerciseBlock.tsx`.
- New `src/components/ui/`: `tier-badge.tsx`, `callout.tsx` (variants info/success/warning/
  danger with optional actions, replacing five hand-built amber/yellow/red banners),
  `page-shell.tsx` (`PageShell`, `PageHeader`: the `mx-auto max-w-lg px-5 pt-5 pb-28` shell
  copied 19 times), `stagger.tsx` (the `animate-in fade-in slide-in-from-bottom-3` wrapper
  copied 12 times). Each with a small RTL test.

### A7. Guardrails (R8, R9)
- New `src/architecture.test.ts`: fails on `@/db/local` imports and raw palette classes under
  `src/app` and `src/components`. Starts with an **allowlist of today's offenders** so it
  passes now, blocks new ones, and shrinks to empty in Stage B. `BodyMapSVG.tsx` and
  `src/components/Anatomy/**` stay allowlisted permanently for anatomical colours.

Stage A leaves the app behaving the same except D1, D2 and D8 fixed.

## Stage B: migration (Wave 2 now for untouched files; Wave 3 after both branches are on `main`)

One commit per step, suite green at each. B5 and B6 are split across Waves 2 and 3 by file
ownership (see the wave table); B1-B4, B7 and B8 are Wave 3.

- **B1. Reconcile `lib/workout` with merged logic.** Diff the merged `active/page.tsx` against
  the A4 characterisation tests; fold in the evidence session's rule changes and
  `lib/restTimes`; update tests to the merged behaviour. (R7)
- **B2. Active workout page** uses `useWorkout`, `buildWorkoutPlan`, `rehydratePlan`,
  `createSetLog`, `appendSet`, `computeCompletion`, `finishWorkout`, `discardWorkout`. Target:
  under ~300 lines, layout and local UI state only. The store keeps transient state (timer,
  current index); the plan and logged sets come from the workout record. The anatomy slots
  (thumbnail, Form button, overview figure) and the evidence lines stay exactly where those
  sessions put them. (R2, R4, R5, R7; fixes D3, D4)
- **B3. Configure page** uses `useNextWorkout` + `buildWorkoutPlan` for its preview and saves
  the chosen home substitutes into the existing `session.modifications` array (`action:
  "substitute"`, `source: "equipment_limit"`), which `buildWorkoutPlan` reads as `overrides`.
  (R2, R3; fixes D5, D6)
- **B4. Summary and History** use `getPrescription` and `workingSetsFor` in place of their own
  stage tables and warm-up filters. (R2, R6)
- **B5. Remaining pages and components** move to hooks and `lib/data`; delete the per-page
  `initializeDatabase()` / `dbReady` state. Mechanical, file by file, allowlist shrinking. (R8)
- **B6. Colour and shell sweep**: replace palette classes with tokens, `Callout`, `TierBadge`,
  `PageShell`, `Stagger`. Largest files first: `configure/page.tsx` (16), `program/page.tsx`
  (15), `LiftResult.tsx` (10), `history/page.tsx` (9). (R9, R10)
- **B7. Surface orphaned features** on the Dashboard: `AbandonedWorkoutBanner` (now using
  `useUnfinishedWorkout` and `discardWorkout`), `InactivityBanner`, `WeighInPrompt`. (R12)
- **B8.** Empty the architecture-test allowlist; split any page still over ~400 lines
  (`settings/page.tsx` 668, `history/page.tsx` 544) into section components.

## What this unlocks (not built in this plan)

- **Facelift:** the workout screen redesign becomes a layout change to a ~300-line page; the
  Dashboard "Today" card is `useNextWorkout` + `EvidenceLine` + the anatomy figure slot.
- **Evidence session:** one place (`computeCompletion`) to wire T3 progression and deload, and
  `Callout` for advisories.
- **Anatomy session:** `PageShell`, tokens and `useCompletedWorkouts` for `/muscles`; no init
  boilerplate on new pages.
- **Recomp tracking:** `BodyweightChart` + `rateOfLoss` are already written and only need a
  hook and a slot.

## Critical files

- New: `src/lib/workout/{types,setSelectors,prescription,buildPlan,rehydrate,logSet,completeWorkout}.ts`,
  `src/lib/data/*.ts`, `src/hooks/*.ts`, `src/lib/tierStyle.ts`,
  `src/components/{DbProvider,AppChrome}.tsx`,
  `src/components/ui/{tier-badge,callout,page-shell,stagger}.tsx`, `src/architecture.test.ts`
- Stage A edits: `src/app/layout.tsx`, `src/app/globals.css`, `src/db/init.ts`,
  `src/stores/workoutStore.ts` (re-export only), `SetProgressList.tsx`, `package.json`
  (`fake-indexeddb`; the evidence session also adds two scripts here, a one-line conflict)
- Stage B edits: `src/app/workout/{active,configure,summary}/page.tsx`, the other pages, the
  Dashboard / ActiveWorkout / WorkoutSummary components
- Reused as is: `lib/progression.ts`, `lib/autoAdapt.ts`, `lib/warmups.ts`,
  `lib/workoutTemplates.ts`, `lib/exercises.ts`, `lib/e1rm.ts`, `lib/dbConversion.ts`

## Verification

- `npx vitest run` after every task; report as "X/Y tests passing (Z pre-existing failures)".
  Baseline on `main`: 429/429. `npx tsc --noEmit` and `npm run lint` (one pre-existing lint
  error in `SyncProvider.tsx`).
- Playwright at 390×844 against a local dev server with a dummy `DATABASE_URL` (never the real
  Neon database, no sync passphrase saved), one script per acceptance check:
  - R1: clear site data → `/workout/configure` → Start → first set renders.
  - R6: warm-ups on → log T1 set 1 → row reads the T1 weight and reps.
  - R11: no nav on `/workout/active`, nav on `/`.
  - R4 (Stage B): log 3 sets → reload → resumes at set 4.
  - R5 (Stage B): discard → IndexedDB `sets` count for that session is 0.
  - R3 (Stage B): home, pick alternative → Active shows it.
  - R13: full A1 workout gym and home, before and after, compare screens and the resulting
    `liftStates` rows.
- Stage B starts only after a clean run of the suite on the merged `main`.

## Risks

- **Divergence from the evidence session's logic edits** between Stage A and B: handled by B1
  and by characterisation tests that make any difference visible.
- **Writing `workout.sets` on every set** re-marks the workout row unsynced each time; the
  existing sync already pushes unfinished workouts, so this only adds small repeat pushes.
- **Stage A lands unwired code** (A4, and the workout parts of A5). It is covered by tests, and
  Wave 2 puts the hooks and tokens to use straight away, but the workout domain only pays off
  once Wave 3 runs.
- **Parallel agents drifting from the contracts.** Mitigated by the signatures-only commit,
  exclusive file lists, and the lead rejecting any branch that edits outside its lane.
- **Cost.** Ten agent runs plus three reviews, four of the ten on Sonnet and three on Opus. Waves 1 and 2 (six agents) deliver the bug
  fixes and everything the other sessions can reuse; Wave 3 can be re-scoped after their
  merge if the merged code looks different from what this plan assumes.
