# ReComp Life: the glass-box coach

Mid-century look, photo-led, every number explained, every prediction scored.
Supersedes the UI-refresh plan that was in this file (that work is live on `main` at `0e4ed2e`).

## Context

Michael chose the direction from the mock-up canvas
(https://claude.ai/artifact/1VDfH8psrEHJ6rKm9JqamG): build **Option D** (glass-box coach in
the mid-century look), use **Option E** (field manual) as the light theme and the style of the
"why" sheets, keep **Option F** (scoreboard tiles) for dashboards later. His vision: "for the
wonk who wants true algorithmic integration of all of the things ... predict all the things
even if it's not always 100% correct and explain all the adjustments it's making and the
research that underpinned it". He asked for a spec first, then an agent team, done properly,
at the best cost and speed. I read "maximize cost and speed" as: lowest spend and shortest
wall-clock that still meets the quality bar.

What the code does today (three research passes and one design review, 2026-11-13):

| Area | Today | Gap |
|---|---|---|
| Decisions | `buildWorkoutPlan`, `evaluateT1/T2Progression`, `getRestSeconds` return values with no reason; `describeOutcomes` rebuilds pass/miss/reset after the fact, in `components/Log` | No "why" for a planned weight, scheme or rest |
| Predictions | `prChance` (a category from the median of 5 rep counts, ignores the weight), `projectE1RM` (range), `estimateWorkoutMinutes`, insights | None is stored, so none can be scored |
| Adjustments | `liftAdjustments` table (start/manual/decay/import); rule changes in `evidence/changelog.ts` | Settings changes and forecast revisions leave no record; no single log |
| Readiness | Sleep and stress answers; one inline rule in `ReadinessCheck.tsx` | No score, no contributions, rule not in `src/lib` |
| Research | 30 graded rules, contract-tested, `/research` page | No per-grade chip, no "your own numbers" |
| Look | ~100 colour tokens per theme, two bundled fonts, sage accent; almost no hard-coded colour | New palette, display font, photo treatment, icons |

**Outcome:** four promises, each enforced by tests: every decided number has a why, every
prediction is stored before the result and scored afterwards, every adjustment is logged with
its reason and evidence grade, and the user can override anything.

## The glass-box contract (the spec's yardstick)

1. **Decide → trace.** Anything the app decides (weight, scheme, rest, substitute, accessory cap)
   comes with ordered steps that reproduce the result.
2. **Predict → ledger → score.** Anything the app predicts is a registered forecast kind with a
   model, a resolver and an evidence rule. It is written once, before the outcome exists.
3. **Adjust → log.** Every change to the plan, a forecast or a rule shows in one log.
4. **Honest grades.** A new coefficient has a cited source or is graded `heuristic`, and says so.
5. **User has the final say.** Overrides are recorded and never count against the record;
   readiness and forecasts never change a weight on their own.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| G1 | Decision trace for every decided number: weight, scheme, rest, substitute, accessory cap | A contract test lists decision kinds and fails if one has no `explain*`; the trace's final value equals `buildWorkoutPlan` / `getRestSeconds` for every demo entry |
