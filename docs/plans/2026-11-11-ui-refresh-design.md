# ReComp Life: deep UI refresh ("clear on top, deep underneath")

## Context

Michael wants the app to feel clean and obvious to use, while letting him go as deep as he
likes into trends, numbers and history, and he expects to add dashboards later. I reviewed
every main screen on the live site (`main` at `fdd8589`) with eight weeks of sample data loaded
into a test browser only.

What the review found:

| # | Finding | Where |
|---|---|---|
| F1 | No home for trends. They are split between a 4,100px-tall Program page (four lifts stacked, no drill-down), a Muscles screen under Tools, and five text rows on the weigh-in page | `app/program`, `app/tools`, `app/weigh-in` |
| F2 | Charts are thin: e1RM "trend" is dots with no line, nothing is tappable, no time range, "Latest e1RM" printed twice per lift | `components/Charts/E1RMChart.tsx`, `RPETrendChart.tsx` |
| F3 | The weekly volume chart on Program renders labels but no bars, although the Muscles screen shows the same week's sets | `components/Charts/VolumeBars.tsx` |
| F4 | Data collected but never shown as a trend: bodyweight (a finished `BodyweightChart` is unused), runs, sleep/stress readiness logs, per-set history, weekly tonnage, PRs | `Charts/BodyweightChart.tsx`, `db.readinessLogs`, `db.runs` |
| F5 | Coaching logic that never reaches the screen: `deload`, `rateOfLoss`, `volumeRatio`, `painAutoClear`, `stallDetection`; `InactivityBanner`, `AbandonedWorkoutBanner`, `WeighInPrompt` are not rendered | `src/lib`, `components/Dashboard` |
| F6 | The Dashboard is seven equal-weight bordered cards; START WORKOUT is on the second screen; the "1/5 this week" card is mostly empty | `app/page.tsx` |
| F7 | Navigation hides things: Muscles, Research and Exercises live under "Tools"; Settings is only reachable from a gear on the Dashboard; weigh-in, run and body check only from Dashboard buttons | `components/BottomNav.tsx` |
| F8 | Workout logging friction (from the earlier walkthrough): weight is the smallest text, target reps are not pre-selected, LOG SET falls below the fold on T1, 10 reps takes four taps | `app/workout/active` |
| F9 | Inconsistent finish: emoji used as icons, a "coming in a future update" placeholder on the summary, monospace used for prose, each page hand-builds its header | several |
| F10 | On a wide screen the whole app is one 480px column in empty space; light mode is defined but the layout forces dark | `app/layout.tsx`, `ui/page-shell.tsx` |
| F11 | Still open from the foundation refactor: mid-workout reload loses progress, Configure and Active disagree on home substitutes, abandoned workouts advance the rotation, three pages over 500 lines mix logic and layout | `app/workout/{active,configure,summary}` |

**Outcome:** four obvious destinations, one clear action per screen, and the same three levels
of depth everywhere (glance, chart, every data point), built on a metrics layer and chart kit so
that new trends, and later user-built dashboards, are additions and not rewrites.

Assumptions made from Michael's answer ("clear look, go super deep, dashboards eventually");
each is easy to change at approval:
- Navigation becomes **Today / Progress / Log / More** with a centre quick-add button.
- The look **evolves** the current dark, sage, mono-numeral style; it is not a new identity.
- Phone first. Layout primitives make tablet/desktop reflow sensibly, but no dedicated desktop
  design. Light mode is checked and switched on in the last phase.
- New things to track (waist, photos, protein) and user-editable dashboards are **not** built
  now; the architecture is shaped so they slot in.

## Design principles (the spec's yardstick)

1. **One hero per screen.** The first thing visible answers "what do I do / what changed".
2. **Three depths, always the same gesture.** Glance (a number, its change, a sparkline) →
   tap → Chart (range selector, tap a point to read it) → tap → Detail (every data point in a
   list). No screen shows depth 3 by default.
3. **Fewer boxes.** Cards only for a tappable object or a grouped control; sections are
   separated by spacing and a header, not borders.
4. **Numbers are the identity.** Large mono numerals with unit and signed change; prose in the
   sans face. Tier colours and status colours only through tokens.
