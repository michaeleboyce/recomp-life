# Architecture

A map of the code as it stands (18 Nov 2026), for someone new to it and for agents.
Project rules are in `CLAUDE.md`; this file says where things live, how data moves and
how a workout is planned. The history of the planning paths is in
`docs/plans/2026-11-17-imported-history-and-planning-paths.md`.

## Layers

Imports point down this list. `src/architecture.test.ts` enforces two of the rules
(R8: pages and components do not import `@/db/local`; R9: they use theme tokens, not
raw Tailwind palette classes), with the exceptions in `src/architecture.allowlist.ts`.

| Layer | Where | Rule |
| --- | --- | --- |
| Types | `src/types/index.ts` (plus `glass.ts`, `imported.ts`) | Every shared record and interface. No logic. |
| Local database | `src/db/local.ts` (Dexie schema), `src/db/init.ts` (seed and start-up rebuild), `src/db/seed.ts` | The log tables are the truth; derived tables are written only by the rebuild. |
| Server database | `src/db/schema.ts` (Drizzle), `src/db/drizzle.ts` (Neon client) | Used only by `src/app/api`. |
| Pure logic | `src/lib/**` except `src/lib/data` and the sync client | No React, no Dexie. Most modules take `now` from the caller instead of reading the clock. Nearly every file has a test beside it. |
| Data layer | `src/lib/data/*.ts` | The only code that writes Dexie. Every synced write goes through `stamp.ts` (sets `updatedAt`, marks the row unsynced). |
| Sync client | `src/lib/sync.ts`, `src/lib/sync/*` | Talks to `/api/sync` and merges into Dexie. |
| Hooks | `src/hooks/*.ts`, exported from `src/hooks/index.ts` | Live reads (`useLiveQuery`), returning `undefined` while loading. Soft-deleted rows are filtered with `liveRows`. Hooks gather and memoise; the sums are in `src/lib`. |
| Stores | `src/stores/workoutStore.ts` (Zustand) | Transient UI state of the active workout only. Losing it loses no progress: logged sets are on the workout row. |
| Components | `src/components/<Feature>/` | Render what hooks and pure functions return; write through `src/lib/data`. |
| Routes | `src/app/**/page.tsx` | Thin pages composing components, almost all client components (`"use client"`). A page with an id in its path is a server file that lists its ids (`generateStaticParams`, needed by the static export) and renders a client component; old addresses redirect. |
| API | `src/app/api/sync/{push,pull,status}/route.ts` | Server only. Validation and SQL building in `src/lib/syncGuard.ts`; response helpers in `src/app/api/sync/respond.ts`. |

Two builds share the sources: the web build (Vercel, with the API routes) and the
static export for the iPhone app (`npm run build:native`, `scripts/build-native.mjs`,
which copies the sources without `src/app/api` and runs `next build` with
`BUILD_TARGET=native`; Capacitor wraps the result). There is no sign-in: sync is
guarded by a shared passphrase (`src/lib/syncKey.ts` on the device, `SYNC_SECRET` on
the server).

## src/lib modules

What each owns, and what it must not do. "Pure" means no React, no database.

Program and coaching (top-level files):

