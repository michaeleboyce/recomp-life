# Apple Health sync for ReComp Life

## Context

ReComp Life runs today as a web app on Vercel. HealthKit is only reachable from a native iOS
app, so syncing with Apple Health means two things: wrapping the app for the iPhone (the
original build plan's Phase 7, never started: no Capacitor packages, no `ios/` directory), and
building an importer that turns Health data into the app's own records.

Decisions you made for this plan:

- **Apple account:** you will enrol in the paid Developer Program; early phases can start on a
  free Apple ID.
- **Packaging:** the built site ships inside the app, so it opens with no signal at the gym.
- **Read from Health:** bodyweight, sleep, outside workouts, steps, resting heart rate, HRV, and
  other relevant metrics (list in R9).
- **Lifting sessions:** you record them on the Apple Watch, so the app does not write a second
  workout. It links the Watch workout to the session and shows its heart rate and calories.

**Outcome:** on the phone, opening the app pulls new Health data in. Weigh-ins and outside
workouts appear without typing, last night's sleep prefills the pre-workout check, each lifting
session shows the Watch's heart rate and calories, and sleep, resting HR, HRV, steps and
nutrition get trend charts.

Base: `origin/main` at `d49acc1`, branch `feat/apple-health`, worktree
`.claude/worktrees/apple-health`. Execution detail: [2026-11-12-apple-health-plan.md](2026-11-12-apple-health-plan.md).

## What the other sessions told me (constraints)

| Session | Constraint this plan follows |
|---|---|
| `evidence-registry-coaching-rules` | Imported sleep may feed the existing `readiness` rule if mapped to its three buckets (update `appBehavior`, add a changelog entry). HRV, resting HR and steps are **display only**: no load changes, no deload triggers. Imported workouts have no effort rating, and `run-interference` / `activity-fatigue` key on effort: leave it empty, never infer it. It plans soft-delete + `updatedAt` on every synced table: imported rows need a stable external id, and a soft-deleted imported row must not be re-imported. Agree Dexie version and Postgres columns with it before adding mine. |
| `deep-ui-refresh-trends` | Write through `src/lib/data/records.ts`, read through `src/hooks`. Every trend is a metric in `src/lib/metrics/` fed by `MetricSource`; add records and metrics there and charts work. In flight, stay out: `src/app/more/**`, `src/components/Today/**`, `src/components/PreWorkout/**`, `src/components/ActiveWorkout/**`. It will split the settings page later: tell it before adding a section. Offered a new Progress "Recovery" tab slot. |
| `interactive-anatomy-exercise-demos` | 3D assets use root-absolute same-origin paths, fine when bundled; `.wasm` must be served as `application/wasm`; the service worker does nothing inside the app. It is planning editable workouts and favourites: read what was performed from `session.sets`, not the template. It adds optional fields to `WorkoutSession` and a `favoriteWorkouts` table, so it also needs a Dexie version bump. |

Later replies changed the picture, and the plan is sequenced around them:

- The evidence session (now named `edit-delete-log-entries`, branch `feat/edit-rebuild`, approved
  and under way) is **replacing the data layer and sync schema**: a fresh single-version Dexie
  database, `updatedAt: number` / `deletedAt: number | null` / `externalId?: string` on every
  synced row, one sync registry at `src/lib/sync/registry.ts` in place of the three table lists,
  and Postgres recreated from one script at its deploy checkpoint D1. `sets`, `lift_states` and
  `estimated_1rms` stop syncing. It is also taking over `src/app/log/page.tsx`.
- The UI session's review-fixes agent is editing `RunsTab.tsx` and
  `src/components/Progress/runs/*` now. It gave me the Recovery tab (key `recovery`) and asked
  that the existing `ReadinessSection` move into it, after its "landed" message.

So this plan **does not make its own schema change**. My fields ride on the evidence session's
schema: its `externalId` is reused, and I add only `source`, `sourceName`, nullable effort, the
`health` field on workouts, the two readiness fields and the `healthDaily` table, as one
registry entry and one Drizzle table, in its conventions.

### File ownership while four sessions are running

| Files | Owner now | What I do |
|---|---|---|
| `src/db/**`, `src/lib/sync*`, `src/app/api/sync/**`, `src/lib/data/**`, `src/types/index.ts` (record types), `src/app/log/**` | evidence session | Nothing until its contracts commit is on `main`; then additive entries only |
| `src/components/Progress/runs/*`, `RunsTab.tsx`, `src/components/Today/**`, `src/components/PreWorkout/**`, `src/components/ActiveWorkout/**`, `src/app/more/**`, settings page layout | UI session | Nothing until its "landed" message; settings gets one link row |
| `WorkoutSession` optional fields, `favoriteWorkouts` table, `completeWorkout.ts` | anatomy session | Read performed work from `session.sets`; my `health` field is a separate optional field |
| New and mine alone: `capacitor.config.ts`, `ios/**`, `src/native/**`, `src/lib/health/**`, `src/lib/apiBase.ts`, `src/lib/metrics/health.ts`, `src/components/HealthProvider.tsx`, `src/app/settings/health/**`, `src/components/Progress/RecoveryTab.tsx` | this session | Free to build |
| Shared single-line edits: `next.config.ts`, `package.json`, `src/app/layout.tsx`, `ProgressHub.tsx`, `src/lib/metrics/types.ts` and `index.ts` | whoever merges | Smallest possible diff, announced to the others before merging |

Rules I follow throughout: work only in my own worktree off `origin/main`, never in the main
checkout or another session's worktree; message the owning session before touching a file in
its column and wait for the answer; rebase on `origin/main` before each merge request;
merging to `main` and anything on the live Neon database are your call.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| R1 | The app builds as a static bundle and runs inside a Capacitor iOS shell, with every screen working offline | Airplane mode on the phone: open app, start and finish a workout, open an exercise's 3D view |
| R2 | The Vercel web build is unchanged | `npm run build` output still has `/api/sync/*`; web app behaves as before |
| R3 | Sync to Neon works from the native app | Enter passphrase in the app, push and pull succeed against the Vercel API |
| R4 | The user connects Apple Health from a settings screen, chooses categories, and can import on demand | Health permission sheet appears once; toggles persist; "Import now" reports counts |
| R5 | Import runs automatically when the app opens or returns to the foreground, at most every 15 minutes, and is idempotent | Import twice: second run adds 0 rows |
| R6 | Health bodyweight samples become weigh-ins | Add a weight in the Health app, open ReComp: it shows in Progress > Body, in lbs |
| R7 | Health workouts become runs or activities, de-duplicated against manual entries, with effort left empty | A Watch run appears once; a run already logged by hand is linked, not duplicated; no fatigue advisory fires from an unrated import |
| R8 | A Watch strength workout overlapping a lifting session is linked to that session and never imported as an activity | Workout summary and history show avg HR and active calories; activity log has no "strength" row |
| R9 | Daily health values are stored one row per day: sleep, steps, resting HR, HRV, active energy, exercise minutes, VO2 max, body fat %, lean mass, dietary energy, dietary protein | Unit tests for aggregation; rows visible after import |
| R10 | Last night's sleep prefills the readiness check; the user can change it | Configure shows the bucket selected with "7h 12m from Apple Health" |
| R11 | Each daily value is a metric with a trend chart; nothing in R9 changes a weight, a suggestion or a deload | Progress > Recovery shows the charts; grep shows no lib rule reading `healthDaily` apart from R10 |
| R12 | Evidence convention is followed for every behaviour change | `readiness`, `run-interference`, `activity-fatigue` rules and `changelog.ts` updated; `npm run docs:evidence` clean |
| R13 | On the web, all Health UI is hidden or explains that it needs the iPhone app, and nothing imports | Web build: no plugin code runs; settings shows the explanation |
| R14 | Health data stays on the device and in the user's own Neon database; nothing else receives it | Code review: no other network destination |

Out of scope for this plan, listed so they are not forgotten: background delivery while the app
is closed, writing weigh-ins or workouts to Health, Android Health Connect, an Apple Watch app,
and any coaching rule driven by HRV or resting HR (needs sources first, per the evidence
session).

## Design

### Native shell (R1-R3)

- Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/app`),
  `capacitor.config.ts` with `webDir: "out"`, app id `com.recomplife.app`. `ios/` is committed.
- `next.config.ts` switches on `BUILD_TARGET=native`: `output: "export"`, `trailingSlash: true`,
  `images.unoptimized`. The web build is untouched.
- API routes cannot be exported. The native build excludes them with the `pageExtensions`
  technique (route files renamed `route.server.ts`, extension enabled only for the web build).
  If Next 16 rejects that, fall back to a build script that moves `src/app/api` aside.
- `src/app/progress/lift/[id]` and its `projection` child are client pages using `useParams`;
  each gets a small server wrapper with `generateStaticParams`, like `src/app/exercises/[id]`.
- New `src/lib/apiBase.ts`: empty on web, the Vercel URL in the native build
  (`NEXT_PUBLIC_API_BASE`). `src/lib/sync.ts` prefixes its three fetches with it.
- The three sync routes answer `OPTIONS` and allow origin `capacitor://localhost` with the
  `Authorization` header, through one tested helper in `src/lib/syncGuard.ts`.
- `ServiceWorkerRegistration` does nothing on native (assets are already in the bundle).
- iOS project: HealthKit capability, `NSHealthShareUsageDescription`, portrait, safe areas.
- Scripts: `build:native` (export + `cap sync ios`), `ios` (`cap open ios`).
- The native app has its own empty database. The app is unused so far, so there is nothing to
  move; entering the sync passphrase pulls whatever is in Neon.

### Health access layer (R4, R13)

- `src/lib/health/types.ts`: plugin-neutral shapes (`HealthWeight`, `HealthWorkout`,
  `HealthSleepSample`, `HealthDailyValue`) and the `HealthSource` interface
  (`isAvailable`, `requestAccess`, `readWeights`, `readWorkouts`, `readSleep`, `readDaily`).
- `src/native/healthkit.ts`: the only file that imports the plugin, loaded dynamically behind
  `Capacitor.isNativePlatform()`. Plugin: `@capgo/capacitor-health` v8 (reads weight, sleep
  with stages, workouts, steps, resting HR, HRV, VO2 max, body fat, dietary energy).
- Phase 1 includes a spike on the phone to confirm the plugin returns workout UUID, source
  name, indoor flag and heart-rate statistics, and to find the gaps (dietary protein and lean
  mass are not in its documented list). Gaps are filled by a small local Swift Capacitor
  plugin behind the same interface; nothing above `HealthSource` changes.
- `src/lib/health/fakeSource.ts` for tests and for exercising the UI in a browser.

### Pure mapping logic in `src/lib/health/` (R6-R10), all with tests

- `units.ts`: kg to lbs, metres to miles.
- `mapWorkout.ts`: HealthKit activity type to `RunLog` (running; `treadmill` when indoor,
  category `other`) or `ActivityLog` (cycling, hiking, walking, yoga; everything else `other`
  with the Health type name in `notes`). Strength types are excluded here.
- `dedupe.ts`: an import matches a manual entry of the same kind when start times are within
  `HEALTH_MATCH_WINDOW_MINUTES` (30); the manual row keeps its effort rating and gains the
  external id.
- `linkSession.ts`: picks the strength workout overlapping a `WorkoutSession` by at least
  `HEALTH_SESSION_OVERLAP` (0.5) of the session's duration.
- `sleep.ts`: sums asleep stages into one night, attributed to the wake date;
  `sleepBucket(minutes)` returns `SleepHours` using `SLEEP_SHORT_HOURS` (5) and
  `SLEEP_FULL_HOURS` (7), the same cut-offs the buttons use today.
- `daily.ts`: folds samples into one `HealthDailyLog` per local date.

### Data model

- `RunLog`, `ActivityLog`, `BodyweightLog`: add optional `source: "manual" | "apple_health"`
  (absent means manual) and `sourceName: string | null`. The HealthKit UUID goes in the
  `externalId` field these rows already have through `Stamped`. `perceivedEffort` becomes
  `1-5 | null` on runs and activities.
- Imported rows use `id = clientId = "hk:<HealthKit UUID>"`, so a re-import, a second device and
  a soft-deleted row all resolve to the same record. Soft-deleted rows stay findable by
  `clientId` (confirmed by the evidence session), so a deleted import is never brought back.
- Field names, stamps (`updatedAt`, `deletedAt`) and the sync registry entry follow the
  evidence session's contracts commit; the list below is what I add on top of it.
- `WorkoutSession`: optional `health: { externalId, sourceName, avgHeartRate, maxHeartRate,
  activeEnergyKcal, durationSeconds }`.
- `ReadinessLog`: optional `sleepMinutes`, `sleepSource`.
- New `HealthDailyLog` and table `healthDaily` (`id = clientId = "hd:<YYYY-MM-DD>"`, nullable
  column per value in R9), synced like every other table: one entry in `SYNC_REGISTRY`
  (`src/lib/sync/registry.ts`), the Dexie store in `src/db/local.ts` and the Drizzle table in
  `src/db/schema.ts`.
- Import cursors and category toggles are per device: `localStorage`, next to the sync key.
- `run-interference` and `activity-fatigue` skip rows whose effort is null
  (`src/lib/runRecovery.ts`, `src/lib/activities.ts`); `runEffort` metric skips them too.

### Import and UI

- `src/lib/data/health.ts`: `runHealthImport(source, now)` reads each enabled category since its
  cursor (first run: 365 days), maps, de-duplicates and writes in one transaction per category;
  returns counts. New writers in `src/lib/data/records.ts` for imported rows and
  `upsertHealthDaily`; `linkHealthWorkout` in `src/lib/data/workouts.ts`.
- `src/components/HealthProvider.tsx` mounted in `src/app/layout.tsx` beside `SyncProvider`:
  imports on launch and on resume, throttled; no-op on web.
- `src/app/settings/health/page.tsx`: connect, category toggles, last import, "Import now",
  and a note that iOS never reveals a denied read permission. `src/app/settings/page.tsx` gets
  one link row only (agreed approach while the UI session plans its settings split).
- Metrics: `healthDaily` added to `MetricSource`; new `src/lib/metrics/health.ts` with
  `sleepHours`, `restingHr`, `hrv`, `steps`, `activeEnergy`, `vo2Max`, `bodyFat`,
  `energyIntake`, `proteinIntake`; new units in `src/lib/metrics/types.ts`.
- `src/components/Progress/RecoveryTab.tsx` (sleep, resting HR, HRV) registered in
  `ProgressHub`; steps, body fat and nutrition as a section in `BodyTab`. Built with
  `chart-kit`, no screen maths.
- Readiness prefill in `src/components/PreWorkout/ReadinessCheck.tsx` and the Configure screen,
  and the heart-rate line on workout summary and history. These touch the UI session's
  in-flight folders, so they wait for its "landed" message.
- Imported runs and activities show their source and a "rate effort" control in the existing
  activity list.

## Execution: spec first, then parallel agents

Step 0 commits `docs/plans/2026-11-12-apple-health-design.md` and `-plan.md` (this content, with
requirement ids) before any code. I lead, write contracts, create one worktree per agent off
`origin/main`, integrate and verify. Agents never touch `main` or each other's files.

Waves are gated on the other sessions, not on the calendar. Wave 1 touches only files that are
mine alone, so it can start while the other three are still working.

| Wave | Starts when | Agent | Work | Requirements | Model |
|---|---|---|---|---|---|
| 0 | plan approved | lead | Spec docs; contracts commit limited to my own new files (`src/lib/health/types.ts`, `HealthSource`, function signatures). Health-side shapes are defined locally so nothing depends on record types that are being rewritten | all | top |
| 1 | after Wave 0 | shell | Capacitor, native build config, `apiBase`, static params wrappers, iOS project, plugin spike on the phone. The CORS helper and the sync fetch prefix are held back to Wave 2 because they sit in the evidence session's files | R1, R2 | top |
| 1 | after Wave 0 | mapping | `src/lib/health/*` pure functions and tests, TDD, plus the fake source | R6-R10 | top |
| 2 | evidence session's data layer and sync registry are on `main` | data | `healthDaily` registry entry and Drizzle table, `source` / `sourceName` / nullable effort, `health` on workouts, readiness fields, record writers, null-effort handling in `runRecovery.ts` and `activities.ts`, rule text and changelog, CORS and `apiBase` in the sync client | R3, R5, R9, R12 | mid |
| 2 | same gate | importer | `src/native/healthkit.ts`, `runHealthImport`, `HealthProvider`, settings/health page | R4, R5, R13, R14 | top |
| 3 | UI session says Progress and PreWorkout have landed | metrics + UI | `metrics/health.ts`, `RecoveryTab` (moving `ReadinessSection` into it), `BodyTab` section, null-effort dash in the runs average, readiness prefill, heart-rate line on summary and history | R8, R10, R11 | mid, lead reviews |
| 4 | all above merged | lead | Integration, device walkthrough, review pass | all | top |

Before each wave I check `ListAgents` and message the owning sessions with the exact files the
wave will touch; a wave does not start until the gate in its row is confirmed by that session.
If the evidence session's Postgres script (checkpoint D1) has not run when Wave 2 is ready, my
columns go into its script; if it has, mine is a small additive script, applied only after you
say so.

The shell agent's device steps (signing, HealthKit capability, running on the phone) need you
at Xcode once; the rest of Wave 1 runs without the phone.

## Verification

- `npx vitest run` after each wave, reported as "X/Y passing (Z pre-existing failures)";
  `npm run docs:evidence` and `npm run lint` clean.
- Web: `npm run build`, then Playwright on the dev server with the fake Health source switched
  on: settings/health import, Progress > Recovery charts, readiness prefill, no duplicate on a
  second import.
- Native bundle: `npm run build:native`, confirm `out/` has every route and no `api/`.
- On the iPhone: airplane-mode workout (R1); passphrase sync (R3); permission sheet and import
  (R4); add a weight in Health and see it in the app (R6); a Watch run appears once (R7); do a
  lifting session with a Watch strength workout and see heart rate on the summary (R8); sleep
  prefill the next morning (R10).
- Conventional commits per wave; nothing is pushed or merged to `main` without your say.
