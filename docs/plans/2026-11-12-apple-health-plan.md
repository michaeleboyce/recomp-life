# Apple Health sync: execution plan

Spec: [2026-11-12-apple-health-design.md](2026-11-12-apple-health-design.md). Requirement ids (R1 to R14) refer to it.

## Rules for every work package

1. Work in your own worktree and branch, created from `feat/apple-health`. Never push, never merge, never deploy. The lead integrates.
2. Edit only the files in your lane. If something outside it must change, stop and report it. Three other sessions are editing this repository; the lane table in the design doc says which files are theirs.
3. TDD: failing test, implement, green. Pure logic lives in `src/lib` with a test file beside it.
4. Contract signatures in `src/lib/health/types.ts` are fixed. Additions are fine; changes need the lead.
5. Only `src/native/healthkit.ts` imports a Capacitor health plugin. Nothing under `src/lib/health` imports React, the database or Capacitor.
6. Weights in lbs, distances in miles, durations in seconds unless a field name says minutes. Health-side shapes carry SI units (kg, metres, seconds) and are converted in `src/lib/health/units.ts`.
7. Values from Apple Health other than sleep (R10) never feed a coaching rule (R11).
8. Do not touch the real database, read `.env*` files or run `drizzle-kit`.
9. Report: what was built, files changed, "X/Y tests passing (Z pre-existing failures)", `npx tsc --noEmit` result, and anything left open.

## Contracts

| Contract | File | Implemented by |
|---|---|---|
| `HealthSource`, `HealthWeight`, `HealthWorkout`, `HealthSleepSample`, `HealthQuantitySample`, `HealthCategory`, `HealthDailyValues`, `SessionHealth` | `src/lib/health/types.ts` | contracts commit |
| `kgToLbs`, `metresToMiles` | `src/lib/health/units.ts` | mapping |
| `mapWorkout`, `isStrengthWorkout` | `src/lib/health/mapWorkout.ts` | mapping |
| `findManualMatch`, `HEALTH_MATCH_WINDOW_MINUTES` | `src/lib/health/dedupe.ts` | mapping |
| `linkSessionWorkout`, `HEALTH_SESSION_OVERLAP` | `src/lib/health/linkSession.ts` | mapping |
| `nightlySleep`, `sleepBucket`, `SLEEP_SHORT_HOURS`, `SLEEP_FULL_HOURS` | `src/lib/health/sleep.ts` | mapping |
| `foldDaily`, `localDateKey` | `src/lib/health/daily.ts` | mapping |
| `createFakeHealthSource` | `src/lib/health/fakeSource.ts` | mapping |
| `apiUrl` | `src/lib/apiBase.ts` | shell |
| `isNativeApp` | `src/native/platform.ts` | shell |

## Lanes

| Wave | Gate | Package | Model | Exclusive lane | Requirements |
|---|---|---|---|---|---|
| 0 | plan approved | lead | Fable | `docs/plans/2026-11-12-apple-health-*`, `src/lib/health/types.ts` | all |
| 1 | Wave 0 committed | shell | Fable | `capacitor.config.ts`, `ios/**`, `next.config.ts`, `package.json` (dependencies and scripts), `src/lib/apiBase.ts`, `src/native/platform.ts`, `src/app/progress/lift/[id]/**` (server wrappers only), `src/components/ServiceWorkerRegistration.tsx`, `scripts/build-native.*` | R1, R2 |
| 1 | Wave 0 committed | mapping | Fable | `src/lib/health/**` except `types.ts` | R6 to R10 |
| 2 | edit/rebuild session reports its data and sync waves landed | data | Opus | additive entries in `src/types/index.ts`, `src/db/**`, `src/lib/sync/registry.ts`, `src/lib/data/health.ts`, `src/lib/runRecovery.ts`, `src/lib/activities.ts`, `src/lib/evidence/**` | R3, R5, R9, R12 |
| 2 | same | importer | Fable | `src/native/healthkit.ts`, `src/components/HealthProvider.tsx`, `src/app/settings/health/**`, one line in `src/app/layout.tsx`, one row in `src/app/settings/page.tsx` | R4, R5, R13, R14 |
| 3 | UI-refresh session reports Progress and PreWorkout landed | metrics-ui | Opus | `src/lib/metrics/health.ts`, registry lines in `src/lib/metrics/{types,index}.ts`, `src/components/Progress/RecoveryTab.tsx`, `ProgressHub.tsx` tab entry, `BodyTab` section, readiness prefill, summary heart-rate line | R8, R10, R11 |
| 4 | all merged | lead | Fable | integration, device walkthrough, review | all |

Before each wave the lead checks which sessions are running and messages the owning session with the exact files the wave touches. A wave does not start until its gate is confirmed by that session.

## Things only Michael can do

- Enrol in the Apple Developer Program and sign in to Xcode.
- First run on the phone: select the signing team, connect the iPhone, press Run.
- Approve the HealthKit permission sheet on the phone.
- Say when the Postgres change for `health_daily` and the new columns may be applied.