- `progression.ts`: GZCLP stage and weight changes after a session. Pure; never writes lift states (the rebuild does).
- `autoAdapt.ts`, `deload.ts`, `stallDetection.ts`, `rateOfLoss.ts`, `weightDecay.ts`, `recovery.ts`, `runRecovery.ts`, `painModifications.ts`, `painAutoClear.ts`, `volumeRatio.ts`, `volumeTracking.ts`, `muscleLoad.ts`, `amrap.ts`, `restTimes.ts`, `warmups.ts`, `e1rm.ts`, `plates.ts`, `dbConversion.ts`, `inactivity.ts`: one coaching calculation each, named by the file. Pure; thresholds are exported constants that the evidence rules read.
- `exercises.ts`, `workoutTemplates.ts`, `accessories.ts`, `exerciseCategories.ts`, `exercisePreferences.ts`, `muscles.ts`, `activities.ts`: the exercise catalogue, the four GZCLP workouts and their metadata. Data and lookups only.
- `liftNames.ts`, `workoutNames.ts`: every lift, exercise, workout and day name (see Naming). `glossary.ts`, `tierStyle.ts`: glossary words and tier classes.
- `text.ts` (`plural`, `pluralGrouped`, `percent`, `formatLbs`, `joinList`, `capitalise`, `lowerFirst`, `isAbbreviation`), `dates.ts` (`HOUR_MS`, `DAY_MS`, `WEEK_MS`, calendar days, "N days ago", "N weeks ago", Monday of a week, local day key), `utils.ts` (`cn`): small shared helpers. Use these instead of local copies.
- `weighIn.ts`, `unfinishedWorkout.ts`, `favorites.ts`, `favoriteSummary.ts`: logic behind one screen or flow.
- `apiBase.ts`, `securityHeaders.ts`, `routes.ts`, `offlineWarmList.ts`, `exerciseMedia.ts`: build and runtime configuration (API origin, headers, URLs, service-worker warm list, media index).
- `audio.ts`, `timerWorker.ts`: browser side effects for the rest timer. Not pure.
- `sync.ts`, `syncKey.ts`, `syncGuard.ts`: see Sync. `syncGuard.ts` is server only; never import it from client code.

Folders:

- `workout/`: the active workout domain (plan for a session, logging a set, finishing, credit, rotation, home variants). Pure; the data layer stores what it returns.
- `rebuild/`: derives lift states, e1RM rows and home exercises' states from the log (`rebuildDerived`, `diffDerived`, `previewLogChange`). Pure, no clock, no randomness. Rules: `docs/plans/2026-11-12-edit-rebuild-plan.md`.
- `strength/`: one strength model for gym and home sets (estimates, muscle index, ratios, re-entry). Pure.
- `data/`: the data layer (above). Reads and writes Dexie; holds no rules of its own beyond what to store.
- `sync/`: sync registry (the one list of synced tables, imported by client, guard and routes), wire types, pull state, row revival, the rebuild marker, the HTTP wrapper.
- `metrics/`: every trend the app charts, as registered metrics producing a `Series` from plain records. Pure.
- `projection/`: e1RM projection, its baseline and scenario summary, PR opportunity. Pure; `now` is passed in.
- `forecast/`: forecast models, stored-forecast rows, resolution against the log and the track record. Pure; the ledger writes are in `lib/data/forecasts.ts`. `forecast/text/` (its own `index.ts`) holds the words the forecast screens show: `words.ts` (names, kinds, dates and numbers, stored inputs), `open.ts` (`viewOf`, `openForecasts`), `inputs.ts` (`inputLines`), `record.ts` (the track record in words).
- `readiness/`: the 0 to 100 readiness score and what moved it. It shifts forecasts only; it never changes what is lifted.
- `insights/`: ranked attention items, one rule file per kind under `rules/`, each an adapter over an existing coaching function.
- `review/`: the weekly review's sections and takeaways.
- `adjustments/`: the adjustment feed (every change to the plan, a forecast or a rule, with its reason). Pure.
- `trace/`: decision traces that reproduce a number the app chose, step by step. Pure.
- `glass/`: which written rules sit behind each model ("How the app decides"), counted from the evidence registry.
- `evidence/`: the evidence registry (below). `evidence/personal/`: what the user's own log says about a rule's question; a hint, never proof.
- `anatomy/`: muscle-to-figure and mesh mappings and the anatomy colour palette.
- `motion/`: the exercise mannequin's poses (see `motion/README.md`). Pure, no three.js.
- `health/`: Apple Health import, against plugin-neutral types; the Capacitor plugin is in `src/native`.
- `import/`: parsing and mapping other apps' exports, previews, imported records and starting weights.
- `demo/`: the synthetic demo lifter and log.

## How data flows