5. **Every suggestion says why** through the existing `EvidenceLine`.
6. **Nothing is a dead end.** Any number that has history is tappable.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| U1 | Four destinations plus quick add: Today, Progress, Log, More; a centre button opens Start workout / Log weight / Log run / Body check from any tab | From any tab, each of the four quick actions is reachable in two taps; old URLs (`/history`, `/program`, `/tools`) redirect |
| U2 | Today shows the next workout and its start button without scrolling at 390x844, then at most three "needs attention" items, then four glance tiles | Screenshot check; Playwright asserts START is in the first viewport |
| U3 | Progress has tabs Strength, Body, Muscles, Runs; each opens on glance tiles and one chart | Each tab renders with the demo dataset and with an empty database |
| U4 | Every lift has a detail page: e1RM line, working-weight steps, weekly volume, RPE, AMRAP reps, PR list, and every logged set grouped by session | Open Squat from Progress; ranges 4w / 3m / 1y / all change the data; tapping a point shows date and value |
| U5 | Bodyweight has a detail page: daily points with 7-day average, rate of change against the cutting target from `rateOfLoss`, every entry editable | Demo data shows -1.0 lb/wk against the target band |
| U6 | Runs and readiness are visible as trends (weekly distance and time, pace, effort; sleep and stress against RPE) | Tabs render from demo data |
| U7 | All trend data comes from a metrics registry: one pure, tested function per metric returning a typed series; tiles and charts take a metric id | Adding a metric = one registry entry + test, no screen edits; architecture test forbids series maths in components |
| U8 | One chart kit (line, bar, sparkline, range tabs, point inspector) themed from tokens; no chart defines its own colours | `Charts/*` old components deleted; palette rule passes with no chart exemptions |
| U9 | Insights: one ranked list from pure rules (deload suggested, stall, loss rate off target, inactivity, unfinished workout, weigh-in due, pain check, PR) shown on Today and in the weekly review, each with its evidence line | Unit tests per rule; Today shows at most three; F5 modules all have importers |
| U10 | Active workout: weight is the largest element with plate breakdown; target reps pre-selected; one primary button in thumb reach that becomes the rest timer; logging a set that hits target is one tap; a reload resumes at the same set | Playwright: A1 with warm-ups, primary button inside the first viewport on every set; log 3 sets, reload, resume at set 4 |
| U11 | Configure is a single "ready?" screen: workout, location, start; readiness, pain, accessories and substitutes are optional expanders; what it shows is what Active performs | Home substitute chosen on Configure appears in Active |
| U12 | Log: filterable history with a month calendar strip; a workout opens a detail page (the summary view) with every set | Tap a day with a workout → detail |
| U13 | Consistency: every page uses `PageShell`/`PageHeader`; Lucide icons only, no emoji as icons; no page file over 300 lines; no direct database import or raw palette class in `src/app` or `src/components` | Architecture test with an empty allowlist plus a line-count rule |
| U14 | Weekly review screen: sessions, weight change vs target, e1RM change per lift, PRs, volume by muscle, top insights | Renders from demo data; linked from Today on Sundays and from Progress |
| U15 | Light mode and wide screens are usable: theme setting works; from 768px content uses two columns where a screen has tiles + chart | Screenshot pass in light mode and at 1024px on Today, Progress, lift detail, active workout |
| U17 | PR opportunity: wherever a working weight is shown for a set that counts toward e1RM, the app says how many reps at that weight would raise the lift's best e1RM, the resulting estimate, and how likely that is given recent AMRAP sets ("likely", "stretch", "unlikely") | Unit tests on `repsToBeat`; with demo data the squat AMRAP set on Active and the next-workout card on Today both read e.g. "5+ reps = new best (est. 241), likely" |
| U18 | Projection screen per lift: history, the fitted current trend with an uncertainty band, and projected e1RM for the next 4/8/12 weeks under alternatives the user can adjust (sessions per week for the lift, weekly hard sets for its main muscles, share of sessions passed, training phase), each drawn against the current-trend line; assumptions and sources are stated on the screen | Unit tests on the model (monotonic in frequency and adherence, diminishing returns, cutting slows it, band widens with horizon, falls back to "not enough data" under 4 points); screen renders from demo data; every scenario control changes the chart; an evidence line cites the rule |
| U16 | No regression in logic: progression, freeze, rest times, e1RM rules behave as on `main` | Full suite green; before/after `liftStates` identical for a scripted A1 gym and A1 home workout |

