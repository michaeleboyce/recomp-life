# Architecture

A map of the code as it stands (17 Nov 2026), for someone new to it and for agents.
Project rules are in `CLAUDE.md`; this file says where things live and how data moves.
How a workout is planned is not described here: see
`docs/plans/2026-11-17-imported-history-and-planning-paths.md` (that code is being
refactored).

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
- `exercises.ts`, `workoutTemplates.ts`, `accessories.ts`, `exerciseCategories.ts`, `exercisePreferences.ts`, `swapCandidates.ts`, `muscles.ts`, `activities.ts`: the exercise catalogue, the four GZCLP workouts and their metadata. Data and lookups only.
- `liftNames.ts`, `workoutNames.ts`, `glossary.ts`, `tierStyle.ts`: names, words and tier classes shared by screens and lib code.
- `text.ts` (plural, percent, joinList), `dates.ts` (time constants, calendar days, Monday of a week), `utils.ts` (`cn`): small shared helpers. Use these instead of local copies.
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
- `forecast/`: forecast models, stored-forecast rows, resolution against the log and the track record. Pure; the ledger writes are in `lib/data/forecasts.ts`.
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

## Conventions in the code

- Tests sit beside the file they test (`foo.ts` and `foo.test.ts`); larger subjects split by topic (`project.range.test.ts`). Shared fakes and builders live in a `testHelpers.ts`, `testUtils.ts` or `testFakes.ts` in the same folder. Vitest with jsdom; Dexie tests use `fake-indexeddb`.
- Each pure module starts with a comment saying what it owns and, usually, "Pure".
- Folders with a public surface export it from `index.ts` (`lib/forecast`, `lib/rebuild`, `lib/workout`, `lib/metrics`, `hooks`); import from the folder, not its files, where an index exists.
- A feature folder under `src/components/<Feature>/` holds PascalCase component files, camelCase pure helpers for that feature (`todayModel.ts`, `format.ts`, `bodyMath.ts`, `forecastText.ts`) with their tests, and feature-local hooks (`useBodySeries.ts`). Larger features use subfolders (`Progress/body`, `Progress/runs`). `components/ui/` holds the shared primitives (kebab-case, shadcn style) and `components/chart-kit/` the charts.
- Hooks are named `useX` and live one concern per file in `src/hooks`; their pure counterparts are named `xFrom(records, ...)` where a hook and a test share the sum.
- Units: weights in lbs, durations in seconds, stamps in epoch milliseconds; time constants from `lib/dates`.
- Every synced record has a `clientId`; soft deletes set `deletedAt`.
- Colours come from theme tokens in `src/app/globals.css`; dark is the default theme.

## Cleanup still to do

Found during the 17 Nov cleanup and left because the files were out of that pass's
scope or the change would alter behaviour. Highest value first. The 18 Nov pass did
the small ones: nothing in `src/lib`, `src/hooks` or `src/db` imports from
`src/components` any more (`architecture.test.ts` checks it), lint is clean, and the
sync-key event name has one definition.

1. Remaining local copies of the shared text helpers: `plural` in `lib/insights/shared.ts`, `lib/trace/homeWeight.ts`, `components/Lift/homeVersion.ts`; `joinList` in `lib/insights/shared.ts`, `lib/trace/text.ts` (has an "or" variant), `components/Projection/ScenarioControls.tsx`; inline `n === 1 ? "" : "s"` in `lib/sync.ts`, `lib/import/startingWeights.ts`, `components/Projection/*`; `pct` in `lib/evidence/rules/*.ts`, `lib/glossary.ts`, `components/ActiveWorkout/glassForecast.ts`. Use `lib/text`. Small.
2. Day and week constants still defined locally (`DAY_MS`, `86_400_000`) in `lib/strength/*`, `lib/data/health.ts`, `lib/health/importWindow.ts`, `lib/import/*`, `lib/insights/shared.ts`, `components/{Lift,LogEdit,Today,PreWorkout}`; use `lib/dates`. Small.
3. Lift naming has several functions for one idea with different words: `liftLabel`/`liftShort` in `components/Forecast/forecastText.ts` ("bench press") and in `lib/adjustments/text.ts` ("bench"), `liftShortName` in `lib/workoutNames.ts` and in `lib/projection/summary.ts`, `displayLiftName` in `components/Today/todayModel.ts`, `liftName` in `lib/insights/shared.ts` and `components/LogEdit/format.ts`. Unifying changes screen words, so it needs a decision on the wording first. Medium.
4. `components/Forecast/forecastText.ts` (860 lines) is pure text logic for stored forecasts; it would sit better as `lib/forecast/text.ts`, split into names, due dates and track-record words. Medium.
5. Test builders are spread over `lib/readiness/testUtils.ts` (`makeWorkout`, used by some 40 test files across the repo), `lib/data/testUtils.ts`, `lib/rebuild/testHelpers.ts`, `lib/strength/testHelpers.ts`, `lib/workout/testFixtures.ts`, with three naming schemes. Move the general record builders to one shared test module. Medium.
6. `src/hooks/useWeightChances.ts` (`weightChancesFrom`) and `src/hooks/useLogEdit.ts` (`countDifferences`) hold pure logic that belongs in `src/lib`; `components/Dashboard/MuscleHeatCard.tsx` and `app/exercises/page.tsx` still read Dexie directly (on the R8 allowlist). Small to medium.
7. `components/ui/logo.tsx` (`Logo`) is used only by its test; wire it in or drop it. Trivial.