| G2 | Progression returns its outcome (passed, stage change, reset, held, partial, not done, T3 up) with a rule id | Existing tests unchanged; golden test: `rebuildDerived(generateDemoData(...))` identical before and after; outcome kind equals today's `describeOutcomes` for every demo workout |
| G3 | The trace shown at workout start is saved with the workout, in its own field | `WorkoutSession.decisions` present after `startWorkout`; the Log shows the same text later even after a rule constant changes |
| G4 | Forecast registry. First kinds: reps on the last T1 set (distribution), chance of a new best, chance the lift passes, session length, estimated max in 4 weeks, bodyweight in 4 weeks | Contract test: every kind has a model, a resolver, a declared quantity and a real rule id; new-best chance equals the distribution's tail at `repsToBeat`; probabilities sum to 1 |
| G5 | Forecast ledger: synced, written once before any set exists, never updated; status, outcome and score are worked out on read from the log | Scripted: start → rows exist; finish → resolved; edit a set → outcome changes, row untouched; discard → void; no `update/put/modify` on the table outside the writer |
| G6 | Track record: share of results inside the range, calibration of stated chances, average miss and bias, by kind, lift and how much history the forecast had | Unit tests; replay of demo history puts 80% ranges between 70% and 90%; changing later data leaves earlier forecasts unchanged |
| G7 | Self-correction: a kind's range widens (bounded 1× to 2×) once about 20 resolved forecasts show it was too narrow, and the log says so | Unit test on thresholds; entry appears in the adjustment log |
| G8 | Readiness score with a contributions list; shifts forecasts only; the existing sleep rule moves into `src/lib` | Contributions sum to the score; no code path from readiness to a weight; rule graded `heuristic` |
| G9 | Adjustment log: one feed of progression outcomes, lift adjustments, rule changes, forecast revisions, overrides and coach events, each with reason, grade and link; undo where a clean inverse exists | Demo data shows every source; undo of a decay adjustment restores the weight |
| G10 | Override from the why sheet (lighter, planned, heavier, with the new-best chance for each); progression carries on from what was lifted; an overridden forecast is void, not a miss | Scripted: choose 210, finish; log shows the override; track record unchanged |
| G11 | Every new coefficient has a rule with a source or a `heuristic` grade, a changelog entry and a research note | Evidence contract tests pass; `docs/coaching-rules.md` regenerated |
| G12 | "Your own numbers" on rule pages for at least three rules (rest length, a run the day before, short sleep), hidden below a minimum sample | Unit tests incl. the sample guard |
| G13 | Second set of forecasts: stall risk, lighter-week risk, milestone dates, muscle ready-by | Same contract test as G4; shown on Forecasts |
| G14 | Tokens: espresso (dark) and paper (light) palettes, tier colours, chart tokens, anatomy heat ramp | Text contrast AA in both themes (scripted check); chart and anatomy token tests updated and passing |
| G15 | Fonts bundled locally with licences: Jost (display), DM Sans (text), DM Mono (numbers); new `--font-display` | Build has no network font fetch; licences in `src/app/fonts/` |
| G16 | Imagery: every workout card shows its main lift's photo (duotone, arch or hero) and the 2D muscle figure with tier-weighted brightness; figure-only fallback | All four workouts render on Coming up; an exercise without a photo falls back cleanly |
| G17 | Kit additions: `GradeChip`, `TraceList`, `WhySheet`, `RangeBar`, `RepForecastBars`, `CalibrationChart`, `Gauge`, `Stripes`, `Starburst`, `ExerciseImage` | Each has a test; no colour literals (existing token tests) |
| G18 | PWA surfaces match: manifest, theme-color, icons, service-worker cache version | Manifest and meta agree with tokens; cache bumped |
| G19 | Today (board D1) and Coming up (board B2 in the new look) | Start button in the first viewport at 390×844; each lift row has a one-line reason and a why link |
| G20 | Why sheet (D2) opens from Today rows, the active weight, the rest timer, readiness and every forecast | Scripted taps on each entry point |
| G21 | Workout flow: active set with the rep forecast above the rep buttons (D3), rest with reasons (D4), complete with forecast against result and what changed (D5) | Scripted workout end to end |
| G22 | Readiness (D6), Forecasts (D7), Track record (D11) | Render from demo data and from an empty database (with an honest "not enough history yet" state) |
| G23 | How the app decides (D8), Adjustment log (D9), rule page with own numbers (D10) | Counts on D8 come from the registry, not typed in |
| G24 | Every other screen adopts the look; light theme pass; motion (rest ring, figure fill, new-best count-up) honours reduced motion | Screenshot pass, dark and light, of every route |
| G25 | No regression; works offline and in the static iPhone build | Full suite green; a test fails on any new `[param]` route without `generateStaticParams`; nothing new depends on a server route |

## Architecture

All new logic is pure and lives in `src/lib`; stores stay UI-only.

### Decision trace: `src/lib/trace/` (G1–G3)
```ts
type TraceStep = { id: string; title: string; detail: string;
                   effect: { op: "start" | "add" | "none" | "round" | "set"; value?: number; unit: Unit };
                   ruleId?: RuleId };
type DecisionTrace = { subject: { kind: "weight" | "scheme" | "rest" | "substitute" | "accessoryCap";
                                  exerciseId?: string; tier?: Tier };
                       result: number | string; steps: TraceStep[]; alternatives?: Alternative[] };
```
- `explainPrescription`, `explainRest`, `explainSubstitute`, `explainAccessoryCap`: derived
  live. One copy, with the text as shown, is saved at start in a new field
  `WorkoutSession.decisions` (not in `prescribed[]`, which is the rebuild anchor). That copy is
  the only stored trace, so a later change to a constant cannot rewrite what the app said.
