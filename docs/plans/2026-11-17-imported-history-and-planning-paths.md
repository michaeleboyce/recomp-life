# Imported history on every screen, and one planning path

Status: findings and plan of 2026-11-17. P1, P2 and P3 are built and merged (see "Status
after P1 to P3"); R1, R2 and F3 are done (see "Status of R1, R2 and F3"); R3 is deferred. Michael
approved the order on 2026-11-17.

This repository is public. Nothing here describes the owner's training data beyond the fact
that it exists; counts, dates and weights stay out of the repo.

## Where things stood on 2026-11-17

Deployed to production at `235c2b9` (Vercel):

- The strength model (`docs/plans/2026-11-15-strength-model-design.md`) and history import
  (`docs/plans/2026-11-15-history-import-design.md`), with every finding of the independent
  review fixed: paged pull, home rotation with weight per set, Fitbod cardio rows that share a
  start time, undo and re-import from Recently deleted, favourites from working sets only,
  on-the-spot home weight changes, working-set credit, capped T3 wording.
- Two additive live-database scripts, applied before the deploy:
  `scripts/sql/2026-11-16-pull-pages.sql` (`server_updated_at` on every synced table) and
  `scripts/sql/2026-11-16-import-batches.sql` (`import_batch_id` on runs and activities).
- A fix found while merging: a device whose database was emptied or recreated kept its pull
  progress in localStorage and skipped older rows. Seeding an empty database now resets the
  pull progress (`src/db/init.ts`, test in `src/db/init.test.ts`).
- The owner's history preloaded with `scripts/import-history.ts --write` (every row stamped by
  the server, so already-synced devices receive it).

Committed, not yet deployed: Next.js 16.4.6 (`506e313`) for a moderate advisory
(root-params disclosure through `unstable_cache` with `use cache`; the app uses neither).
It ships with P1 and P2.

Devices: after each deploy, close and reopen the installed app once. Paged pull changed the
sync protocol, so the iPhone app also needs a rebuild (`npm run build:native`) before its
next install.

## Audit: where imported history is used

