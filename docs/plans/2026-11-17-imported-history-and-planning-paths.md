# Imported history on every screen, and one planning path

Status: findings and plan of 2026-11-17. Packages P1, P2 and P3 are being built; R1 and R2
(with F3) are approved to follow them; R3 is deferred. Michael approved the order on
2026-11-17.

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

## Open items for the owner

- Settings → Import history: confirm or edit the starting-weight suggestions. Guessed exercise
  names can be reviewed by choosing the same export again (it adds nothing twice).
- Rebuild and reinstall the iPhone app after P1 and P2 deploy.
- Account security (outstanding): a long sync passphrase (then enforce the minimum length),
  two-factor sign-in on Vercel, Neon and GitHub, Neon password rotation and a least-privilege
  app role, Vercel environment variables scoped per environment.
