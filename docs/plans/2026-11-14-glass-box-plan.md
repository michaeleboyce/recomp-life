# Glass-box coach: work packages

Design and requirements (G1 to G25): `docs/plans/2026-11-14-glass-box-design.md`.
Visual spec: `docs/plans/glass-box-mockups/` (PNG per screen; `src/` holds the markup and the
palette used to draw them, in `xmacros.ts`).
Shared types: `src/types/glass.ts`. Starting constants: `src/lib/forecast/coefficients.ts`,
`src/lib/readiness/weights.ts`. Rule stubs: `src/lib/evidence/rules/forecast.ts`,
`src/lib/evidence/rules/readinessScore.ts`.

## Rules for every package

1. Work only in your lane's files. If something outside it must change, say so in your report
   and leave it alone. Other packages are editing the rest of the tree at the same time.
2. Start from the commit named in your brief (`git reset --hard <sha>` in your own worktree).
   Commit there with conventional messages ending in
   `Co-Authored-By: Claude <your model name> <noreply@anthropic.com>`. Never push, never touch
   `main`, never use a bare `git stash`.
3. Test first. Run your own test files (`npx vitest run <paths> --maxWorkers=2`) and
   `npx tsc --noEmit`. Do not run the whole suite; the lead does that at integration.
4. Logic is pure and lives in `src/lib`: no React, no database, no `Date.now()` (take `now`).
   Weights are lbs, durations are seconds.
5. Never read `.env*`, never connect to a database. A production build, if you need one, uses
   `DATABASE_URL=postgres://dummy:dummy@localhost:5432/dummy`.
6. No colour literals in components; use tokens. No new `[param]` route folders.
7. Do not regenerate `docs/coaching-rules.md` and do not add or move `@evidence` tags outside
   your lane; list what the lead should tag. `src/lib/evidence/docs.test.ts` may fail in your
   worktree until the lead regenerates the doc: that is expected.
8. Text shown to the user is plain: no acronyms without the glossary `<Term>`, no "AMRAP" in
   new copy ("last set", "as many as you can").
9. Report in under 300 words: what you built, commits, "X/Y tests passing" for your files, the
   type-check result, anything you did differently from the brief and why, and open questions.

## Wave 1a

### forecast-models (G4, G6, G7)
Lane: `src/lib/forecast/**`; additive edits to `src/lib/projection/prOpportunity.ts` and
`src/lib/projection/trend.ts`; new `src/lib/workout/duration.ts` (move `estimateWorkoutMinutes`
out of `src/components/Today/format.ts`, which may then only re-export it).

Build, each with tests:
- `types.ts`: `ForecastSource` (what a model may see: finished workouts, bodyweight log,
  lift states, best estimated max per lift, settings, optional `readinessShift` as a fraction,
  `now`) and `ForecastKindDef { kind; ruleId: RuleId; estimand: string; resolve(...) }`.
- `reps.ts`: history of last T1 sets from finished workouts (time, weight, reps, stage).
  Index `x = weight × (1 + reps/30)`, no reps-in-reserve credit, unrounded. Level `m` and
  scatter `s` as in the design (trend when `REPS_MODEL.minTrendPoints` same-stage points fall
  in the window, using `fitTrend`; mean and wider floor for one to three; prior for none;
  scatter × `regimeChangeSdMultiplier` after a stage change, reset or long break). Chance of at
  least `k` reps `= 1 − Φ((W(1 + k/30) − m) / s)`; a pmf up to `REPS_MODEL.maxReps`; an 80%
  range; most likely count. Cutting shift only when today's phase differs from the phase most
  of the fitted sessions had (`completionContext.phaseMode`).
- New-best chance `=` the tail at `repsToBeat(W, best).reps`; pass chance `=` the tail at the
  target. Keep `prChance`'s exported category for existing callers, derived from the chance.
- `registry.ts`: `FORECAST_KINDS: Record<ForecastKind, ForecastKindDef>`. Rule ids:
  `forecast-reps` (reps, new best, pass), `forecast-session-length`, `forecast-bodyweight`,
  `projection-rate-of-gain` (estimated max in 4 weeks, through `projectE1RM`).
- `make.ts`: `makeSessionForecasts(session, plan, source): Forecast[]` with ids
  `fc:<workoutId>:<kind>[:<exerciseId>:<tier>]` (`clientId = id`, `slot = id`);
  `makeHorizonForecasts(source, newId): Forecast[]` with `slot = kind|subject|ISO week (UTC)`.
  Every row records `basis`, `inputs` (level, scatter, sample size, widening factor, readiness
  shift, phase) and `modelVersion`.