**A set is logged.** The active workout screen (`components/ActiveWorkout`) calls
`appendSet` in `lib/data/workouts.ts`. In one Dexie transaction over
`rebuildTables()` it writes the set onto the workout row with fresh stamps
(`editStamps`: new `updatedAt`, `synced: false`) and brings that workout's e1RM rows in
line, so readers are live during the workout. Finishing (`finishWorkout`) stores the
completion context, runs `applyRebuild()` and spends the session's next-set plans in
the same transaction, then writes lift forecasts to the ledger. Editing the log
(`lib/data/logEdits.ts`) and lift adjustments also end in `applyRebuild()`.

**Derived state.** Lift states, estimated 1RMs and variant states are never edited:
`applyRebuild()` (`lib/data/derived.ts`) loads the workouts, lift adjustments and
settings, runs the pure `rebuildDerived`, diffs against what is stored and writes only
the differences. It is the only writer of those tables, and they are never synced.
Everything else a screen shows (metrics, projections, forecasts, readiness, insights,
review, traces) is computed on read by pure functions over the log, through hooks.

**Push.** `SyncProvider` (mounted in `src/app/layout.tsx`) runs `fullSync()` on start, on
coming back online, after the passphrase changes and on returning to the foreground
when the last pull is over five minutes old (a push only, otherwise). `pushUnsynced`
sends each registry table's dirty rows in batches to `/api/sync/push`, which validates
the whole batch (`prepareBatch`) and upserts row by row, last write wins on
`updatedAt`. Rows the server accepted are marked synced unless edited meanwhile.

**Pull.** `pullFromServer` reads each table in pages from `/api/sync/pull` (since the
recorded stamp, resuming from a cursor if a pull was cut short; `lib/sync/pullState`)
and merges each page by `clientId`, last write wins. A merged page of a table that
feeds the rebuild (`REBUILD_TABLES`: workouts, liftAdjustments) writes the rebuild
marker (`lib/sync/rebuildMarker.ts`) in the same transaction. At the end of the pull,
and at the start of the next sync or app start (`db/init.ts`), `rebuildIfNeeded` runs
`applyRebuild()` and clears the marker only if no newer page re-marked it.

## How a workout is planned

All in `src/lib/workout`, pure. `planningPaths.characterisation.test.ts` pins what every
path below plans for the demo log; a difference there means a planning number moved.

- **The due day.** `dueTemplateId` (`rotation.ts`): A1, B1, A2, B2 from the finished
  workouts. Screens that only need the day read `useDueTemplateId`.
- **Starting a session.** `planWorkoutStart` (`startPlan.ts`), the one function every
  path shares: re-entry after time off (`reentry.ts`), each program lift resolved once
  (`resolveLifts` in `liftResolution.ts`: the exercise done, a first home weight from
  the strength evidence in `strength.ts`), the prescription recorded
  (`prescriptionOf`), the accessories chosen (`accessoryPlan.ts` over
  `lib/accessories`), then the plan with next-session set plans and the user's edits
  applied (`planFromLifts`, `withPlanEdits`, `planEdits.ts`).
- **The next workout on every screen.** `resolveNextWorkout` (`nextWorkout.ts`): the due
  day, then exactly what `planWorkoutStart` would plan for it now. Hook:
  `useNextWorkout`. Configure (`components/PreWorkout/useWorkoutSetup.ts`) calls
  `planWorkoutStart` with the user's choices; starting stores that plan and its
  prescription on the workout row.
- **A session in progress.** `planForSession` (`planForSession.ts`) rebuilds the plan
  of a stored session from its prescription, so a resumed workout shows what was
  planned at the start.
- **The workouts after the next.** `projectUpcomingWorkouts` and
  `describeUpcomingWorkout` (`upcoming.ts`) plan each coming day the same way, with the
  lift states moved on by a simulated pass (`simulateCompletedWorkout`). Hook:
  `useUpcomingWorkouts`.
- **Forecasts.** `lib/data/forecasts.ts` builds the forecast source from the same
  strength evidence (`strengthSetsFrom`), so a forecast is made for the plan the
  screens show.

## The evidence registry

