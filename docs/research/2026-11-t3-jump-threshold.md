# When a T3 weight goes up: a threshold sized to the step (November 2026)

This note records the reasoning behind `t3IncreaseThreshold` and its bounds
(`T3_INCREASE_REPS_MIN`, `T3_INCREASE_REPS_MAX`) in `src/lib/progression.ts`, and how the
rule `t3-progression` (`src/lib/evidence/rules/progression.ts`) grades them. Spec:
`docs/plans/2026-11-18-t3-jump-threshold-design.md`. No new source was added: nothing here
rests on a study, and no study was found that tests a T3 threshold of any kind.

## What changed

Stock GZCLP raises a T3 weight when the last set of 3×15+ reaches 25 reps, whatever the
exercise. The app used to do the same. It now asks the last set for the reps that, by the
app's own rep-to-strength formula, predict the target reps at the next weight.

## The arithmetic

The app estimates strength from a set with the Epley-style formula used everywhere else in
it (`src/lib/e1rm.ts`):

    strength ≈ weight × (1 + reps / 30)

To be good for `target` reps at `next`, the last set at `current` must imply at least the
strength that `target` reps at `next` imply:

    current × (1 + r / 30) ≥ next × (1 + target / 30)
    r ≥ 30 × ((next / current) × (1 + target / 30) − 1)

The threshold is that `r`, rounded up, then kept between 18 and 25. With the stock target
of 15, `1 + 15 / 30 = 1.5`, so the threshold is roughly `45 × (next / current) − 30`. A 4%
step gives about 17, a 10% step 20, a 20% step 24, and anything above about 22% reaches the
ceiling.

| Example | Step | Formula | Threshold |
|---|---|---|---|
| Lat pulldown 120 → 125 lb | 4% | 16.9 → 17 | 18 (floor) |
| Dumbbell 50 → 55 lb | 10% | 19.5 → 20 | 20 |
| Dumbbell 25 → 30 lb | 20% | 24.0 → 24 | 24 |
| Dumbbell 15 → 20 lb | 33% | 30.0 → 30 | 25 (ceiling) |

These cases are unit tests (`src/lib/progression.test.ts`). A floating-point margin keeps
24.000000000000004 from rounding up to 25.

The next weight is what the progression would really give: 5 lb more for a T3 lift state
(`T3_INCREMENT_LBS`, `t3NextWeight`), or one dumbbell step for a home exercise, never past
the heaviest dumbbell (`homeNextWeight` in `src/lib/workout/variant.ts`). Per-hand weights
are compared per hand; the ratio is the same as for the pair. With no weight (bodyweight)
or no next weight (at the heaviest dumbbell, where the cap policy adds reps or moves to a
harder exercise) the threshold is the ceiling.

## Why the bounds

- **Ceiling, 25.** The stock GZCLP number. A big step never asks for more than the program
  itself does, so the change can only make a T3 move up sooner, never later.
- **Floor, 18.** The formula is a rough fit at high reps. On a heavy machine a 5 lb step
  is small enough that the formula alone would move the weight after a last set only a few
  reps over the target. 18 keeps the last set clearly harder than the 15 asked of the
  others. It is a judgment, not a measured value.

## What is not known

- Rep-to-strength formulas are fitted mostly to sets of about 10 reps or fewer; their
  error grows with reps, and they differ between exercises and people. The app's own
  estimate of a maximum already ignores sets above its rep limit for that reason
  (`E1RM_MAX_REPS`). Here the formula is used only to compare two high-rep efforts with
  each other, which is less demanding than predicting a maximum, but how well it does that
  has not been tested.
- No study compares T3 thresholds, flat or sized to the step, for growth or strength. The
  grade is therefore `heuristic` for the threshold. The rule as a whole stays `program`,
  since the 3×15+ scheme and "the last set decides" are GZCLP's; the caveat says both.
- The cited studies (`robinson2024`, `halperin2022`) are about how close to failure sets
  end and how well people judge reps left. They support taking the last set hard; they
  say nothing about the threshold, and the rule does not claim they do.
- Whether lifters get enough reps on a last set taken "as many as you can" depends on
  effort, which the app cannot see. A sandbagged last set delays the increase under
  either rule.

## Past sessions

The rebuild replays the whole log under the current rules, so finished sessions are
re-read under this threshold (the app had no real use before 2026-11-12). A T3 whose last
set fell between its new threshold and 24 now went up where it used to stay.
