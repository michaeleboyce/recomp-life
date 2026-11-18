# Future workouts, switching days, and recommended swaps

Status: spec, 2026-11-18. Requested by Michael the same day: "I would like to click in and see
the full future workouts, or switch to a future workout, or replace an exercise with a
recommended exercise (or exercises) before or during a workout." This file also records the
order of the whole batch agreed that day, so nothing is lost between sessions.

## Order of the batch

| Step | What | State |
|---|---|---|
| 1 | Main checkout fast-forwarded to `origin/main`, packages reinstalled | done |
| 2 | Imported history in the weekly review, insights and Strength recovery rows; one number for a lift on Progress → Strength, Today and the lift page; lift page "Show all" paged (H1 to H6) | building |
| 3 | Session length: a setting, a budget in accessory selection, a per-workout choice on Ready (L1 to L7) | building |
| 4 | This spec (W1 to W12) | next |
| 5 | Polish (P1 to P4 below) | after 3 |
| 6 | Code health (K1 to K6 below) | last, when no feature work is open |

## What exists today

- **Coming up** (`/progress/upcoming`) shows the next five workouts as cards with the three
  program lifts and projected weights. Only the first card is a link (to the Ready screen).
  `UpcomingWorkout.entries` holds working program entries only: no warm-ups, no accessories,
  no per-set detail, no reasons.
- **Switching day** already works on the Ready screen: `DaySelector` and `?templateId=`. Doing
  another day does not move the rotation. Nothing on Coming up or Today leads to it.
- **Swapping before a workout** exists in the Edit workout sheet: `swapCandidates`
  (`src/lib/swapCandidates.ts`) returns exercises that share a primary muscle, best overlap
  first, as a plain list of names. No reasons, no weights, no history, one for one only.
- **During a workout** an exercise can be added (`addExercise`, append-only, saved as an `add`
  plan edit). It cannot be swapped or removed.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| W1 | Every Coming up card opens that workout in full: `/progress/upcoming/workout?n=<position>&location=<gym\|home>` (a query, so the static iPhone build needs no generated routes) | Tapping the third card opens the third workout; the back button returns to the list at the same location |
| W2 | The full view lists every entry in order: warm-ups (when the setting is on), each program lift with every set's weight and reps, and the accessories the app would pick, marked "likely" because they depend on what is trained before then | Entry weights equal the card's; for position 0 they equal what the Ready screen plans, set for set |
| W3 | Each program lift in the full view has a one-line reason and opens the same why sheet as Today. For positions after the first the reason states the assumption ("assumes you complete every set of the bench session before") | The reason for position 0 equals Today's; later positions name the session they depend on |
| W4 | The full view shows the session-length forecast against the target, the muscle figure, and what would change the plan (a missed set, a skipped day, a different location) | Length equals the card's |
| W5 | "Do this one today" on the full view of any later workout opens the Ready screen on that day at the location shown, with the existing note that the rotation does not move | Starts the chosen template; after finishing, the day that was due is still due |
| W6 | Today's hero offers "Do a different day", listing the four days with the due one marked, each opening its full view | Reaches W1 from Today in one tap plus a choice |
| W7 | Recommended swaps: `recommendSwaps(exerciseId, context)` in `src/lib/swap/` returns ranked candidates, each with a score broken into parts, a one-line reason, and the weight, sets and reps it would be done at | Pure, deterministic, unit-tested; every candidate's parts sum to its score; blocked exercises never appear; at home nothing that needs a gym appears |
| W8 | Score parts, all exported constants: muscles covered (primary, then secondary), same movement and tier fit, preferred, done before (count and how recently, app and imported history), has a usable weight from history or the strength model, recovery of the muscles it adds, a pain entry on a joint it loads (penalty) | A test per part; the sheet shows the parts on tap |
| W9 | One for many: when no single candidate covers all of the original's primary muscles, or the user asks, the sheet offers pairs that together cover them, and the user can pick more than one replacement. Saved as a `swap` for the first and `add` edits for the rest, so no stored format changes | Picking two replacements yields one `swap` and one `add`; resume and rebuild read them unchanged |
| W10 | Before a workout: the Edit workout sheet's swap list becomes the recommendation list (reason, weight × sets × reps, "done 14 times, last 3 weeks ago"), with "All exercises" below it. Each choice says what happens to the program lift's progression, read from the progression code, not typed in | The text for a swapped T1 matches what `rebuildDerived` does with that session |
| W11 | During a workout: any exercise not yet finished can be swapped from its block and from the workout overview. With no set logged the entry is replaced; with sets logged the logged sets are kept, the rest of the entry is dropped and the replacement is appended. Saved in `planEdits` so resume, the Log and the rebuild agree | Scripted: swap before a set, swap after two sets, reload mid-workout, finish; the Log shows both exercises and the rebuild gives the same lift states as the live session |
| W12 | A swap applies to today's workout only unless the user says otherwise (Michael, 2026-11-18: "it should default to just today, but I can click every time"). Picking a replacement saves it for this session with no extra step; an "Every time" control on the same sheet, off by default and never remembered between swaps, makes it the standing choice for that location through the existing exercise preferences. Evidence: rule `swap-recommendation`, graded `heuristic`, with a changelog entry and `<EvidenceLine>` on the sheet | The standing choice shows on the next plan of that day; evidence contract tests pass |

