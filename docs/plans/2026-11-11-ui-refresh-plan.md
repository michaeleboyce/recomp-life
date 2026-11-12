# UI refresh: implementation plan

Companion to `2026-11-11-ui-refresh-design.md` (findings F1-F11, principles, requirements
U1-U18, architecture, waves, deploy checkpoints). This file holds the working rules and the
contracts as they are committed.

## Rules for every work package

1. Work only in your own git worktree and branch. Never touch `main`, the main checkout or
   another package's files. Never push.
2. Edit only the files in your lane. If the job seems to need a file outside it, stop and
   report that instead of editing it.
3. TDD: failing test first, then the implementation.
4. Contract signatures (exported names, parameters, return types) do not change. If one is
   wrong or awkward, report it; do not work around it silently.
5. Pure logic lives in `src/lib/` with no React and no database import. Only
   `src/lib/data/**`, `src/hooks/**`, `src/db/**` and `src/lib/sync.ts` may import
   `@/db/local`. `src/architecture.test.ts` enforces this and the no-raw-palette-class rule
   for `src/app` and `src/components`; never weaken that test or add to its allowlist.
6. Weights are lbs, durations are seconds, dates are `Date` objects in records and epoch
   milliseconds in metric points. A date read from a record may be an ISO string on rows
   that were synced from another device before the fix: always wrap with `new Date(x)`.
7. Reuse what exists. Before writing a calculation, look for it in `src/lib/` (`e1rm`,
   `rateOfLoss`, `volumeTracking`, `muscleLoad`, `streaks`, `dates`, `deload`,
   `stallDetection`, `inactivity`, `volumeRatio`, `painAutoClear`, `progression`,
   `workout/*`).
8. Finish with `npx vitest run` and `npx tsc --noEmit` clean, lint your files, commit on your
   branch with a conventional commit message, and report: branch, commit, files changed,
   "X/Y tests passing (Z pre-existing failures)", the `tsc` result, every judgment call, and
   anything left undone.

Baseline on `main` at `e4ab27d`: 1226 passing, 1 skipped; `tsc` clean.

## Contracts committed so far (Wave 1 library lanes)

| Contract | File | Implemented by |
|---|---|---|
| Metric types (`Point`, `Series`, `MetricSource`, `MetricDef`, `MetricId`, `RangeKey`, `SeriesSummary`) | `src/lib/metrics/types.ts` (final) | n/a |
| `METRICS`, `getMetric`, `computeMetric`, `inRange`, `summarize`, `bucket` | `src/lib/metrics/index.ts` | `metrics` |
| `useReadinessLogs`, `useMetricSource`, `useMetric` | `src/hooks/useMetric.ts` | `metrics` |
| `generateDemoData` | `src/lib/demo/generateDemoData.ts` | `metrics` |
| `Insight`, `InsightContext`, `computeInsights` | `src/lib/insights/index.ts` | `insights` |
| `repsToBeat`, `prChance`, `describePrOpportunity`, `fitTrend`, `measureBaseline`, `projectE1RM` | `src/lib/projection/index.ts` | `projection` |
| Projection evidence rules (dose-response, rate of gain, energy deficit) | `src/lib/evidence/rules/**`, `src/lib/evidence/sources.ts` | `projection-research` |

Chart kit, UI shell, navigation and screen contracts are added after the mock-ups are signed
off (design doc, Step 1).

## Lanes, Wave 1 library packages

| Package | Model | Lane (exclusive) | Requirements |
|---|---|---|---|
| `metrics` | Fable | `src/lib/metrics/**` except `types.ts`, `src/hooks/useMetric.ts` (+ export from `src/hooks/index.ts`), `src/lib/demo/**`, tests | U7 |
| `insights` | Opus | `src/lib/insights/**`, tests | U9 |
| `projection-research` | Opus | `docs/research/**`, `src/lib/evidence/rules/**`, `src/lib/evidence/sources.ts`, `src/lib/evidence/changelog.ts`, regenerated `docs/coaching-rules.md` | U18 (inputs) |
| `projection` | Fable | `src/lib/projection/**`, tests | U17, U18 |