- Progression: add `evaluateT1` / `evaluateT2` in `src/lib/progression.ts` returning
  `{ state, outcome }` with the same branch order; today's exports become
  `(...a) => evaluateT1(...a).state`. `computeCompletion` gains an additive `outcomes`, and
  `RebuildResult` (`src/lib/rebuild/`) gains `outcomes` and `before` maps.
  `describeOutcomes` then moves from `components/Log/outcomes.ts` into lib on the same type.
- Reuse: `getPrescription`, `getRestSeconds`, `hasCuttingRestBonus`, `getRestEvidenceId`,
  `describePlateLoad`, `adaptExerciseForHome`, `getPhaseAccessoryCap`, rebuild `snapshots`.

### Forecasts: `src/lib/forecast/` and a `forecasts` table (G4–G7, G10, G13)
```ts
interface Forecast extends Stamped {              // write-once
  id; clientId; slot; kind; workoutId?; exerciseId?; madeAt; dueAt;
  event: { type: "amrapReps" | "repsAtLeast" | "durationSeconds" | "e1rmLevel" | "bodyweightMean";
           weight?: number; reps?: number; windowDays?: number };   // in raw log terms
  prediction: { point; low?; high?; probability?; pmf?: number[]; unit };
  basis: "prior" | "persistence" | "trend" | "regime-change";
  inputs: Record<string, number | string | null>; modelVersion: string; synced: boolean }
type ForecastStatus = { state: "open" } | { state: "void"; reason: string }
                    | { state: "resolved"; value: number; inside?: boolean; hit?: boolean };  // derived
```
- **Stored: the prediction only. Derived on read: status, outcome, score** (`resolve(forecast,
  log)`). Nothing to keep in step when a workout is edited, deleted or restored, and no device
  can overwrite another's outcome.
- **Ids.** Session forecasts: `fc:<workoutId>:<kind>[:<exerciseId>:<tier>]`; only the device
  that starts the workout writes them, and never after a set exists. Horizon forecasts: random
  id plus `slot` (kind, subject, ISO week); readers score the earliest per slot, because the
  sync rules would otherwise let a later device replace an earlier prediction.
- **Void, never scored:** workout deleted or discarded, lift not reached, a freeze or load drop
  on the lift, weight lifted differs from the forecast weight (an override), too few
  measurements in a horizon window.
- **Reps model.** Data: T1 last sets from finished workouts (time, weight, reps, stage). Index
  `x = w × (1 + r/30)` with no reps-in-reserve credit, so it predicts what will be logged and
  matches `repsToBeat`. Level and scatter: trend fit when there are four or more same-stage
  points in eight weeks; the mean with a wider scatter for one to three; a prior for none;
  1.5× scatter after a stage change, reset or three weeks off. `P(R ≥ k)` from a normal tail;
  new-best chance is the tail at `repsToBeat`; pass chance is the tail at the target. The
  cutting shift applies only when the phase differs from the fitted sessions' phase.
  Cold-start numbers, the 1.5×, the readiness coefficients and normality are graded `heuristic`.
- Hook points (short calls into a new `src/lib/data/forecasts.ts`): `startWorkout` and
  `finishWorkout` in `src/lib/data/workouts.ts`, `logBodyweight` in `src/lib/data/records.ts`.
  `logEdits.ts`, `derived.ts` and `sync.ts` are not touched.
- Reuse: `fitTrend`, `projectE1RM`, `measureBaseline`, `PROJECTION_COEFFICIENTS`,
  `calculateWeeklyRateOfLoss`, `estimateWorkoutMinutes` (moves to `src/lib/workout/duration.ts`),
  `repsToBeat`, `MetricSource`.
- `score.ts`: coverage, calibration bins, miss and bias, split by `basis`. The same model
  functions drive the screens, the ledger writer and a replay harness over `generateDemoData`.

### Readiness: `src/lib/readiness/` (G8)
`readinessScore(inputs) → { score, usual, contributions[] }` from the sleep and stress answers,
rest days with `calculateRecoveryStatus`, `evaluateRunImpact`, `evaluateActivityImpact` and
soreness entries. New rule `readiness-score` (`heuristic`); each contribution also cites the
existing rule for its input. The Apple Health daily table stays display-only in this version.