## Architecture

### Navigation and routes
```
/                      Today
/progress              Progress hub   ?tab=strength|body|muscles|runs
/progress/lift/[id]    Lift detail            (U4)
/progress/body         Bodyweight detail      (U5)
/progress/review       Weekly review          (U14)
/log                   History                (was /history)
/log/workout/[id]      Workout detail         (was /workout/summary?sessionId=)
/more                  Exercises, calculators, research, settings, sync status (was /tools)
/workout/configure, /workout/active   unchanged URLs
```
- `components/AppChrome.tsx` already owns where the nav shows. Replace `BottomNav` with
  `components/nav/TabBar.tsx` (four tabs + centre action) and `nav/QuickAddSheet.tsx`
  (uses `ui/sheet.tsx`). Old routes become one-line redirects.
- Muscles: the anatomy session's `/muscles` page becomes the body of the Progress > Muscles
  tab (imported, not copied). Its `/exercises/[id]` page stays the exercise's home; the lift
  detail links to it for form and anatomy, and it links back for history.

### Metrics layer, `src/lib/metrics/` (U7; the base for future dashboards)
```ts
type Point = { t: number; v: number; label?: string; refId?: string };   // refId -> workout/entry
type Series = { id: MetricId; points: Point[]; unit: Unit; better: "up" | "down" | "none" };
type MetricSource = { workouts; e1rms; bodyweight; runs; readiness; pain; liftStates; settings };
type MetricDef = { id; label; unit; better; scope: "global" | "lift" | "muscle";
                   compute(source, params): Series; format(v): string };
export const METRICS: Record<MetricId, MetricDef>;
export function summarize(series, range): { latest; change; changePct; min; max; pr?: Point };
export function bucket(series, "week" | "month", "sum" | "mean" | "last"): Series;
```
- First metrics: `e1rm`, `workingWeight`, `amrapReps`, `avgRpe`, `liftVolume` (per lift);
  `bodyweight`, `bodyweight7d`, `lossRate`; `weeklySets` (per muscle, reusing
  `calculateGroupVolume` in `lib/volumeTracking.ts`); `sessionsPerWeek`, `tonnage`,
  `runDistance`, `runPace`, `runEffort`, `sleep`, `stress`.
- Reuse, do not rewrite: `lib/e1rm.ts` (`toRecentE1RMSeries`, `getE1RMTrend`, `isNewPR`),
  `lib/rateOfLoss.ts`, `lib/volumeTracking.ts`, `lib/muscleLoad.ts`, `lib/streaks.ts`,
  `lib/dates.ts`, `lib/workout/setSelectors.ts`.
- `src/hooks/useMetric.ts`: `useMetric(id, params, range)` builds the `MetricSource` from the
  existing hooks (`useCompletedWorkouts`, `useE1RMs`, `useBodyweightLog`, `useRuns`, ...) and
  memoises. A new `useReadinessLogs` hook is added beside them.
- A dashboard later is a stored list of `{ widget: "tile" | "chart", metric, params, range }`.
  Today and the Progress tabs are written as exactly such lists (constants now), so making
  them user-editable is a storage and editing task, not a redesign.

### Insights, `src/lib/insights/` (U9)
`computeInsights(source, now): Insight[]`, each `{ id, severity, title, body, evidenceId?,
action?: { label, href } }`, ranked. Rules wrap existing modules: `lib/deload.ts`,
`lib/stallDetection.ts`, `lib/rateOfLoss.ts`, `lib/inactivity.ts`, `lib/volumeRatio.ts`,
`lib/painAutoClear.ts`, plus unfinished-workout (`useUnfinishedWorkout`) and weigh-in-due.
Rendered with `ui/callout.tsx` + `components/Evidence/EvidenceLine`. This replaces the
separate Dashboard banners.

