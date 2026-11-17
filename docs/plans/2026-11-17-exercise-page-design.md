# One page per exercise, with a weight per set for the next session

Status: approved direction from Michael on 2026-11-17 ("next session only" for per-set
weights). Builds on `docs/plans/2026-11-15-strength-model-design.md` and commit 6292979
(target evidence, "Plan · You" for home exercises).

## Why

Michael, on the live site (2026-11-17):

- The Bulgarian split squat page (`/progress/lift/squat?as=bulgarian_split_squat`) "is
  still about squat as opposed to specifically bulgarian split squats". The top half is
  the split squat's; the bottom half is the barbell squat's 1RM, charts and starting
  weights, with a note that the 1RM "comes from barbell squat sets".
- "the row page when I click the arrow goes to a different type of page than the squats
  or the press". Only the four program lifts have a lift page. Every other arrow on
  Today opens `/exercises/<id>`, the form reference (demo, muscles, how-to, an empty 1RM
  box), with no next weight, no Adjust weight and no sessions.
- "I should be also able to set the weight for a set". Per-set weights exist only in
  Edit workout (for that one workout) and, mid-workout, for the next set only.

## Decisions

1. Every exercise has one page, about that exercise: `/exercises/<id>`. Every arrow
   (Today, Coming up, Ready, the Log, Progress) opens the page of the exercise actually
   performed. `/progress/lift/<lift>` stays as the barbell lift's page and renders the
   same component; `?as=<home exercise>` sends to that exercise's page.
2. The page leads with training (next session, its sessions, its strength, its weight
   changes), then a short "Counts toward" card, then form and muscles in a second tab.
3. Per-set weights set on the page apply to the next session that does that exercise
   at that tier, then are used up. Not a standing pattern.
4. "Plan · You" applies to every exercise with a weight of its own: barbell lifts by
   tier, T3s and home exercises (home already done in 6292979).
5. Mid-workout, any set still to come can have its weight changed, not only the next.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| E1 | `ExercisePage` renders for every catalogue exercise at `/exercises/<id>` with tabs Training (default) and Form (today's `ExerciseDetail` content). `/progress/lift/<lift>` renders it for the barbell lift; `?as=<id>` replaces the URL with `/exercises/<id>` (client-side; the iPhone build is static) | Page tests: squat, Bulgarian split squat, Dumbbell row and an exercise never planned all render; `?as=` lands on the home exercise |
| E2 | Training tab, in order: header (name, photo or figure, eyebrow "T1 · Squat", "Home version of Squat", "T3 · Pull", "Accessory"); Next session card; its sessions; its strength; its weight changes; Counts toward. Nothing below the header is about another exercise except the Counts toward card | Page test on the BSS page has no barbell squat 1RM chart, no squat starting weights, no "comes from barbell squat sets" text |
| E3 | Next session card: weight as lifted (per hand where it is per hand), tier, scheme, how the plan reached it (existing lines, with their evidence icons), "Plan · You" when set by hand, Adjust weight (that exercise only, from now on), and the set chips (E5). An exercise not in the coming rotation says so and shows its last weight | Component tests for a program lift, a home exercise, a T3 and an unplanned exercise |
| E4 | Its strength: the exercise's own estimated max trend from its own T1 sets (`sessionEstimates`), and for T3 the last-set reps against the 25-rep threshold. Its weight changes: only adjustments for this exercise (`variant.exerciseId` for a home exercise; the lift's own, without `variant`, for a barbell lift) | Tests: BSS weight changes exclude squat starting weights |
| E5 | `SetPlanEditor`: the sets as chips; tap a chip to change its weight (and reps) with steppers; a changed chip shows the plan's number beside yours; "Back to plan" clears all. Used on the page (E6), in Edit workout (replacing its per-set editor) and for every set still to come in the active workout (E8) | Component tests |
| E6 | Next-session set plans: `UserSettings.nextSetPlans`, keyed by `nextSetPlanKey(performed exerciseId, tier)`. Applied to the next plan that has that exercise at that tier (Today, Ready, Edit workout, the page) as a `setWeights` edit, saved in the session's `planEdits` when it starts, and removed when a session that logged that exercise at that tier is finished. Discarding the workout keeps it | Lib tests for apply and consume; hook test that Today's plan shows the per-set weights |
| E7 | "Plan · You" for barbell lifts and T3s: `LiftState.t1PlannedWeight` / `t2PlannedWeight` / `t3PlannedWeight`, set by a manual adjustment of that tier's weight (the weight before the first change since the tier was last logged), cleared when the tier is logged or the weight is put back (`BACK_TO_PLAN_NOTE` or equal weight), as `withHandSetWeight` does for home exercises | Fold tests mirroring the home ones |
| E8 | Active workout: tapping any chip of a set still to come opens its steppers; the change applies to that set only; "back to plan" per set | Component and hook tests |
| E9 | Counts toward: a home exercise shows the program lift's pooled estimate, what this exercise's latest session or target says ("≈ squat 205"), the ratio and its pairs, and a link to the lift; a barbell lift lists its home versions with their ratios; anything else lists the muscles it trains, linking to the muscle view | Component tests |
| E10 | All links go to the performed exercise's page (`liftPageHref` and every other builder); old URLs keep working | Link tests; the existing lift page tests updated on purpose |

## Out of scope

- A standing per-set pattern (decision 3).
- Per-set weights counting as strength evidence. Only a weight set by hand for a home
  exercise does (`target-evidence`).
- Dashboards.

## Data

No database change. `nextSetPlans` lives in the settings JSON, which already syncs. The
new `LiftState` fields are derived by the rebuild on each device.

## Packages (parallel, Opus, exclusive lanes, separate worktrees)

Contracts commit first (types, signatures and stubs), then:

| Package | Requirements | Lane |
|---|---|---|
| P1 data | E6, E7 | `src/lib/workout/nextSetPlans.ts`, `src/lib/rebuild/**`, `src/lib/workout/variant.ts` (shared helpers only), `src/hooks/**`, `src/db/**`, `src/components/PreWorkout/useWorkoutSetup.ts`, completion save path |
| P2 page | E1, E2, E3, E4, E9, E10 | `src/components/ExercisePage/**` (new), `src/app/exercises/**`, `src/app/progress/lift/**`, `src/components/Lift/**`, `src/components/Exercises/**`, `src/components/Today/todayModel.ts`, other link builders |
| P3 sets | E5, E8 | `src/components/SetPlan/**` (new), `src/components/ActiveWorkout/**`, `src/app/workout/active/**`, `src/components/PreWorkout/EditEntryRow.tsx` |

Lead: contracts, integration, full suite, browser check of the deployed preview, review.