Not in this build: editing a future workout ahead of time (saving swaps for the B2 after
next). Favourites and "Every time" cover the standing cases; a one-off edit ahead would need a
new stored list of edits per coming session.

## How it fits the planning path

- W1 to W4 add `describeUpcomingWorkout` beside `projectUpcomingWorkouts`
  (`src/lib/workout/upcoming.ts`): the same simulated history, then `planWorkoutStart` for the
  chosen position, so the full view is the plan the Ready screen would make if every session
  before it were completed. Position 0 calls the same function as `useTodayWorkout`.
- W7 to W9 replace the ranking in `swapCandidates` (kept as a thin wrapper until its callers
  move). Weights come from the existing sources in this order: the user's own recent sets
  (`ownHistoryOf`), the strength model (`pooledLiftEstimate` through the learned ratio),
  `accessoryPrescription` for accessories, then the starting ratio. No new weight rule.
- W11 adds `swapExercise` to `useActiveWorkout`, written the way `addExercise` is: one call to
  `appendPlanEdit`, then the frozen plan is updated. Entries are never reordered, so weights
  changed on the spot stay on their sets. A `remove` during a workout comes with it at no extra
  cost (an entry with no set logged).

## Packages and lanes

| Package | Lane (exclusive files) | Needs |
|---|---|---|
| S1 swap logic | `src/lib/swap/**`, `src/lib/swapCandidates.ts`, `src/lib/workout/planEdits.ts` (mid-workout swap helper only), evidence rule | nothing |
| S2 full view | `src/lib/workout/upcoming.ts` (new function), `src/hooks/useUpcomingWorkouts.ts`, `src/app/progress/upcoming/**`, `src/components/Upcoming/**`, `src/components/Today/ComingUpLine.tsx` and the hero's "different day" entry | step 3 merged |
| S3 swap screens | `src/components/PreWorkout/{EditWorkoutSheet,EditEntryRow,ExercisePicker}.tsx`, `editList.ts`, `src/components/ActiveWorkout/{useActiveWorkout.ts,WorkoutOverviewSheet.tsx,ExerciseBlock.tsx}` | S1 and step 3 merged |

## Polish (step 5)

| ID | Item |
|---|---|
| P1 | The chart's zoom slider: scale it to the selected preset, or keep a minimum gap between the handles |
| P2 | Muscle sheet: remove the repeated subtitle; put the note explaining why the smooth line and the index differ beside the two numbers |
| P3 | A home replacement accessory gives its own reason, not "At home instead of face pulls" |
| P4 | The accessory first-weight helper and the home seed are two functions with one idea: one function |

## Code health (step 6)

From `docs/architecture.md`, "Cleanup still to do". Behaviour must not change; the golden and
characterisation tests are the guard.

| ID | Item |
|---|---|
| K1 | `src/components/Forecast/forecastText.ts` (about 860 lines of logic): move to `src/lib/forecast/` |
| K2 | Logic that imports from components (`lib/review`, `favoriteSummary`, an evidence rule, `GlanceTiles` constants): invert each |
| K3 | One lift-naming module in place of about eight functions with different wording |
| K4 | Remaining local copies of text and date helpers; one naming scheme for test builders; the six lint warnings |
| K5 | R3: one owner for each piece of active-workout state. Do it after S3, which adds to that hook |
| K6 | `QuickAddSheet` plans a whole workout to read which day is next: use `useDueTemplateId` |

## Still Michael's call

Lighter weeks, pain entries changing weights, the weigh-in reminder and the session-volume
warning: build or remove. Recommendation on record: lighter weeks as a suggestion to accept or
decline; delete the volume warning; rename the reminder setting to what it does.