### PR opportunity and projections, `src/lib/projection/` (U17, U18)
- `repsToBeat(weight, bestE1RM, rpe?)`: the smallest rep count at `weight` whose estimate
  from the existing `calculateE1RM` (`lib/e1rm.ts`) exceeds `bestE1RM`, capped at
  `E1RM_MAX_REPS`; `null` when no eligible rep count does it. `prChance(repsNeeded,
  recentAMRAPReps)` → "likely" | "stretch" | "unlikely" from where `repsNeeded` falls against
  the lift's recent AMRAP reps (already tracked on `LiftState.recentAMRAPReps`). Shown on the
  active set, on the next-workout card and on the lift page.
- `fitTrend(series)`: least-squares slope (lbs/week) over the recent window with a residual
  band; reports "not enough data" under four points.
- `projectE1RM({ history, baseline, scenario, weeks })` → `{ points, low, high }`.
  `baseline` is the lift's current reality, measured from the data: sessions per week,
  weekly hard sets for its primary muscles (`calculateGroupVolume`), pass rate, average RPE,
  phase. `scenario` overrides any of those. The projected rate is the fitted rate scaled by
  dose and adherence multipliers with diminishing returns, a cutting modifier, and a decay as
  the horizon lengthens; the "program" scenario instead walks the real GZCLP rules
  (`evaluateT1Progression` increments and stage changes) forward.
- **The multipliers are not invented in code.** A research step comes first, following
  `docs/research/ADDING_RESEARCH.md`: dose-response of weekly sets and frequency on strength,
  rate of strength gain by training age, and the effect of an energy deficit. The findings
  become new rules in the evidence registry (`src/lib/evidence/rules/`), each with a strength
  rating, and `projectE1RM` reads its coefficients from named constants tagged with those
  rule ids. Where the evidence is weak the band is wide and the screen says so.