### Adjustment log: `src/lib/adjustments/feed.ts` and a small `coachEvents` table (G9)
A merged feed, almost all derived: progression outcomes (rebuild), `liftAdjustments` rows,
`EVIDENCE_CHANGELOG`, forecast revisions and self-corrections (differences between consecutive
ledger rows), weight overrides (plan against what was lifted). Stored coach events cover only
what cannot be derived: behaviour-changing settings changes and accepted or dismissed advisories.

### Look (G14–G18)
- `src/app/globals.css`: replace the sage tokens with espresso and paper sets; keep every
  token name so screens need no edits. Fonts through `next/font/local` as today.
- Anatomy ramp moves to burnt orange: `globals.css`, `src/lib/anatomy/palette.ts` and
  `palette.test.ts` in step. Tier-weighted heat becomes a lib function beside
  `combinedActivationHeat` in `src/lib/muscleLoad.ts`.
- `ExerciseImage` wraps `getExerciseMedia` (`src/lib/exerciseMedia.ts`) with the duotone
  treatment. `GradeChip` replaces the dots in `Evidence/StrengthBadge`.
- Leaks to fix by hand: `public/manifest.json`, `layout.tsx` themeColor, `ThemeProvider`
  `THEME_COLORS`, icons, `public/sw.js` cache name, black/white classes in `ExercisePhotos`,
  the plate calculator and shadcn scrims, `ExerciseRow` green classes.

### Routes (all static-export safe)
`/` Today · `/readiness` · `/progress/forecasts` · `/progress/forecasts/record` ·
`/more/how-it-works` · `/more/adjustments` · `/research?rule=<id>` (existing page, upgraded).
The why view is a sheet, with `?why=` on the host page so it can be linked.

## Execution

Lead (this session): spec, contracts, briefs, integration, the short hook calls, browser
verification, deploys. Agents work in their own worktrees on exclusive files and never push.

**Step 0, spec.** `docs/plans/2026-11-14-glass-box-design.md` and `-plan.md` on a new branch
`feat/glass-box`, with the chosen mock-up boards saved under `docs/plans/glass-box-mockups/`
as the visual spec.

**Step 1, contracts commit (lead).** Types and signatures only, in the files several lanes
share: `src/types/index.ts`, `src/lib/forecast/types.ts`, `src/hooks/index.ts`,
`src/lib/routes.ts`, `src/lib/evidence/rules/index.ts`, token names, kit component props, route
skeletons. New rules are registered as `planned` and switched to `active` when their screen lands.

| Wave | Agent | Model | Lane (exclusive files) | Requirements |
|---|---|---|---|---|
| 1a | `forecast-models` | Fable | `src/lib/forecast/**`, `projection/prOpportunity.ts`, `projection/trend.ts`, `workout/duration.ts` | G4, G6, G7 |
| 1a | `forecast-research` | Opus | `docs/research/**`, new rule files, coefficient constants | G11 |
| 1a | `readiness` | Fable | `src/lib/readiness/**`, `evidence/rules/readiness.ts` | G8 |
| 1a | `theme` | Opus | `globals.css`, `layout.tsx`, `src/app/fonts/**`, anatomy palette, PWA files, colour leaks | G14, G15, G18 |
| 1a | `kit` | Opus | new files in `src/components/ui/` and `chart-kit/`, `Evidence/StrengthBadge` | G16, G17 |
| 1b | `trace` | Fable | `src/lib/trace/**`, `progression.ts`, `workout/completeWorkout.ts`, `rebuild/**`, `components/Log/outcomes.ts` | G1, G2 |
| 1b | `ledger-plumbing` | Sonnet | `src/db/**`, `sync/registry.ts`, `sync/revive.ts`, `data/{forecasts,coachEvents,backup}.ts`, `scripts/sql/**`, new hook files | G5 (storage) |
| 2 | `adjustment-feed` | Fable | `src/lib/adjustments/**` | G9, G10 |
| 2 | `today` | Opus | `src/app/page.tsx`, `components/Today/**`, `/progress/upcoming` | G19 |
| 2 | `why-readiness` | Opus | `components/Why/**`, `/readiness`, `PreWorkout/ReadinessCheck.tsx` | G20, G22 |
| 2 | `workout-flow` | Opus | `app/workout/**`, `components/ActiveWorkout/**`, summary | G21 |
| 2 | `forecast-screens` | Opus | `/progress/forecasts/**`, `components/Forecast/**` | G22 |
| 2 | `transparency` | Sonnet | `/more/how-it-works`, `/more/adjustments`, `/research`, `components/Evidence/**` | G23 |
| 2 | `personal-evidence` | Fable | `src/lib/evidence/personal/**` | G12 |
| 3 | `forecasts-2` | Fable | `src/lib/forecast/kinds/` additions | G13 |
| 3 | `adopt-look` | Sonnet | Progress, Lift, Projection, Log, More, Settings screens | G24 |
| 3 | `light-motion` | Opus | paper theme pass, motion, accessibility | G24 |