`src/lib/evidence/` holds every coaching rule: what the app does, why, the grade of
the research, its sources (`sources.ts`), where it is implemented and where it is
shown. Rules live in `rules/<area>.ts` and read their numbers from exported lib
constants; code that implements a rule carries `@evidence <rule-id>`, and screens that
act on one render `<EvidenceLine ruleId="..." />` (`components/Evidence`). Changes are
recorded in `changelog.ts`. The `/research` page and `docs/coaching-rules.md`
(regenerated by `npm run docs:evidence`, never edited by hand) are built from it, and
contract tests check that every rule's ids, links and locations exist. Procedure:
`docs/research/ADDING_RESEARCH.md`.

## Naming

Every function that turns an exercise id or a template id into words is in
`src/lib/liftNames.ts` (lifts and exercises) or `src/lib/workoutNames.ts` (workouts and
days). The forms differ on purpose and screens keep the one they were written with: do
not swap one for another without deciding the wording first. Each function's doc
comment says the same as this table.

| Function | Module | Example output | Where used |
| --- | --- | --- | --- |
| `catalogueName` | liftNames | "Barbell Squat", "Lat Pulldown" | insight cards, strength-trend sources, swap and trace text, import mapping |
| `shortLiftName` (re-exported as `liftName` by `components/LogEdit/format`) | liftNames | "Squat", "Bench Press", "OHP" | log edit sheets, Log outcome lines and set lists, Today's glance tiles, favourites |
| `liftShortName` | liftNames | "Squat", "Bench press", "Overhead press"; others as `shortLiftName` | `LIFT_NAMES.label`, workout names, swap reasons |
| `LIFT_NAMES[id].label` / `.short` | liftNames | "Bench press" / "bench" | Progress screens, exercise page, strength trend |
| `displayLiftName` (re-exported by `components/Today/todayModel`) | liftNames | "Bench press", "Overhead press", "DB bench press", "Romanian deadlift" | Today's rows and hero, Ready, Upcoming, Log accessory outcomes, exercise and lift pages |
| `nameInSentence` (re-exported by todayModel) | liftNames | "goblet squat", "DB bench press" | home-substitute lines, Today's accessory list, exercise page notes |
| `feedLiftLabel` / `feedLiftShort` | liftNames | "Lat pulldown" / "bench", "lat pulldown" | the adjustment feed (`lib/adjustments`) |
| `forecastLiftLabel` / `forecastLiftShort` (re-exported as `liftLabel` / `liftShort` by `lib/forecast/text`) | liftNames | "Bench press", "Lat Pulldown" / "bench press" | forecast screens and track record |
| `projectionLiftName` | liftNames | "squat", "bench press", "OHP" | projection screen sentence and empty state |
| `workoutDisplayName(id)` / `(id, true)` | workoutNames | "Squat day" / "A1 · Squat day" | quick-add sheet, Ready, summary, Log workout page, insights |
| `templateTitle` | workoutNames | "A1 · Squat day" | page titles of Ready and the active workout, More, favourites, Upcoming cards |
| `dayName(t1Id, fallback)` (re-exported by todayModel) | workoutNames | "Squat day", "Press day" | Today's hero and different-day sheet, Ready, Upcoming |
| `inlineTitle` | workoutNames | "B1 Press day" | Coming up line on Today |
| `feedDayName` | workoutNames | "Squat day", "Overhead press day" | adjustment feed workout entries |

Left where they are: `outcomeLiftName` (`components/Log/outcomes.ts`, composes
`shortLiftName` and `nameInSentence`: "Squat (goblet squat at home)"), `liftWord` in
`lib/trace/homeWeight.ts` ("bench press", "ohp": lower-cased catalogue name, used only
there), `exerciseName` in `components/nav/screenNames.ts` (null for an unknown id, for
the back button), and the `nameOf` helpers that take a candidate object.

## Conventions in the code