- Screen: `/progress/lift/[id]/projection`, linked from the lift page's e1RM chart. History as
  points, current trend as a line with band, each alternative as a labelled line; scenario
  controls underneath (`SegmentedControl`, `Slider`); a plain-language summary ("At 2 squat
  sessions a week instead of 1.5, about +9 lb more in 12 weeks; range +3 to +15").

### Chart and UI kit (U8, U13)
- Load the `dataviz` and `frontend-design` skills before writing any of this.
- `components/charts/`: `TrendChart` (line/area/steps with optional band and target line),
  `BarSeries`, `Sparkline`, `RangeTabs`, `PointInspector`. Recharts stays; colours come from
  new `--chart-*` tokens; charts are lazy-loaded.
- `components/ui/` additions: `stat-tile` (label, value via `AnimatedNumber`, `delta`,
  sparkline, optional href), `delta`, `section-header`, `list-row`, `empty-state`,
  `chip-group`. Existing `Card`, `SegmentedControl`, `Sheet`, `Skeleton`, `Callout`,
  `TierBadge`, `PageShell`, `Stagger` are reused.
- `PageShell` gains a `wide` mode: one column under 768px, a 12-column grid above.
- `src/lib/demo/generateDemoData.ts`: deterministic sample dataset (the one used for this
  review), used by tests and by a "Load demo data" button in More > Data that is rendered only
  in development builds.

### Workout flow (U10, U11, U16; finishes the foundation refactor)
- Active page rebuilt on `lib/workout` (`buildWorkoutPlan`, `rehydratePlan`, `createSetLog`,
  `nextStep`, `computeCompletion`) and `lib/data/workouts` (`appendSet`, `finishWorkout`,
  `discardWorkout`, `getRecentE1RMSeries`), keeping `getRestSeconds`, `isE1RMEligibleSet`,
  the evidence lines and the anatomy slots. New `lib/plates.ts` (extracted from
  `app/plate-calculator/page.tsx`) for the plate breakdown. Auto-regulated state is derived
  from logged sets so it survives a reload.
- Configure uses `useNextWorkout` + `buildWorkoutPlan` for its preview and saves substitutes
  with `substituteModification`.
- Rotation counts completed workouts only (`describeNextWorkout`), everywhere.

## Execution: spec first, mock-up sign-off, then a parallel agent team

Lead (this session, Fable): spec, contracts, mock-ups, integration, browser verification.
Agents work in their own worktrees with exclusive file lanes, never push, never touch `main`.
Nothing reaches `main` or production without Michael's say-so.

**Step 0. Spec.** `docs/plans/<date>-ui-refresh-design.md` (this document, expanded) and
`-plan.md` (lanes, contracts), committed on a new branch `feat/ui-refresh` from `main`.

**Step 1. Mock-ups for sign-off (before any screen code).** One published page with
phone-size mock-ups of Today, Progress > Strength, Lift detail, Active workout and the quick
add sheet, using the real tokens and demo numbers. Michael approves or redirects the look and
the navigation here; this is the cheap place to change direction.

**Step 2. Contracts commit.** Signatures and types only: `lib/metrics` (types, registry keys),
`lib/insights` types, chart and UI component props, route skeletons with redirects, `TabBar`.

| Wave | Agent | Model | Lane | Requirements |
|---|---|---|---|---|
| 1 | `metrics` | Fable | `src/lib/metrics/**`, `src/hooks/useMetric.ts`, `useReadinessLogs`, `lib/demo/**` | U7 |
| 1 | `insights` | Opus | `src/lib/insights/**` | U9 |
| 1 | `projection-research` | Opus | `docs/research/**` notes, new rules under `src/lib/evidence/rules/`, regenerated `docs/coaching-rules.md` | U18 (inputs) |
| 1 | `projection` | Fable | `src/lib/projection/**` (starts on `repsToBeat`/`fitTrend`; the scenario model waits for the research rules) | U17, U18 |
| 1 | `chart-kit` | Opus | `components/charts/**`, chart tokens in `globals.css` | U8 |
| 1 | `ui-shell` | Sonnet | `components/nav/**`, `AppChrome`, new `ui/*` components, `PageShell` wide mode, redirects | U1, U13 |
| 1 | `workout-flow` | Fable | `app/workout/{active,configure}/**`, `components/ActiveWorkout/**`, `components/PreWorkout/**`, `stores/workoutStore.ts`, `lib/plates.ts` | U10, U11, U16 |
| 2 | `today` | Opus | `app/page.tsx`, `components/Today/**` (replaces `components/Dashboard/**`) | U2, U9 |
| 2 | `progress-strength` | Opus | `app/progress/page.tsx` (hub + strength tab), `app/progress/lift/[id]/page.tsx` | U3, U4, U17 |
| 2 | `projection-ui` | Opus | `app/progress/lift/[id]/projection/**`, `components/Projection/**` | U18 |
| 2 | `progress-body-runs` | Sonnet | body, runs and readiness tabs, `app/progress/body/**`, `app/weigh-in`, `app/run` | U3, U5, U6 |
| 2 | `log` | Sonnet | `app/log/**` (history + workout detail from the summary page), `components/WorkoutSummary/**` | U12 |
| 2 | `more-settings` | Sonnet | `app/more/**`, `app/settings/**` split into section components, calculators | U1, U13 |
| 3 | `review-polish` | Opus | `app/progress/review/**`, light mode, 768px+ layouts, empty states, motion | U14, U15 |

After each wave: merge branches, full suite + `tsc` + lint, an independent review agent
(Fable) against the requirement IDs, then the lead's Playwright pass. Wave 2 starts only when
Wave 1 is integrated, because every screen consumes the metrics, chart kit and shell.

### Deploy checkpoints

Michael has asked for a deploy at each sensible stopping point. A checkpoint is: the wave is
integrated on `feat/ui-refresh`, the suite, `tsc`, lint and production build pass, the review
has no open blocker, and the Playwright pass is clean. Then `main` is fast-forwarded, pushed
(Vercel deploys), and the live site is spot-checked. Each checkpoint must leave the app
coherent on its own:

| Checkpoint | Live after it | How it stays coherent |
|---|---|---|
| D1, after Wave 1 | New tab bar and quick add; rebuilt Configure and Active workout with resume and the PR-opportunity line; all remaining foundation fixes | `/progress`, `/log`, `/more` temporarily render the existing Program, History and Tools screens under the new tabs, so nothing is missing |
| D2, after Wave 2 | New Today, Progress (all tabs, lift detail, projection), Log, More and Settings | Old screens and old chart components are deleted in the same release |
| D3, after Wave 3 | Weekly review, light mode, wide-screen layout, polish | Additive |

The mock-ups in Step 1 are shown before any of this and are not a deploy.

**Other sessions.** The evidence session has finished with shared files. The anatomy session
still has commits on `feat/interactive-anatomy` touching `ExerciseBlock`, summary, settings,
exercises and muscles, and asked me to wait for its merge. Steps 0-2 and the `metrics`,
`insights`, `chart-kit` and `ui-shell` lanes touch none of its files and start immediately;
`workout-flow` and Wave 2 start from `main` after its branch has landed.

## Critical files

- New: `src/lib/metrics/**`, `src/lib/insights/**`, `src/lib/projection/**`,
  `src/components/Projection/**`, `src/lib/plates.ts`, `src/lib/demo/**`,
  `src/hooks/useMetric.ts`, `src/components/charts/**`, `src/components/nav/**`,
  `src/components/Today/**`, `src/app/progress/**`, `src/app/log/**`, `src/app/more/**`,
  `src/components/ui/{stat-tile,delta,section-header,list-row,empty-state,chip-group}.tsx`
- Rebuilt: `src/app/page.tsx`, `src/app/workout/{active,configure}/page.tsx`,
  `src/app/settings/page.tsx`, `src/app/globals.css` (chart tokens, light-mode pass)
- Removed after migration: `src/app/{history,program,tools}/page.tsx` (redirects remain),
  `src/components/Charts/*`, `src/components/Dashboard/*`, `src/components/BottomNav.tsx`
- Reused as is: `src/lib/workout/**`, `src/lib/data/**`, `src/hooks/**`,
  `src/components/Evidence/**`, `src/components/Anatomy/**`, `src/lib/{e1rm,rateOfLoss,
  volumeTracking,muscleLoad,deload,stallDetection,inactivity,restTimes,progression}.ts`

## Verification

- `npx vitest run` after every package, reported as "X/Y tests passing (Z pre-existing
  failures)" (baseline on `main`: 892 passing, 1 skipped); `npx tsc --noEmit`; `npm run lint`
  (7 pre-existing errors, must not rise); production build with a dummy `DATABASE_URL`.
