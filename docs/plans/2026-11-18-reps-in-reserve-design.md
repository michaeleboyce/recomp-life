# Reps in reserve replaces RPE

**Status:** draft for review, 2026-11-18. No code written yet.

## Why

The app asks for effort as RPE on a 6 to 10 scale with half points (8 choices). The
owner wants one simpler question everywhere: "How many more reps could you have done?"
with three answers: **0**, **1-2**, **3+**. The answer must drive the same coaching
decisions RPE drives today.

This fits the evidence the app already cites. `halperin2022` is about how accurately
people predict reps to failure: off by about one rep on average. Three buckets are about
as fine as that accuracy supports, so little real information is lost.

## Scope

About 90 files under `src/` mention RPE: the set type, the selector, T2
auto-regulation, the 1RM estimate, fatigue signals, metrics, the weekly review, the
sleep comparison, set editing, the rebuild engine, demo data, the glossary, the evidence
rules and their tests.

Out of scope: the run effort rating (`RunLog.perceivedEffort`, 1 to 5). Reps in reserve
does not apply to running.

## Data model

```ts
/** Reps the lifter judged they had left after a set. */
export type RepsInReserve = "0" | "1-2" | "3+";
```

- `SetLog.rpe?: number` becomes `SetLog.repsInReserve?: RepsInReserve`. Still optional.
- A new `src/lib/effort.ts` owns the type's helpers and the one numeric mapping used for
  maths, `RIR_ESTIMATE = { "0": 0, "1-2": 1.5, "3+": 3 }`. `3+` uses its floor, so
  anything computed from it is a lower bound.
- `UserSettings.showRPE` becomes `showEffort`.
- `LiftState.recentAvgRPEs` becomes `recentAvgRepsInReserve`.
- No migration of old values: the app has no real training history
  (to be re-confirmed before the build, see Open items).

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| R1 | One effort question everywhere: 0, 1-2, 3+ reps left | The active workout, the set edit sheet and workout detail show three choices; no screen shows "RPE" or a 6 to 10 scale |
| R2 | The answer stays optional; tapping the selected choice clears it | A set can be logged with no answer; nothing downstream guesses one |
| R3 | T2 auto-regulation reads the first T2 set's answer (table below) | Unit tests for every phase × answer; accepting still freezes progression and is not a failure |
| R4 | The 1RM estimate adds `RIR_ESTIMATE` reps before Epley | "0" adds 0, "1-2" adds 1.5, "3+" adds 3; `E1RM_MAX_REPS_IN_RESERVE` becomes 3 |
| R5 | AMRAP guidance uses the same words as the question | T1 last set: "Stop with 1-2 reps left". T3 last set: "Push close to failure (0-2 reps left)" |
| R6 | Fatigue detection uses falling reps in reserve instead of rising RPE | `rpe_increase` becomes `effort_increase`, driven by `recentAvgRepsInReserve` decreasing; it stays unconnected to the UI, as today |
| R7 | The deload prescription's effort target is in the new terms | "RPE 6-7" becomes "3+ reps left" |
| R8 | Lift metrics, the weekly review and the sleep comparison report effort as average reps left | "Average RPE" becomes "Average reps left" (higher = easier); the sleep comparison's "same" band is rescaled and tested |
| R9 | Evidence layer updated | `rpe-logging` becomes `effort-logging`; rule text reads its numbers from lib constants; every changed threshold has a `changelog.ts` entry; `docs/coaching-rules.md` regenerated |
| R10 | Glossary term "RPE" becomes "Reps in reserve" | Glossary page and `<Term>` tests updated |
| R11 | Demo data and seeds produce the new field | Demo generator tests pass; no `rpe` key in generated sets |
| R12 | The edit and rebuild engine treats a changed answer like a changed RPE today | Rebuild property tests pass with the new field |
| R13 | No `rpe` identifier is left in `src/` outside run effort | `grep -ri rpe src` returns only unrelated matches |

## Algorithm mapping

### T2 auto-regulation (R3)

Today the trigger is the first set's RPE: 9 or more while cutting, 9.5 while
maintaining, 10 while bulking. The drop is 5%, or 10% after an RPE 10.