Wave 1a starts as soon as the contracts commit exists; it touches nothing the other two
sessions touch. Wave 1b starts once `feat/favorite-workouts` is on `main`, because that branch
rewrites the same progression and plan loops and holds the next local-database version.
After each wave: merge, full suite, type-check, lint, production build, one independent review
(Fable) against the requirement ids, then the lead's browser pass.

### Cost and speed controls
- **Contracts and briefs first.** Each brief names the files, signatures, tests to write, the
  mock-up board to match and the functions to reuse, so no agent spends tokens exploring.
- **Model tiers.** Fable only where the reasoning is subtle (models, trace, feed, reviews);
  Opus for screens and look; Sonnet for recipe work (the nine-step table recipe, token-driven
  restyling, registry-driven pages).
- **Up to seven lanes at once,** with no shared files.
- **Agents run their own tests and the type-check only;** the lead runs the full suite once
  per integration.
- **One review per wave,** scoped to the diff and the requirement ids.
- **The mock-ups are the design.** Screen agents implement a board; they do not redesign it.
- **Outcomes are derived, not stored,** which removed a whole wiring package from the first draft.

### Deploy checkpoints
| Checkpoint | Live after it | Precondition |
|---|---|---|
| GA, after wave 1 | The whole app in the new look; forecasts quietly recorded from the first workout; behaviour otherwise unchanged | Suite, build, review, browser pass; the SQL script below applied |
| GB, after wave 2 | The glass-box screens: why, forecasts, track record, readiness, adjustment log | As above |
| GC, after wave 3 | Second forecasts, light theme, motion, remaining screens | As above |

### Needs Michael
- **The two open branches.** Please approve the merge of `feat/favorite-workouts` (and
  `feat/apple-health`) in their sessions now. Wave 1a does not wait for them; wave 1b and
  wave 2 do. I will send both sessions the lane table at kickoff.
- **Neon.** `scripts/sql/2026-11-14-glass-box.sql` only creates two new empty tables
  (`forecasts`, `coach_events`) and touches no existing data. I will not read credentials or
  run it. It has to be applied before GA: by you in the Neon SQL editor, or by a session you name.

## Verification
- `npx vitest run` per package and in full at each integration, reported as "X/Y tests passing
  (Z pre-existing failures)" (baseline 2,514 passing, 1 skipped); `npx tsc --noEmit`; lint;
  production build with a dummy `DATABASE_URL`; the static iPhone build once that branch lands.
- New standing tests: the glass-box contract (G1, G4), golden rebuild and outcome equivalence
  (G2), ledger write-once and lifecycle (G5), replay calibration and no-leak (G6), contrast
  script (G14), static-route guard (G25).
- Browser, 390×844, dark and light, demo data and empty database, never the real database and
  never with a sync passphrase: a scripted workout from Today through the why sheet, active
  set, rest and complete, then Forecasts, Track record and the adjustment log; screenshots
  compared with the boards. The shared Playwright browser is still locked by another session,
  so this runs through a scripted headless Chrome unless that is freed.

## Risks
- **Forecasts that look more certain than they are.** Early ones rest on a handful of sets.
  Mitigation: cold-start rules, wide ranges, the record split by how much history a forecast
  had, about 20 results before any self-correction, grades on screen.
- **Predicting one thing and measuring another.** Mitigation: each kind declares the quantity
  it predicts in raw log terms, and its resolver uses the model's own measuring function.
- **History that rewrites itself.** Mitigation: the trace is saved at start, forecast rows are
  write-once and carry a model version, outcomes depend only on the log.
- **Merge order with the other two sessions.** Mitigation: wave 1a avoids their files; wave 1b
  waits for the favourites merge.
- **Size.** Seventeen packages. Waves 1 and 2 deliver the vision; wave 3 can be cut or
  deferred without leaving anything half-built.

## Out of scope
User-built dashboards (Option F tiles), a new photo set, readiness or forecasts changing
weights automatically, reading Apple Health heart-rate data in coaching rules, switching on
the planned deload and pain-load rules, tablet layout.
