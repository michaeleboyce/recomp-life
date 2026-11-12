# Foundation refactor: implementation plan

Companion to `2026-11-11-foundation-refactor-design.md`, which holds the context, the
defect list (D1-D9), the requirements (R1-R13) and the task definitions (A1-A7, B1-B8).
This file holds what an implementer needs: the contracts, the lanes and the rules.

## Rules for every work package

1. Work only in your own git worktree and branch. Never touch `main`, the main checkout,
   another agent's files, or anything on the forbidden list. Never push.
2. Edit only the files in your lane. If the job seems to need a file outside it, stop
   and report that instead of editing it.
3. TDD: write the failing test, watch it fail, implement, watch it pass.
4. Contract signatures (exported names, parameters, return types) do not change. If one
   is wrong, report it; do not work around it.
5. Pure logic goes in `src/lib/` with no React and no database imports. Only
   `src/lib/data/**`, `src/hooks/**`, `src/db/**` and `src/lib/sync.ts` may import
   `@/db/local`.
6. Weights are lbs, durations are seconds, every stored record has a `clientId`.
7. Finish with `npx vitest run` and `npx tsc --noEmit`, commit on your branch with a
   conventional commit message, and report: files changed, "X/Y tests passing
   (Z pre-existing failures)", the `tsc` result, and anything left undone.

### Forbidden list (owned by other sessions until they merge)

`src/lib/evidence/**`, `src/lib/restTimes.ts`, `src/components/Evidence/**`,
`src/app/research/**`, `src/lib/progression.ts`, `src/lib/e1rm.ts`, `src/lib/recovery.ts`,
`src/lib/weightDecay.ts`, `src/lib/inactivity.ts`, `src/lib/runRecovery.ts`,
`src/lib/accessories.ts`, `src/lib/exercises.ts`, `src/lib/volumeTracking.ts`,
`src/lib/autoAdapt.ts`, `src/types/index.ts`, `src/components/BodyMap/BodyMapSVG.tsx`,
`src/components/Anatomy/**`, `src/components/ExerciseDemo/**`, `src/components/BottomNav.tsx`,
`src/app/workout/active/page.tsx`, `src/app/workout/configure/page.tsx`,
`src/app/workout/summary/page.tsx`, `src/app/page.tsx`, `src/app/program/page.tsx`,
`src/app/tools/page.tsx`, `src/app/settings/page.tsx`, `src/app/exercises/**`,
`src/app/1rm-calculator/page.tsx`, `src/components/ActiveWorkout/{ExerciseBlock,
WorkoutOverviewSheet,RestTimer,AMRAPIndicator,RPESelector}.tsx`,
`src/components/Dashboard/{NextWorkoutCard,RecoveryStatusBars,E1RMSummary,ActivePainBanner,
InactivityBanner,WeekSummary}.tsx`, `src/components/PreWorkout/{ReadinessCheck,
AccessoryPicker}.tsx`, `src/components/Charts/VolumeBars.tsx`,
`src/components/WorkoutSummary/LiftResult.tsx`, `src/components/Exercises/ExerciseRow.tsx`,
`public/sw.js`, `vitest.config.ts`, `CLAUDE.md`, `README.md`.

Reading these files is fine and often necessary. Importing from them is fine.

## Contracts

### Code contracts (committed as stubs)

- `src/lib/workout/` : `types.ts` is final. Every other file exports its final
  signatures with a body that throws. The `workout-domain` package fills them in.
- `src/lib/data/workouts.ts`, `src/lib/data/records.ts`, `src/hooks/index.ts`: final
  signatures, throwing bodies. The `data-layer` package fills them in and may split
  `src/hooks/index.ts` into one file per area as long as it keeps re-exporting the same
  names.
- `src/architecture.test.ts` + `src/architecture.allowlist.ts`: the ratchet for R8/R9.
  A migrated file must be removed from the allowlist in the same commit.

### Design-system contract (implemented by `design-system`)

Tokens, defined for light and dark in `src/app/globals.css` and mapped in
`@theme inline` so the Tailwind classes below exist:

| Token | Classes it enables | Meaning |
|---|---|---|
| `--tier-t1`, `--tier-t1-soft` | `bg-tier-t1`, `text-tier-t1`, `border-tier-t1`, `bg-tier-t1-soft` | T1 heavy lift |
| `--tier-t2`, `--tier-t2-soft` | `…-tier-t2`, `…-tier-t2-soft` | T2 volume lift |
| `--tier-t3`, `--tier-t3-soft` | `…-tier-t3`, `…-tier-t3-soft` | T3 isolation |
| `--tier-accessory`, `--tier-accessory-soft` | `…-tier-accessory…` | Optional accessory |
| `--tier-warmup`, `--tier-warmup-soft` | `…-tier-warmup…` | Warm-up set |
| `--success-soft`, `--warning-soft`, `--info-soft`, `--destructive-soft` | `bg-success-soft` … | Tinted backgrounds for the existing `success`, `warning`, `info`, `destructive` |