| First T2 set | Cutting | Maintaining | Bulking |
|---|---|---|---|
| 0 left | suggest 7.5% drop | suggest 7.5% drop | suggest 7.5% drop |
| 1-2 left | suggest one 5 lb step down | no suggestion | no suggestion |
| 3+ left | no suggestion | no suggestion | no suggestion |

The owner asked on 2026-11-18 for drops "a touch lower" than today's 10% and 5%
(values above proposed, awaiting confirmation). Loads round to 5 lb, so a percentage
under 5% rounds back to no change below about 100 lb; the small drop is therefore a
fixed 5 lb step, and the large drop is never less than 5 lb. `T2_AUTOREG_DROP` becomes
`{ max: 0.075, minStepLbs: 5 }`.

What changes in behaviour:

- "0 left" is the old RPE 10: same trigger in every phase, smaller drop.
- Cutting used to trigger at exactly 1 rep left (RPE 9). The bucket also covers 2 left,
  so the suggestion will appear somewhat more often while cutting. It can be declined.
- Maintaining used to trigger at RPE 9.5 ("maybe one more"). That now falls in "1-2
  left" and no longer triggers.

The per-phase split is already graded as a coaching heuristic in the
`t2-autoregulation` rule; it stays one, with a changelog entry.

### 1RM estimate (R4)

Today: reps + (10 − RPE), capped at 4 extra reps. New: reps + 0, 1.5 or 3. The estimate
only uses T1 AMRAP sets, where the instruction is to stop with 1-2 left, so most
estimates will add 1.5.

### Effort trends (R6, R8)

Averages use `RIR_ESTIMATE`. An average of 1.2 reads as "about 1 rep left". Because
"3+" counts as 3, easy sessions are understated; the rule caveat says so.

## Evidence changes (R9)

- `effort-logging` (was `rpe-logging`): same source (`halperin2022`), same grade. The
  text explains the three buckets as matching the roughly one-rep accuracy of
  self-ratings.
- `t2-autoregulation`: thresholds restated from the new constants; caveat notes the
  cutting trigger now includes 2 reps left.
- `e1rm-estimate`: text reads the added reps from `RIR_ESTIMATE`; caveat notes "3+" is a
  floor.
- `amrap-effort`: wording only.
- No new source is cited. Follow `docs/research/ADDING_RESEARCH.md`.

## Execution

Contracts first, then parallel packages with exclusive file lists, branching from
`main` as `feat/reps-in-reserve`.

| Step | Work | Files | Model |
|---|---|---|---|
| 0 | Contracts: `RepsInReserve` type, `src/lib/effort.ts` with tests, renamed fields in `src/types/index.ts` | types, new lib file | top |
| 1a | Coaching logic: progression, e1rm, amrap, deload, insights, projection | `src/lib/*.ts` and tests | top |
| 1b | Evidence rules, changelog, glossary, generated docs | `src/lib/evidence/**`, `src/lib/glossary.ts` | top |
| 1c | Active workout UI: selector, hook, callout, page | `src/components/ActiveWorkout/**`, `src/app/workout/**` | mid |
| 1d | Log edit and rebuild engine | `src/components/LogEdit/**`, `src/lib/rebuild/**`, `src/lib/workout/**` | mid |
| 1e | Metrics, review, lift and runs charts, settings | `src/lib/metrics/**`, `src/lib/review/**`, `src/components/{Lift,Review,Progress}/**`, settings page | mid |
| 1f | Demo data, seeds, fixtures | `src/lib/demo/**`, `src/db/seed.ts`, test helpers | cheap |
| 2 | Integrate, full test suite, browser check of the active workout and set edit screens, review | all | top |

## Open items

1. Confirm the T2 table above, in particular the 5% suggestion at "1-2 left" while
   cutting.
2. Confirm the app still has no real logged sets with an RPE worth converting. Imported
   history exists as of 2026-11-17; check whether any imported set carries an RPE.
3. Whether set effort is stored in the hosted database as its own column or inside the
   set record. Any change to the live database needs the owner's explicit go-ahead.
4. Several other branches are in flight (`feat/strength-model` and others) and may
   touch the same files; pick the merge order before starting.

## Related

The Apple Watch companion app (screens reviewed 2026-11-18) uses this effort question on
its screen 04. Its own spec follows this one and depends on R1 to R5.
