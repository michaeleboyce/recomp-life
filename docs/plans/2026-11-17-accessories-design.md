# Accessories: chosen for you, by default

Status: built and deployed on 2026-11-17 (A1 to A11), from Michael's request ("a better
interface for accessory exercises and I want you to default to that", plus a list of exercises
he really does). The picks are chosen once, in `planAccessories`
(`src/lib/workout/accessoryPlan.ts`), inside `planWorkoutStart`, and saved as `add` plan
edits, so Today, the forecast, the Ready screen, the recorded plan and resume agree. A weight
set by hand is kept in `settings.accessoryWeights` with the plan's weight beside it. Checked
on the live data. Follow-ups are in `docs/plans/2026-11-17-open-items.md`.

This repository is public. The owner's training history is read on the device at run time;
nothing here or in the code lists what he has done.

## Today

- Accessories are a checkbox list on the Ready screen. None is selected by default, so a
  workout has none unless they are ticked every time.
- The list is four fixed names per day (`ACCESSORY_RECOMMENDATIONS`) plus anything marked
  preferred. It does not know what the lifter actually does, which muscles are short this
  week, or what is recovering.
- A row shows a name only: no weight, sets, reps or reason.
- The weight is the last one logged in the app; imported history is ignored.
- The double-progression rule (`evaluateAccessoryProgression`, rule `accessory-progression`)
  is written and tested but connected to nothing.
- The library lacks several exercises the owner named or does: hack squat, glute kickback
  machine, barbell incline bench press, Romanian deadlift, machine fly, machine row, incline
  dumbbell curl and incline hammer curl as their own entries.

## Decisions

1. **Accessories are on by default.** Every workout comes with accessories already chosen,
   up to the phase's number (`PHASE_ACCESSORY_CAP`). A setting, `accessories`, takes
   "chosen for me" (the default), "ask me" (today's behaviour) or "none". Removing them for
   one workout is one tap.
2. **The app chooses them, and says why.** Each pick comes from a scored list with its
   reasons, shown on the row and in full in the why sheet. The score, in order of weight:
   a. pinned to this day by the user (always in);
   b. marked preferred;
   c. habit: how often and how recently the lifter has done the exercise, in the app and in
      imported history, with the strength library's halving for age;
   d. this week's shortfall: muscles under the weekly set target (`weekly-volume`) so far,
      counting the sets today's main lifts will add;
   e. fit with the day: muscles the day's T1 to T3 do not already work hard;
   f. recovery: a muscle still recovering is passed over;
   g. spread: no two picks with the same primary muscle unless that muscle is short.
   Blocked exercises are never offered. At home, gym-only exercises are replaced by their home
   alternative or left out. The weights of the score are heuristic and graded so.
3. **Every accessory has a weight, a scheme and a next step.** Sets and reps from the
   exercise's range (`getAccessoryRepRange`). Weight: a weight set by hand, else the result of
   double progression over the exercise's own sessions (all sets at the top of the range: up
   one step; stuck three sessions: down to 90%; else the same), else a first weight from the
   exercise's own history (the rule F6 adds for home exercises), else blank for the user to
   enter. It is worked out from the log when read; nothing new is stored.
4. **One sheet to change them.** From Today, the Ready screen or mid-workout: remove, swap
   (three alternatives for the same muscle, with reasons), or add from a searchable list with
   "For today" (ranked, with reasons), "Your usual" and "By muscle". Each row shows weight,
   sets and reps, the muscle, and what it adds to the session's length. "Always on this day"
   pins an exercise to that day; pins and the setting sync with the profile.
5. **The library grows** by the exercises above, each with muscles, equipment, grip, a rep
   range, a home alternative where one makes sense, and import names mapped to it. The names
   the owner used map as: "lat raise" lateral raise, "seated shoulder press" seated dumbbell
   shoulder press, "pendulum swing" pendulum squat, "glute pushback" glute kickback machine,
   "incline hammer" incline hammer curl, "glute drive", "hack squat", "dumbbell lunge",
   "incline bench press", "dumbbell curl".
6. **Unchanged:** the rotation, T1 to T3 progression and the forecast ledger. Accessories
   never fail a workout or stall a lift. The user's edits always win.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| A1 | Library additions with muscles, equipment, grip, rep range, home alternative; in `ACCESSORY_IDS` | Every new id passes the existing exercise contract tests; the figure-only image fallback renders |
| A2 | Import mapping for the new exercises, resolved on read, so existing imported sets count without a re-import | Made-up imported sets under those names resolve to the new ids |
| A3 | `chooseAccessories(input)`: pure, returns the picks and the ranked rest, each with its reasons and score parts | Unit tests per score part; blocked never appears; home replaces gym-only; a pin always wins; the cap holds; deterministic for the same input |
| A4 | `accessoryPrescription(exerciseId, history, equipment)`: weight, sets, reps, and what happened last time (up, same, down, first time, from history) | Double-progression cases; a hand-set weight wins; history only from imported sets gives a first weight; no history gives a blank weight |
| A5 | Setting `accessories` ("chosen for me" default, "ask me", "none") and per-day pins in the profile settings; synced; safe when absent | Old profiles read as the default; a two-device sync test |
| A6 | Every planning path includes the chosen accessories (Today, forecast and session length, Ready, the plan recorded at start) | `planningPaths.test.tsx` extended: identical accessories, weights and schemes on every path |
| A7 | Today lists the accessories under T3 with weight, scheme, one-line reason and a why link | Start still in the first viewport at 390 by 844 with three accessories (rows collapse to one summary line when they would push it out) |
| A8 | The accessory sheet: remove, swap, add, search, three lists, pin to day, length added | Scripted at 390 wide; draggable like the other sheets |
| A9 | Active workout: accessories as full blocks with their range and the verdict after the last set; add one mid-workout | Scripted workout with an added accessory; it is saved and counted in volume |
| A10 | The summary and the Log say what each accessory does next time and why | Component tests |
| A11 | Evidence: `accessory-progression` switched to active where it is shown; a new heuristic rule `accessory-selection` for the score; changelog entries; rules doc regenerated | Evidence contract tests |
| A12 | No regression, offline and static-export safe, no new dynamic route, no database change | Full suite, both builds |

## Packages

| Package | Model | Requirements | Files | When |
|---|---|---|---|---|
| X1 library and mapping | Opus | A1, A2 | `src/lib/exercises.ts`, `src/lib/import/mapping/**`, `src/lib/workoutTemplates.ts` (home alternatives) | now |
| X2 selection and prescription | Opus (same agent as X1) | A3, A4, A5 (types and data layer), A11 (rules as planned) | new `src/lib/accessories/**`, `src/types`, `src/lib/data/records.ts` (one action) | now |
| X3 planning and Today | Opus | A6, A7 | planning path, `src/components/Today/**` | after R1 and R2 land |
| X4 sheet, workout, summary | Opus | A8, A9, A10, A11 (active) | `src/components/PreWorkout/**`, `src/components/ActiveWorkout/**`, summary, Log | after X3; agreed with the exercise-page session, which owns `EditWorkoutSheet` and the exercise pages |

An independent review and a click-through on the live data before each deploy.

## Risks

- **Longer sessions without asking.** Mitigation: the session-length forecast includes the
  accessories and each row shows what it adds; "none" and one-tap removal.
- **Picks that feel arbitrary.** Mitigation: reasons on every row, the full score in the why
  sheet, pins, and the heuristic grade shown.
- **A wrong first weight.** Mitigation: the same limits as F6 (never above what was lifted
  plus one step), blank when there is no history.