- `resolve.ts`: `resolveForecast(forecast, log, now): ForecastStatus`. Void when the workout is
  deleted, missing or unfinished-and-discarded, the lift was not reached, the lift carries a
  freeze status or load drop, the weight lifted differs from `event.weight`, or a horizon
  window has too few measurements. `earliestPerSlot(forecasts)`.
- `score.ts`: share inside the range, calibration bins for stated chances, average miss and
  bias, split by kind, lift and `basis`; `sdScaleFor(kind, record)` from `CALIBRATION`.
- `replay.ts`: walk a history in order, forecast each workout from the data before it, resolve
  from the data after it.
- Tests that must exist: contract (every kind has a resolver, an estimand and a real rule id);
  pmf sums to 1; new-best chance equals the tail at `repsToBeat`; cold-start cases; replay over
  `generateDemoData` puts 80% ranges between 70% and 90%; changing later data leaves earlier
  forecasts identical; self-correction thresholds.

### forecast-research (G11)
Lane: `docs/research/**`, `src/lib/evidence/rules/forecast.ts`, `src/lib/evidence/sources.ts`.
Follow `docs/research/ADDING_RESEARCH.md`. Questions, in order of value:
1. How much does the number of reps at a fixed load vary from one session to the next in
   trained lifters (to judge `trendSdFloorFraction` 0.042 and `fewPointsSdFloorFraction` 0.06)?
2. How accurate are rep-based estimates of a one-rep max at low reps?
3. How much does one short night reduce strength performance (to judge
   `readinessLevelShiftPerPoint`)?
4. How much does daily bodyweight bounce around its trend, and how well does a four-week
   straight-line continuation hold?
Deliver `docs/research/2026-11-forecast-models.md` (what each source found, what the app takes
from it, the value you recommend for each constant in `src/lib/forecast/coefficients.ts`, and
what stays an assumption), new entries in `sources.ts`, and the four rule stubs filled in with
honest grades. Keep them `planned`, with empty `surfaces`. Rule text reads numbers from the
constants. Open every source you cite and check it says what you claim; never cite a paper for
a claim it does not make; grade weak support `limited` and say why in `caveat`. Do not edit
`coefficients.ts`: recommend values in the note.

### readiness (G8)
Lane: `src/lib/readiness/**`, `src/lib/evidence/rules/readinessScore.ts`.
- `readinessScore(inputs, now): ReadinessScore` (type in `src/types/glass.ts`). Inputs: the
  latest sleep and stress answers (`ReadinessLog`, with `sleepMinutes` when present), days
  since the muscles in today's workout were last trained and `calculateRecoveryStatus`,
  `evaluateRunImpact`, `evaluateActivityImpact`, soreness and pain entries for the muscles
  involved, and the user's past scores. `usual` is the median of past scores, or
  `READINESS_WEIGHTS.defaultUsual`. Each contribution carries signed points and the rule id of
  its input (`readiness`, `recovery-windows`, `run-interference`, `activity-fatigue`,
  `training-with-pain`). `usual` plus the points equals the score before clamping to 0–100.
- `shouldSuggestSkippingAccessories(log)`: the rule that is inline in
  `src/components/PreWorkout/ReadinessCheck.tsx` today (under 5 hours and low energy). Do not
  edit that component; wave 2 switches it over.
- `readinessLevelShift(score)`: the fraction a forecast's level moves, from
  `REPS_MODEL.readinessLevelShiftPerPoint`.
- No function here may return or change a weight; add a test that greps the folder's exports.
- Extend `READINESS_WEIGHTS`, fill in the rule stub (stays `planned`, `heuristic`, no sources).
- Do not read the Apple Health daily table and do not touch `rules/recovery.ts`.