- Architecture test: allowlists emptied by the end; new rules for the 300-line page limit and
  "no series maths in components".
- Playwright at 390x844 on a local dev server with a dummy `DATABASE_URL` and the demo
  dataset loaded, never the real database and never with a sync passphrase: one scripted
  check per requirement row, plus the empty-database pass, plus light mode and 1024px for U15.
- U16: scripted A1 gym and A1 home workouts on `main` and on the branch; compare the
  resulting `liftStates`, `sets` and `estimated1RMs` rows.
- Before/after screenshots of every screen saved under `.playwright-mcp/` for Michael.

## Risks

- **Taste.** The look is subjective; Step 1's mock-ups exist to settle it before code.
- **Size.** Eleven agent packages plus reviews. Waves 1-2 deliver the navigation, trends and
  workout flow; Wave 3 can be cut or deferred without leaving anything half-built.
- **Overlap with the anatomy session.** Handled by lane order above; if its merge is delayed,
  Wave 2 packages that touch its files (`log`, `more-settings`, parts of `today`) wait while
  the others proceed.
- **Projections can mislead.** They are a simple model on a short, noisy series. Mitigations:
  coefficients come from cited research with strength ratings, every projection carries a
  range, the screen states its assumptions, and it refuses to project from fewer than four
  data points. It informs choices; it never changes the program by itself.
- **Chart performance on a phone.** Charts are lazy-loaded and series are bucketed (weekly
  beyond three months) in the metrics layer, not in components.
- **Rotation change is visible.** Counting only completed workouts can change which workout
  is offered next after an abandoned session; it is the intended fix, called out in the spec.
