# T3: when the weight goes up depends on the size of the jump

Status: spec, 2026-11-18. Michael asked whether a T3 weight should go up at 20 reps instead of
25. Answer given: 25 is the stock GZCLP rule; the right number depends on how big the next
step is. He chose the jump-based threshold and asked that "the app clearly documents it".

## The rule

Today: the weight goes up when the last set reaches `T3_LAST_SET_INCREASE_REPS` (25), for every
exercise.

New: the weight goes up when the last set shows the lifter could still do the target reps at
the next weight, by the same rep-to-strength formula the app uses everywhere else
(`weight × (1 + reps / 30)`):

```
needed = ceil( 30 × ( (next / current) × (1 + target / 30) − 1 ) )
threshold = clamp(needed, T3_INCREASE_REPS_MIN, T3_INCREASE_REPS_MAX)      // 18 and 25
```

- `current` and `next` are the real weights: `next` is whatever the progression would give
  this exercise (5 lb on a bar or machine, the user's dumbbell increment per hand for dumbbell
  work, the next weight they own where a dumbbell list exists).
- `target` is the entry's rep target (15 for the stock 3×15+).
- No weight (bodyweight work) or no next step (already at the heaviest dumbbell): the
  threshold is the maximum, 25, and the existing "at your heaviest dumbbell" wording stays.
- The ceiling of 25 keeps the stock rule as the hardest case; the floor of 18 is there because
  the formula is rough at high reps.

| Example | Jump | Threshold |
|---|---|---|
| Lat pulldown 120 → 125 | 4% | 18 (the floor; the formula alone says 17) |
| Dumbbell 50 → 55 | 10% | 20 |
| Dumbbell 25 → 30 | 20% | 24 |
| Dumbbell 15 → 20 | 33% | 25 (the ceiling) |

Grade: `heuristic`. It is the app's own arithmetic on a formula known to be imprecise above
about 10 reps; no study tested this threshold. The rule's caveat must say so, and say that the
stock program uses a flat 25.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| T1 | `t3IncreaseThreshold({ weight, nextWeight, targetReps })` in `src/lib/progression.ts`, pure, with the two bounds exported; `evaluateT3Progression` and `computeCompletion` use it | The table above as unit tests; bounds; bodyweight and heaviest-dumbbell cases |
| T2 | Everything that decides, replays or projects a T3 increase uses the one function: completion, the rebuild, Coming up's projection, any forecast or trace that mentions a T3 increase | Grep shows no other comparison with a T3 rep count; a test fails if a second copy appears |
| T3 | Past sessions are re-read under the new rule by the rebuild, as with every other rule so far (the app had no real use before 2026-11-12). The golden fixture changes on purpose | Regenerated deliberately; the report lists exactly which demo sessions changed outcome |
| T4 | Rule `t3-progression`: summary, behaviour, rationale and caveat rewritten from the constants; a worked example for three jumps computed in the rule text, not typed in; graded `heuristic` where the threshold is concerned while the 3×15+ scheme stays `program`; changelog entry naming the old and new behaviour; `npm run docs:evidence` | Evidence contract tests pass; `/research?rule=t3-progression` shows the formula and the examples |
| T5 | The exercise page says the exercise's own number and why: "Goes up at 20 reps on the last set. At 20 you would be good for 15 at 55 lb." with the rule link; its history marks sessions against the threshold that applied to that session's weight | Text is built from the function; a 25 lb dumbbell shows 24, a 120 lb machine shows 18 |
| T6 | During a workout, the last T3 set shows the number to reach ("20 to move up") and, after it is logged, what happens next time | Scripted: log 19 then 20 on a 50 lb dumbbell exercise |
| T7 | The Log's "What it did", the workout summary and the why sheet for a T3 weight use the session's own threshold in their wording | "last set reached 20 of 20: next 55" and "stays at 50 (last set 19 of 20 reps)" |
| T8 | Glossary and "How the app decides" mention the rule; `CLAUDE.md`'s program rules line is corrected; a short note in `docs/research/` explains the arithmetic and its limits | Present and consistent with the constants |