### theme (G14, G15, G18)
Lane: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/fonts/**`,
`src/lib/anatomy/palette.ts` and its test, `src/components/ThemeProvider.tsx`, `public/**`
(manifest, icons, `sw.js`), existing files in `src/components/ui/` except
`segmented-control.tsx`, `src/components/chart-kit/tokens.test.ts`, and the colour leaks listed
in the design (`ExerciseDemo/ExercisePhotos.tsx`, `app/plate-calculator/page.tsx`,
`Exercises/ExerciseRow.tsx`).
- Palettes come from `docs/plans/glass-box-mockups/src/xmacros.ts` (`.espresso` for dark,
  `.paper` for light, and the figure maps). Keep every existing token name; change values.
  Primary and accent become mustard in dark and espresso-on-cream in light; T1 orange, T2
  mustard, T3 teal. Charts and the anatomy heat ramp follow (ramp: burnt orange, darker in
  light mode as load rises). Update `palette.ts` and `palette.test.ts` together.
- New tokens, both themes, with `@theme inline` mappings: `--font-display`,
  `--grade-strong`, `--grade-moderate`, `--grade-limited`, `--grade-heuristic`,
  `--grade-program`, `--photo-tint`, `--stripe-1`, `--stripe-2`, `--stripe-3`.
- Fonts: Jost (display, 500–800), DM Sans (text), DM Mono (numbers), bundled through
  `next/font/local` with their licence files; `font-sans` and `font-mono` keep working and
  `font-display` is new. Get the files from the fontsource npm packages with `npm pack` into a
  temporary folder; copy only the `.woff2` and licence files; run nothing from the package.
- Headings in `page-shell`, `section-header` and `chart-kit/ChartFrame` use the display face.
- Fix the hand-coded surfaces: manifest and `themeColor` (one value, from the tokens),
  `THEME_COLORS`, icons redrawn in the new palette, service-worker cache name bumped.
- A test that reads `globals.css` and fails if body text, muted text or primary-button text
  falls under 4.5:1 on its surface in either theme.
- Run the anatomy, chart-kit and architecture tests plus a production build.

### kit (G16, G17)
Lane: new files only in `src/components/ui/` and `src/components/chart-kit/`;
`src/components/Evidence/StrengthBadge.tsx`; `src/lib/muscleLoad.ts` and its test (additive).
Match the boards in `docs/plans/glass-box-mockups/`. Tokens only (the theme package adds
`--grade-*`, `--photo-tint`, `--stripe-*`, `--font-display` under those exact names). Each
component gets a React Testing Library test.
- `ui/grade-chip.tsx`: `GradeChip({ strength, size? })`, five grades, label always shown;
  `StrengthBadge` renders it.
- `ui/trace-list.tsx`: `TraceList({ trace })` numbered steps with effect and grade chip (D2).
- `ui/why-sheet.tsx`: `WhySheet({ open, onOpenChange, title, trace, children? })` on `ui/sheet`.
- `ui/stripes.tsx`, `ui/starburst.tsx`: decorative, `aria-hidden`.
- `ui/exercise-image.tsx`: `ExerciseImage({ exerciseId, variant: "hero" | "arch" | "thumb",
  frame? })` from `getExerciseMedia`, grayscale plus a `--photo-tint` colour layer; renders
  nothing, and lets the caller fall back, when the exercise has no photo.
- `ui/workout-figure.tsx`: `WorkoutFigure({ exerciseIds, views? })`: `MuscleMap` coloured by a
  new `tieredActivationHeat(exerciseIds)` in `src/lib/muscleLoad.ts` (first id full weight,
  second three quarters, third half; highest level per muscle; never below 1 where active).
- `chart-kit/RangeBar.tsx` (low, high, point on a track), `RepForecastBars.tsx` (a bar and
  percentage per rep count, range highlighted; pure display, the rep buttons sit below it),
  `CalibrationChart.tsx` (stated chance against how often it happened, dot size by count,
  diagonal reference, text alternative), `Gauge.tsx` (half ring with a number). Plain SVG.

## Wave 1b

Both start from the branch after `main` (with favourites and Apple Health) was merged in.

### trace (G1, G2)
Lane: `src/lib/trace/**`, `src/lib/progression.ts`, `src/lib/workout/completeWorkout.ts`,
`src/lib/workout/outcomes.ts` (new), `src/lib/rebuild/**`, `src/components/Log/outcomes.ts`,
their tests, and, for step 0 only, `src/lib/evidence/rules/progression.ts` and
`src/lib/evidence/changelog.ts`.

0. Merge `fix/t3-last-set-only` (458b6cc: T3 weight goes up only when the last set reaches 25
   reps; `progressT3(liftState, exerciseSets)` with no phase argument). In `computeCompletion`
   keep that two-argument form together with the favourites code: the fallback
   `next = progressed ?? { ...liftState, synced: false }` and the guard
   `if (!progressed && heavier == null) continue;`, so a T3 lift done heavier keeps the heavier
   weight. Do not hand-merge `docs/coaching-rules.md`; take either side and leave it to the lead.
1. Before any refactor, commit a golden test: the lift states and snapshots that
   `rebuildDerived` gives for `generateDemoData` at a fixed `now`. It must pass unchanged at
   the end.
2. `evaluateT1` / `evaluateT2` return `{ state, outcome }` (`ProgressionOutcome` in
   `src/types/glass.ts`), same branch order as today; the existing exports become thin
   wrappers. T3 gets an outcome too. `computeCompletion` returns an additive `outcomes` that
   also covers partial, not done, logged-only and heavier (see `src/lib/workout/credit.ts`).
   `RebuildResult` gains `outcomes` and `before` maps keyed by workout id.
3. `describeOutcomes` moves to `src/lib/workout/outcomes.ts`, built on the outcome type;
   `components/Log/outcomes.ts` re-exports it. Before deleting the old diff-based logic, prove
   with a test that the new outcome kind equals the old one for every demo workout.
4. `src/lib/trace/`: `explainPrescription`, `explainRest`, `explainSubstitute`,
   `explainAccessoryCap`, each returning a `DecisionTrace` whose step effects, applied in
   order, give `result`. Weight steps, in this order: where the weight came from (last session
   and its sets, or the starting weight), the progression outcome (`gzclp-progression` or
   `t3-progression`), readiness (always no change; `readiness`), pain check for the muscles
   involved (no change; `training-with-pain`), phase (no change to weight; note the rest
   bonus; `rest-cut-bonus`), plates (`describePlateLoad`; a rounding step when the weight is
   not loadable), and at home the dumbbell conversion (`dumbbell-conversion`). Alternatives:
   one increment lighter and one heavier. Rest steps: base (`rest-heavy` / `rest-light`) plus
   the cutting bonus.
5. `DECISIONS: Record<DecisionKind, ...>` and `buildSessionDecisions(plan, context):
   StoredTrace[]` (weight and rest per planned lift; keep each trace small, the workout row
   is re-sent on every set).
6. Contract tests: every `DecisionKind` has an explain function; every step `ruleId` passes
   `isRuleId`; for every planned entry in the demo data the weight trace ends at the
   `buildWorkoutPlan` weight and the rest trace at `getRestSeconds`.

### ledger-plumbing (G5 storage)
Lane: `src/db/**`, `src/lib/sync/registry.ts`, `src/lib/sync/revive.ts`,
`src/lib/data/forecasts.ts` and `coachEvents.ts` (new), `src/lib/data/backup.ts`,
`src/lib/data/records.test.ts` (table list only), `scripts/sql/**`,
`src/app/api/sync/schemaSql.test.ts`, new `src/hooks/useForecasts.ts` and
`useCoachEvents.ts`, and export lines in `src/hooks/index.ts`. Tests for each.

Follow the way `favoriteWorkouts` was added (see `git log -3 --stat -- src/db/local.ts`).
- Types exist already: `Forecast` and `CoachEvent` in `src/types/glass.ts`, and
  `WorkoutSession.decisions?: StoredTrace[]`.
- Dexie `version(3)`: `forecasts: 'id, clientId, slot, kind, workoutId, exerciseId, madeAt'`
  and `coachEvents: 'id, clientId, at, kind'`. Update `src/db/local.test.ts`.
- Postgres (`src/db/schema.ts`, with `syncColumns()`): `forecasts` (slot, kind, workout_id,
  exercise_id, tier, made_at, due_at, event jsonb, prediction jsonb, basis, inputs jsonb,
  model_version), `coach_events` (at, kind, title, detail, rule_id, data jsonb), and a
  nullable `decisions jsonb` on `workouts`.
- `scripts/sql/2026-11-14-glass-box.sql`: additive only, every statement `IF NOT EXISTS`,
  safe to run twice. Fold the same columns and tables into the clean-schema script so
  `schemaSql.test.ts` passes.
- Registry entries; optional fields into `NULL_MEANS_ABSENT`; backup lists; the
  `clearAllData` table list.
- `src/lib/data/forecasts.ts`: `writeForecasts(rows)` adds rows and silently skips ids that
  already exist; it never updates. `listForecasts()`. `forecastTables()`.
  `src/lib/data/coachEvents.ts`: `recordCoachEvent(input)`, `listCoachEvents()`.
  Hooks `useForecasts()` and `useCoachEvents()` in the style of `useRecords.ts`.
- Tests: a second write of the same id leaves the stored row identical; a test that scans
  `src` and fails on `forecasts.update`, `.put`, `.modify` or `.bulkPut` outside
  `src/lib/data/forecasts.ts`; registry and SQL tests as for the existing tables.
- Do not call these from `startWorkout` or anywhere else; the lead wires them in.