Checked in the code and on the live site (in the owner's browser, with his synced data).

| Screen or calculation | Reads imported history? |
|---|---|
| Muscles tab: this week, recovery, strength index | Yes |
| Settings → Import history: starting-weight suggestions | Yes |
| Log | Imported runs and activities only; no imported strength sessions (I10 not built) |
| Lift page `/progress/lift/[id]`: estimated max, stats, bests, sessions | No ("No sessions yet") |
| Projection page, Progress → Strength tab | No ("No lifts logged yet") |
| Today: estimated-max cards, This week, Muscles This Week | No |
| Planning: home seeding (H3), re-entry (H6), learned ratios | No: `useStrengthSets` reads app workouts only, so home exercises with imported history show "First time" |
| Forecast tiles and forecasts written at start | No, and planned on a separate path (see R1) |

Root cause: two evidence sources exist. `useStrengthEvidence` (app plus imported) is read only
by the starting weights and the muscle strength index; every other screen and the planner
read `useStrengthSets` or `useMetricSource`, which see app workouts only. I9 ("pooled estimate
moves with imported history") was met in the library but not wired to the planner, and I10
(imported sessions in the Log and lift history) was never built.

## Packages now (on top of `506e313`)

### P1: imported sessions in the Log and lift history (I10)

- Log: imported strength sessions by date, labelled "Imported" with the source app, an
  Imported filter, paged rendering for about a thousand entries; imported cardio labelled too.
- A read-only detail view per session (no new dynamic route): exercises in file order, sets as
  lifted (per hand where it applies), warm-ups, drops, effort words, the library exercise each
  name counts as.
- Lift history lists (`src/components/Lift/sessions.ts`, `SessionList.tsx`) include imported
  sessions of that exercise, labelled, with a control to hide them.

### P2: imported history in the numbers and the planner (I9)

- Lift pages, projection, Strength tab and Today's cards include imported sets, marked as
  imported, with a control to hide them. Imported bests are labelled, never shown as in-app
  new bests.
- One combined evidence function (app plus imported, names resolved with the remembered
  choices) for every planning path: `useNextWorkout`, `useUpcomingWorkouts`,
  `useWorkoutSetup`/`planWorkoutStart`, `useActiveWorkout`, the ledger's `nextWorkoutFrom`
  and `strengthSetsFrom`, the forecasts written at start, the why sheet, the home version.
- Unchanged: rotation, GZCLP progression, stages and failure counts, the forecast ledger and
  `repsToBeat` read app workouts only (import decision 2). Hand-set weights still win. Barbell
  weights change only through progression and starting weights the owner confirms.
- Acceptance: with made-up imported history, Today's rows, the forecast's plan, the Configure
  plan and the plan recorded at start give identical weights and schemes for every lift, at
  home and at the gym. Golden rebuild fixtures and replay calibration unchanged.

## Next: one planning path (from an outside review, verified)

An outside review asked that "why is this the next exercise, weight and rep target?" be
answerable by following one path through the code. Each claim was checked against `235c2b9`.

### R1: resolve the next workout once and pass it down (approved, after P1 and P2)

Verified: Today's hero plans the next workout with `useNextWorkout(location)`
(`src/components/Today/NextWorkoutHero.tsx`), and its forecast tiles plan it again with
`useTodayForecast` → `todayForecastFrom` → `nextWorkoutFrom(records, location)`
(`src/hooks/useTodayForecast.ts`, `src/lib/data/forecasts.ts`), from a separate read of the
records with its own strength sets; readiness is read on that second path too. Configure builds
a whole plan with `useNextWorkout()` only to read `templateId`
(`src/components/PreWorkout/useWorkoutSetup.ts`). The same hook is also called by
`GlanceTiles`, `QuickAddSheet`, `LiftWhySheet`, `useHomePlanContext` and the More page.

This already caused a near miss: P2 would have changed the lift rows' home weights but not the
forecast's, had the brief not been widened.

Plan: one pure function resolves the open or next workout (template, location, resolved lift
and variant states, re-entries, plan) from one set of inputs; Today calls it once and passes
the result to the lift rows, forecast tiles and readiness; the ledger writer and Configure use
the same function; Configure reads the rotation's template id directly. Acceptance: a contract
test that every consumer gets the same plan object for the same inputs, and the golden and
replay tests unchanged.

### R2: derive the prescription and the plan from one resolution (approved, after P1 and P2; includes F3)

Verified: `planWorkoutStart` (`src/lib/workout/startPlan.ts`) calls `buildWorkoutPlan` and
`prescribedFor` (`src/lib/workout/planEdits.ts`) separately, and both work out weights and home
substitutes. Progression compares the program's prescription with what was planned and done,
so they must agree. The rotation stall the review found (a home T1 judged against the barbell
prescription) was this kind of disagreement.

Plan: resolve each lift once (state, exercise performed, weight, scheme, reason), record the
prescription from that resolution, then apply the user's edits to produce the plan. Acceptance:
for every demo session and every home/gym and edit combination, the recorded prescription and
the plan before edits are equal by construction; golden rebuild unchanged.

R1 and R2 go to one agent, after P1 and P2 are merged (they touch the same files), with tests
that pin today's numbers first, so the refactor changes no weight, scheme or rest anywhere.

### Status of R1, R2 and F3 (done, 2026-11-17)

- Pinned first: `src/lib/workout/planningPaths.characterisation.test.ts` records, for every
  session start of the demo log at home and at the gym, plain and with made-up imported
  sessions, hand-set weights, next-session set plans, a Configure substitute and
  Edit-workout edits: the start plan, the recorded prescription (with `.home`),
  `nextSetPlanEdits`, re-entries, Today's rows and forecast plan, the coming workouts and
  the resumed plan. It passed unchanged after every refactor commit.
- R2 done: `resolveLifts` (`src/lib/workout/liftResolution.ts`) resolves each program lift
  once (`LiftResolution`: program lift, tier, exercise performed, weight as lifted,
  scheme, barbell weight, seed, re-entry). `planWorkoutStart` reads: resolve the lifts
  (`resolveReentry`, `resolveLifts`), record the prescription (`prescriptionOf`), apply
  the edits (`planFromLifts`, then `withPlanEdits`: set plans before Edit-workout edits).
  `buildWorkoutPlan` and `prescribedFor` are views of the same resolution. Test:
  `liftResolution.test.ts` (prescription equals the plan before edits, every case).
- R1 done: `resolveNextWorkout` (`src/lib/workout/nextWorkout.ts`) is the one function that
  plans the next workout, from one input record (completed workouts, lift and variant
  states, combined evidence, settings, location); it is `dueTemplateId` then
  `planWorkoutStart`. `useNextWorkout`, the ledger's `nextWorkoutFrom`,
  `projectUpcomingWorkouts` (its first workout) and `describeNextWorkout` all go through
  it. Today's hero calls `useTodayWorkout` once: `nextWorkoutFrom` gives the lift rows'
  plan, and the same plan is handed to `todayForecastFrom` and `readinessTodayFrom`.
  `next.prescribed` replaces `nextPrescriptionFrom`. Configure, GlanceTiles and the More
  page read the due day with `useDueTemplateId` (`dueTemplateId`, `src/lib/workout/rotation.ts`).
  Contract test: `nextWorkout.test.ts`. Still calling `useNextWorkout` for the template
  id only: `QuickAddSheet` (its tests mock the hook). The open workout's plan on Today
  (`useOpenPlan`) is `planForSession` without variant states, as before.
- F3 done: `resolveSavedSession` (`src/lib/workout/savedSession.ts`) is the one reading of a
  saved session's `prescribed` (and `.home`), used by `planForSession` (resume), the
  rebuild's rule 4 (`readSavedSession` in `src/lib/rebuild/fold.ts`) and the forecast
  replay (`anchorHomePrescriptions`). The rule for an equipment change: a saved session
  keeps the weight it recorded (a stored 70 lb home weight resumes at 70 after the
  heaviest dumbbell drops to 50, and finishing judges the sets against 70); the weight
  display shows a plain note (`equipmentLine`) and the set weight can still be changed.
  Parity test: `savedSession.test.ts`. Known limit: when a stored home exercise is no
  longer offered, the lift is done as another one the session did not record; a
  never-used one is seeded from combined evidence on resume but from the app's sets in
  the rebuild.

### How a workout is planned

Next exercise, weight and reps, in order:

1. Which day: `dueTemplateId` (`src/lib/workout/rotation.ts`) over `foldRotation`
   (`src/lib/workout/credit.ts`).
2. The inputs, once: `resolveNextWorkout` (`src/lib/workout/nextWorkout.ts`), fed by
   `useNextWorkout` / `useTodayWorkout` (hooks) or `nextWorkoutFrom`
   (`src/lib/data/forecasts.ts`); Configure feeds `planWorkoutStart` directly with its
   choices.
3. Re-entry after the other location: `resolveReentry` (`src/lib/workout/reentry.ts`).
4. Each lift: `resolveLifts` (`src/lib/workout/liftResolution.ts`): the barbell
   prescription from the stage (`getPrescription`, `src/lib/workout/prescription.ts`);
   at home the exercise and its own weight and scheme (`chooseHomeVariant`, seeding with
   `seedVariantState`, `src/lib/workout/variant.ts`).
5. The prescription stored at start: `prescriptionOf` (same file).
6. The plan: `planFromLifts` (warm-ups, accessories), then `withPlanEdits`: next-session
   set plans (`nextSetPlanEdits`, `src/lib/workout/nextSetPlans.ts`), then Edit-workout
   edits (`applyPlanEdits`, `src/lib/workout/planEdits.ts`).
7. Once started: `resolveSavedSession` (`src/lib/workout/savedSession.ts`) reads the
   stored prescription back for resume (`planForSession`) and the rebuild.

### R3: one owner for each piece of active-workout state (deferred)

Partly verified: `useActiveWorkout` (`src/components/ActiveWorkout/useActiveWorkout.ts`) reads
the start time from the Zustand store with a fallback to the saved session, and keeps the
viewed entry, pending drop and rest timer in the store (`src/stores/workoutStore.ts`) beside
local React state. The proposed rule: the saved session owns what happened, one draft owns the
next set (weight, reps, effort), the timer owns the rest countdown. Deferred because the screen
works and is well covered by tests (drop sets, weight per set, corrections); revisit when that
screen next changes.

## Reliability findings from a second outside review (verified)

The same review reported five reliability problems, reproduced on its side; each was checked
against the code at `235c2b9`.

| # | Finding | Verified | Risk |
|---|---|---|---|
| F1 | The Exercises list writes preferences straight to the profile with `synced: false` and no new `updatedAt` (`src/app/exercises/page.tsx`), unlike `updateSettings` (`src/lib/data/records.ts`), which stamps the edit. The server accepts it (equal stamp), but another device keeps its own copy (a pull overwrites only on a newer stamp). | Yes | A preference set on one device silently never reaches the others |
| F2 | After a pull, derived tables are rebuilt only at the end of a complete pull that inserted or changed workouts or adjustments (`src/lib/sync.ts`). A page merged before the connection drops, or a rebuild that throws, leaves lift states and estimated maxes stale, and the next sync with no new rows does not rebuild. | Yes (structure; reproduced by the review) | Wrong next weights until some later change triggers a rebuild |
| F3 | Resume (`src/lib/workout/planForSession.ts`) and history replay (`src/lib/rebuild/fold.ts`) each apply stored home prescriptions in their own code. The review reproduced a saved 70 lb home prescription resuming at 50 lb after the equipment cap changed. | Yes (two implementations) | A resumed workout can show a different weight from the one recorded and credited |
| F4 | Backup restore checks only that every row has a string id (`src/lib/data/backup.ts`); a backup with an id-only weigh-in parsed and replaced the weigh-in history. | Yes | A damaged or hand-edited backup can wipe real history |
| F5 | No CI. ESLint reports nine errors in vendored Draco files under `public/` and one in `src/app/weigh-in/page.tsx` (clock read during render); one drop-set test in `src/app/workout/active/page.test.tsx` clicks a button that can still be disabled and fails under load. | Yes | Regressions reach `main` unchecked |

### P3: reliability fixes (now, in parallel with P1 and P2; no shared files)

- F1: one data-layer action for exercise preferences (read the latest settings and stamp the
  edit in one transaction), used by the Exercises list and the exercise detail screen; a
  two-device sync test.
- F2: a persisted "rebuild needed" marker written in the same transaction as any merged page
  of a table that feeds the rebuild, cleared only after a successful rebuild; checked at the
  start of every sync and at app start. Tests for a dropped connection between pages and for
  a rebuild that throws.
- F4: per-table validation of required fields, types and dates before the replacing
  transaction opens, with explicit handling of version 1 and version 2 backups; nothing is
  replaced when any row fails, and the message names the table.
- F5: ignore the vendored Draco files in ESLint, move the weigh-in clock read out of render,
  make the drop-set test wait for the button to be enabled, and add a GitHub Actions check on
  pushes and pull requests that runs type-checking, lint and the test suite.

F3 joins R2 (one interpretation of a saved workout, shared by start, resume and replay, with a
parity test that runs the same saved session through resume and replay, and an explicit rule
for an equipment change after a session started).

## Status after P1 to P3

Merged on one integration branch with the Next.js patch: full suite 4767/4768 passing
(1 skipped, 0 pre-existing failures), type-check clean, `npx eslint .` 0 errors, production
and iPhone builds pass.

- P1 (I10): imported sessions in the Log with an Imported filter and paging (60, then "Show
  more"); a read-only detail sheet; imported rows in the lift and exercise session lists with
  a "Hide imported" control. `import-effort-words` switched to active (the detail shows them).
- P2 (I9): imported points on the lift charts (dashed, hollow, labelled), projection, Strength
  tab and Today's cards, "Best before ReComp", a "Show imported history" switch; `useStrengthSets`
  removed so every planning path, including the ledger's `nextWorkoutFrom`, reads one combined
  evidence set; `src/hooks/planningPaths.test.tsx` shows Today's rows, the forecast plan,
  Configure, the recorded prescription and the active workout agree at home and at the gym.
  Planning numbers move only when imported sessions exist (first home weights and the
  re-entry limit). Rules strength-pooling, transfer-ratio, home-progression and e1rm-estimate
  updated, with changelog entries.
- P3: F1 `setExercisePreference` through `updateSettings`; F2 a local-only `syncMeta` table
  (Dexie version 6) holding a rebuild marker written with each merged workouts or adjustments
  page and cleared only after a successful rebuild, checked after every pull, at the start of
  every sync and at app start; F4 per-table backup validation before any replacement; F5
  lint ignores (vendored Draco, `ios/App/App/public`), the weigh-in clock read, the drop-set
  test wait, and `.github/workflows/ci.yml`.

Live check on 2026-11-17 (production at `1c36cbd`, the owner's synced data, in his browser):
the bench page lists the imported sessions with "Hide imported", shows an imported estimated
max and "Best before ReComp", and a learned DB bench ratio "from 20 pairs of your sessions";
the Strength tab and Today's estimated-max cards read imported history; the Log has the
Imported filter, paging and labelled imported strength sessions; Today names the latest
imported session of a home exercise instead of "First time".

Found in that check (to fix next, before R1 and R2):

- **F6: a home exercise's first weight ignores that exercise's own history.** Today showed
  a Bulgarian split squat planned at about twice the per-hand weight of its latest imported
  session, beside the text naming that session. The first home weight is still seeded from
  the program lift's pooled estimate through the exercise's starting ratio (H3), even when the
  exercise itself has recent history. Rule to adopt: when the home exercise has its own
  logged or imported sets within the evidence window, seed from that exercise's own estimate
  (same recency rules), and fall back to the pooled estimate through the learned or starting
  ratio only when it has none; the "from your history" text and the why sheet must show the
  numbers the weight came from. Acceptance: a test with made-up history where the exercise's
  own sets and the barbell estimate disagree, at home, through every planning path
  (`src/hooks/planningPaths.test.tsx`). Needs a changelog entry for `home-progression`.
- A home exercise whose history is under another name (for example a one-arm dumbbell row)
  still says "First time"; check the name mapping for it.
- The Strength tab rows show "–" for lifts whose latest estimate is outside the selected
  range while the total above them counts it; say which range the row uses, or show the
  latest estimate with its date.

Left for later (not blocking):

- Learned ratios (from the owner's own imported dumbbell and barbell pairs) are shown on the
  lift page but not yet used for a first home weight; F6 decides the order (own history, then
  learned ratio, then starting ratio).
- Still app-only: the exercise page chart, the weekly review, insights and the Strength tab's
  recovery rows.
- The lift page's "Show all" renders every session (a few hundred for a long history); page
  it if it is slow on the phone.

## Open items for the owner

- Settings → Import history: confirm or edit the starting-weight suggestions. Guessed exercise
  names can be reviewed by choosing the same export again (it adds nothing twice).
- Rebuild and reinstall the iPhone app after P1 and P2 deploy.
- Account security (outstanding): a long sync passphrase (then enforce the minimum length),
  two-factor sign-in on Vercel, Neon and GitHub, Neon password rotation and a least-privilege
  app role, Vercel environment variables scoped per environment.