The solid tier colours keep today's hues (T1 red, T2 orange, T3 blue) expressed in
oklch and tuned to sit with the sage accent; `-soft` is the same colour at low alpha,
for use as a background behind text of the solid colour.

`src/lib/tierStyle.ts`

```ts
import type { Tier } from "@/types";
export interface TierStyle {
  label: string;      // "T1", "T2", "T3", "Accessory", "Warm-up"
  solid: string;      // e.g. "bg-tier-t1 text-white"
  soft: string;       // e.g. "bg-tier-t1-soft text-tier-t1"
  text: string;       // e.g. "text-tier-t1"
  border: string;     // e.g. "border-tier-t1"
  dot: string;        // e.g. "bg-tier-t1"
  dotMuted: string;   // e.g. "bg-tier-t1-soft"
}
export function tierStyle(tier: Tier): TierStyle;
```

`src/components/ui/tier-badge.tsx`

```tsx
export function TierBadge(props: { tier: Tier; variant?: "solid" | "soft"; className?: string }): JSX.Element;
```

`src/components/ui/callout.tsx`

```tsx
export type CalloutVariant = "info" | "success" | "warning" | "danger";
export function Callout(props: {
  variant?: CalloutVariant;          // default "info"
  title?: React.ReactNode;
  icon?: React.ReactNode;            // defaults to a Lucide icon per variant; `null` hides it
  actions?: React.ReactNode;         // buttons, rendered in a wrapping row under the body
  children?: React.ReactNode;        // body
  className?: string;
}): JSX.Element;                     // role="status" for info/success, role="alert" for warning/danger
```

`src/components/ui/page-shell.tsx`

```tsx
// Replaces the repeated `mx-auto max-w-lg px-5 pt-5 pb-28` wrapper.
export function PageShell(props: { children: React.ReactNode; className?: string }): JSX.Element;
export function PageHeader(props: {
  title: React.ReactNode;
  backHref?: string;                 // renders a back link with an accessible name
  action?: React.ReactNode;          // right-aligned slot
  className?: string;
}): JSX.Element;
```

`src/components/ui/stagger.tsx`

```tsx
// Replaces the repeated `animate-in fade-in slide-in-from-bottom-3 fill-mode-both`
// wrapper with inline animationDelay. Children animate in order, 50ms apart by default.
export function Stagger(props: { children: React.ReactNode; stepMs?: number; className?: string }): JSX.Element;
```

## Waves and lanes

| Wave | Package | Model | Lane (exclusive) | Tasks |
|---|---|---|---|---|
| 1 | `workout-domain` | Fable | `src/lib/workout/**` (except `types.ts`), `src/components/ActiveWorkout/SetProgressList.tsx` + its test | A1, A4 |
| 1 | `data-layer` | Opus | `src/lib/data/**`, `src/hooks/**`, `src/db/init.ts`, `src/components/DbProvider.tsx`, `src/components/AppChrome.tsx`, `src/app/layout.tsx` | A2, A3, A5 |
| 1 | `design-system` | Sonnet | `src/app/globals.css`, `src/lib/tierStyle.ts`, `src/components/ui/{tier-badge,callout,page-shell,stagger}.tsx` + tests | A6 |
| 2 | `migrate-pages` | Sonnet | `src/app/{weigh-in,body-check,plate-calculator,history}/page.tsx`, `src/components/{RunLogger,WeighInPrompt}.tsx` | B5, B6 |
| 2 | `migrate-components` | Sonnet | `src/components/Dashboard/{WeightTrend,GymDebtBanner,AbandonedWorkoutBanner}.tsx`, `src/components/BodyMap/{RegionDetail,PainHistory}.tsx`, `src/components/Charts/BodyweightChart.tsx`, `src/components/Settings/ExercisePreferencesEditor.tsx`, `src/components/SyncProvider.tsx`, `src/components/ActiveWorkout/WorkoutMiniMap.tsx`, `src/components/WorkoutSummary/EquipmentAdaptedResult.tsx` | B5, B6 |
| 3 | `active-page`, `configure-page`, `summary-history`, `dashboard-rest` | see design doc | assigned after the evidence and anatomy branches are on `main` | B1-B8 |

Wave 2 is two packages, not the three sketched in the design doc: once the offenders
were listed, the untouched workout components came to three files, so they were folded
into `migrate-components`.

The architecture allowlist is shared by Wave 2 packages. Each removes only the lines for
files in its own lane.

## Integration (lead, after each wave)

1. Merge each package branch into `refactor/foundation`.
2. `npx vitest run`, `npx tsc --noEmit`, `npm run lint`.
3. Independent review of the wave diff against R1-R13 and the forbidden list.
4. Playwright acceptance checks at 390x844 on a local dev server with a dummy
   `DATABASE_URL` (never the real database, no sync passphrase).
5. Report. Nothing reaches `main` without Michael's say-so.