- Tests sit beside the file they test (`foo.ts` and `foo.test.ts`); larger subjects split by topic (`project.range.test.ts`). Shared fakes and builders live in a `testHelpers.ts`, `testUtils.ts`, `testFixtures.ts` or `testFakes.ts` in the same folder. A builder of one record is named `makeX` (`makeWorkout`, `makeSet`, `makeForecast`, `makeImportedSet`) and takes overrides. Vitest with jsdom; Dexie tests use `fake-indexeddb`.
- Each pure module starts with a comment saying what it owns and, usually, "Pure".
- Folders with a public surface export it from `index.ts` (`lib/forecast`, `lib/rebuild`, `lib/workout`, `lib/metrics`, `hooks`); import from the folder, not its files, where an index exists.
- A feature folder under `src/components/<Feature>/` holds PascalCase component files, camelCase pure helpers for that feature (`todayModel.ts`, `format.ts`, `bodyMath.ts`) with their tests, and feature-local hooks (`useBodySeries.ts`). Larger features use subfolders (`Progress/body`, `Progress/runs`). `components/ui/` holds the shared primitives (kebab-case, shadcn style) and `components/chart-kit/` the charts.
- Hooks are named `useX` and live one concern per file in `src/hooks`; their pure counterparts are named `xFrom(records, ...)` where a hook and a test share the sum.
- Units: weights in lbs, durations in seconds, stamps in epoch milliseconds; time constants from `lib/dates`.
- Every synced record has a `clientId`; soft deletes set `deletedAt`.
- Colours come from theme tokens in `src/app/globals.css`; dark is the default theme.

## Cleanup still to do

What the 18 Nov cleanup (K1 to K8) left, and why. Highest value first.

1. Text and date helpers whose output differs, so they were not merged: `formatLbs` in
   `components/LogEdit/format.ts` (drops a trailing ".0": "203") against the one in
   `lib/text` ("203.0"); `formatAmount` in `lib/forecast/text/words.ts` and
   `formatNumber` in `components/chart-kit/scale.ts` (identical to each other, with
   thousands separators) against `formatNumber` in `lib/metrics/helpers.ts`; percent
   variants with decimals in `lib/evidence/rules/{effort,strength,forecast,readinessScore}.ts`
   and `components/Readiness/readinessText.ts`; `joinList` with "or" in
   `lib/trace/text.ts`; "N days ago" variants in `components/Progress/sections.ts`
   ("1 day ago"), `lib/favoriteSummary.ts` and `lib/readiness/score.ts`; short-date
   formatters in `components/chart-kit/{scale,trendGeometry}.ts` (same output as
   `shortDate` in `lib/forecast/text`, but a component can not be imported from lib).
   A shared `shortDate` in `lib/dates` would let them go. Small.
2. `components/Lift/homeVersion.ts` keeps a local `plural` (the file was being edited
   by another session). Trivial.
3. Lift names: the wording differs between screens and sometimes on one screen (see
   Naming). Merging needs the owner to choose the words first. Re-exports kept for
   many importers: `displayLiftName`, `nameInSentence`, `dayName` from
   `components/Today/todayModel.ts`; `liftName` from `components/LogEdit/format.ts`;
   `components/Progress/lifts.ts` (`LIFT_NAMES` and friends); `DAY_MS` from
   `lib/forecast/log.ts`.
4. `src/hooks/useWeightChances.ts` (`weightChancesFrom`) and `src/hooks/useLogEdit.ts`
   (`countDifferences`) hold pure logic that belongs in `src/lib`;
   `components/Dashboard/MuscleHeatCard.tsx` and `app/exercises/page.tsx` still read
   Dexie directly (on the R8 allowlist). Small to medium.
5. Unused code left for a decision: the coaching code under "Decide: build or remove"
   in `docs/plans/2026-11-17-open-items.md` (deload, pain load changes, volume ratio,
   the weigh-in reminder, `Logo`), the recovery ramp-up helpers in `lib/recovery.ts`,
   and hooks and data-layer readers only tests call (listed in the cleanup report).
6. `useStrengthEvidence()` is called separately by each hook on a screen, and
   `strengthEvidenceOf` builds a new array per call, so the per-array caches in
   `lib/workout/strength.ts` are not shared between hooks. One provider over the
   screen (or a cache keyed on the input arrays inside `strengthEvidenceOf`) would let
   them share. Medium.
