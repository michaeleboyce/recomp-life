# Open items: what the docs promised that the code does not have

Status: audit of 2026-11-17. Every plan document, the rules marked `planned`, `CLAUDE.md`,
`docs/architecture.md` and code comments were read and each item checked against the code.
Items being built that day (accessory screens, the estimated-max chart) and items fixed that
day (F6, the Strength tab rows) are left out. Nothing here is scheduled until Michael picks it.

## Found on the live data on 2026-11-17, after the accessory screens and the chart deployed

Fixed the same day:

- Progress → Muscles showed "No muscle data yet" until a workout or pain entry was logged in
  the app, although the tab reads imported sessions. With imported history and no app workout
  the tab and the muscle charts could not be reached. Imported sessions now count
  (`src/components/Progress/ProgressHub.tsx`).
- Two tests failed on GitHub only (it runs in UTC): the planning characterisation recorded
  times as epoch milliseconds and moved made-up dates by milliseconds across a daylight-saving
  change. Rule for tests: record times as local stamps, move dates with `setDate`/`setHours`,
  and run the whole suite once with `TZ=UTC` before pushing.

Still to do (small):

- Progress → Strength shows each lift's latest own session estimate; the lift page headline
  shows the planner's pooled estimate. Use one number on both.
- The chart's zoom slider spans the whole history, so on a short window its two handles sit on
  top of each other; give the slider a minimum handle gap or scale it to the selected preset.
- The muscle sheet repeats its subtitle; the smooth line's latest value and the index can
  differ by a lot for a muscle with many exercises, and the note explaining why is easy to miss.
- An accessory offered at home in place of a gym one gives the replacement as its reason ("At
  home instead of face pulls"); give the reason the pick itself earned.
- Default accessories add about 20 minutes to a session; consider a time budget in the
  selection (pick fewer when the session forecast passes a length the user sets).

## Found on 2026-11-18, after the imported-history fixes and session length deployed

Checked on the live data: Today shows "55 min of 60" with one accessory left out to fit;
bench reads 162 on Today, Progress → Strength and the lift page; the lift page pages its
sessions 20 at a time; the weekly review counts imported sessions; Settings has the session
length row.

Fixed the same day:

- The Strength tab's recovery rows counted an imported barbell session but not an imported
  home version of the lift (bench showed 46 days when a dumbbell bench was 8 days old), because
  home versions were looked up from exercises the app had already planned at home.

Still to do (small), queued with the polish items:

- The session-length budget trims accessories by the length on paper; Today and Ready show the
  forecast corrected for the lifter's own pace. After a few finished sessions the sheet can say
  "3 of 3 fit in 60 min" while the line says "About 66 of 60 min". Use one length for both.
- The weekly review's lift rows count only barbell sessions of a lift: a week with a dumbbell
  bench shows "Bench press, 0 sessions, no estimate". Count home versions, with their estimates
  converted the way the lift chart does (`src/lib/strength/timeline.ts`).
- Today's days-off note counts imported sessions; the Ready screen's "lighter weights after a
  break" still reads app workouts only.
- Progress → Strength: the bench row says "Imported" without the date the other rows show.
- `useLiftE1RM` is no longer used by any screen.
- Today now chooses accessories for the next three workouts as well (for the Coming up line);
  the cost on a long history has not been measured.

## From the T3 threshold change and another session's bug check, 2026-11-18

- The T3 rule is graded `heuristic` and cites nothing: its threshold is the app's own
  arithmetic, and the research on proximity to failure is cited under the accessory rule.
- A dumbbell row done as the T3 lift itself always steps 5 lb, past the heaviest dumbbell and
  whatever the dumbbell increment. The threshold matches that step; the step may be wrong.
- A first T3 weight is the one liftable about 20 times; with a floor of 18 a T3 seeded from
  imported history can go up after its first session. Decide whether that is wanted.
- "last set reached 26 of 18" reads oddly above the threshold: say "26 reps, needed 18".
- The demo data's T3 last sets (18 to 26) now move almost every T3 up each session.
- The own-history window (`ownHistoryOf`, `ownHistoryFirstWeight`) counts back from the newest
  logged set, not the planning date, so very old sets can seed today's weight. Fix by passing
  the planning date through `seedVariantWeight` / `resolveLifts` and their callers, with a
  changelog entry. Found by the edit-delete-log-entries session; taken here after the swap
  screens and the full future-workout view land.

## From the full future-workout view and the swap screens, 2026-11-18

Checked on the live data: every Coming up card opens its workout in full, later workouts offer
"Do this one today" with the day that stays next, and Today has "Do a different day".

- A program lift with no session in the app and unconfirmed starting weights is planned at the
  default weight and says "First time", whatever the imported history holds: on the live data
  the dumbbell row is 65 a hand as lat pulldown's home stand-in (from its own history) and 35
  as Press day's own T3. Either seed an unconfirmed program lift from its own history the way
  home versions are (F6), labelled as such, or put "Confirm your starting weights" in Today's
  Needs attention until it is done. Take with the own-history window fix above.
- "Every time" on a swap is a real standing choice only for accessories. For a program slot
  the planner reads no preference, and a swapped program lift is held and leaves its day due,
  so a standing swap would never advance. Proposed package (waiting for Michael): the
  replacement becomes that slot's lift at that location with its own weight and progression,
  counting for the rotation, the way home versions already work; a one-off swap to a version
  of the same lift then counts as doing the day.
- The card for the next workout and its full view build the plan by two paths (re-entry
  "everyLift" and accessories after set plans, against Today's path). Equal in every test;
  make `projectUpcomingWorkouts` build each shown plan through `planWorkoutStart`.
- `LiftRows` labels its list "Today's lifts" for screen readers on the full view too.
- After a reload mid-workout the screen resumes at the first unfinished entry, not the one
  the user had jumped to. During the rest screen the block's Swap is under the rest overlay.
- There is no way to load demo data from the UI, so browser checks seed a database by hand.

## After the swap screens deployed, 2026-11-18

Checked on the live data: Edit workout → Swap shows three recommendations with weight, reason
and history, "Pick more than one", the progression line and the every-time switch (off).

Fixed the same day: at home before a workout, picking one of a lift's own home versions in the
swap sheet goes through the home-substitute path, so it counts as the lift with its own weight
and progression (it was "logged only", with the day left due). A home-version override saved in
a favourite is now honoured even when the usual dumbbell form fits.

Still to do:

- During a workout a swap is always logged only: the session's home exercise is fixed at start
  in `prescribed` and `modifications`, and the start-time forecasts and stored reasons name it.
- `HomeAlternatives` on the Ready screen and the swap sheet both choose a home version. Keep
  the panel as information and make its buttons open the swap sheet on that lift.
- Standing swaps of a program lift at the gym: see the proposal above; waiting for Michael.

## After the polish step deployed, 2026-11-18

Done and live: the zoom slider scaled to the window; the muscle sheet's single subtitle and its
index-against-line sentence; weekly review lift rows counting home versions; dates and sources
on the Strength cards; one session length for the budget and the screens; the break note
counting imported sessions; the own-history window counted from the planning date; "Confirm
your starting weights" under Needs attention; T3 wording ("26 reps on the last set, needed
18"); a home replacement accessory's own reason; cards and the full view built by one path;
preview deployments building without a database address.

Still to do:

- The Coming up full view still says "First time" for an unconfirmed program lift after the
  first position (Press day's dumbbell row); Today's new reasons are not passed to it.
- `src/lib/rebuild/fold.ts` and `src/components/Lift/homeVersion.ts` still count the
  own-history window from the newest set.
- Today's lift tiles say "Imported, Jul 31" from the lift itself; Progress names the newer home
  version ("Imported, Nov 3 · Bulgarian Split Squat"). Use `latestNote` on both.
- Double progression over an accessory's app sessions has no age limit.
- `suggestStartingWeights` now runs on Today; its cost on a long history is not measured.
- A planned weight moved when RPE became reps in reserve (imported sets with "1-2 reps left"
  earn 1.5 reps of credit): dumbbell bench 45 to 50 a hand on the live data. Explained in the
  why sheet; recorded here so the change is not a surprise later.
- Not yet seen on the live data, covered by tests only: a swap during a workout, the accessory
  sheet's "Add anyway", the per-workout length chooser on Ready, the last-set T3 hint.

## After the follow-up fixes and the code-health step, 2026-11-18

Done and live: the honest starting-weight reason at every Coming up position; one newest-
evidence note on Today's tiles and the Progress cards; the Ready screen's home-version panel as
information with a "Change" button that opens the swap sheet; an age limit on accessory double
progression; accessory selection cached per list of sets (the next three workouts on a history
of 850 imported sessions: 43 ms to about 20 ms cold, 36 ms to 1.5 ms warm). Code health: the
forecast text in `src/lib/forecast/text/`, naming in `lib/liftNames.ts` and
`lib/workoutNames.ts`, shared text and date helpers, one test-builder scheme, dead code removed,
`docs/architecture.md` rewritten to match.

Decisions for Michael:

- One wording for a lift on one screen: Today's tile says "Bench Press est. 1RM" and its rows
  "Bench press"; the Log says "Bench Press" and "OHP" for program lifts and "Lat pulldown" for
  accessories; the adjustment log says "Overhead press day" where other screens say "Press
  day". Proposed: sentence case everywhere, "Press day", and "Overhead press" spelt out.
- About 25 exports only tests use or nothing is wired to (listed in `docs/architecture.md`,
  "Cleanup still to do"), among them the recovery ramp-up helpers: wire up or delete.

Still to do:

- Done 2026-11-18: R3 (the saved session, one set draft, the rest countdown and view state
  each have one owner; see the map at the top of `useActiveWorkout.ts`), and one shared copy of
  the strength evidence per screen (`src/lib/workout/sharedEvidence.ts`). Left on purpose: the
  draft's parts keep their own lifetimes (picked reps are lost on a reload, a weight changed on
  the spot survives); one rule would change what the lifter sees.
- The Log row for a swapped lift now names the swap; a lift stopped early with no swap still
  reads "all targets hit" when the sets it did log hit their reps.
- Helpers left apart because their output differs (`formatLbs` in `LogEdit`, three "N days
  ago" forms, percent with decimals); `homeVersion.ts` keeps a local `plural`.

## Promised and missing

| Item | Where it was promised | In the code today | Size |
|---|---|---|---|
| Lighter weeks (deload) never start | rule `deload` (planned); `CLAUDE.md` "data-driven deload triggers" | `generateDeloadPrescription` in `src/lib/deload.ts` is called by nothing but the glossary; the fatigue sign only prompts | L |
| Pain entries do not change weights | rule `pain-load-changes` (planned) | `generateModifications` in `src/lib/painModifications.ts` is called by nothing; Body check only shows the red-flag warning | M |
| Readiness answers change nothing but one suggestion | rule `readiness`, its caveat | Sleep and stress shift forecasts and can suggest skipping accessories; they do not change loads or recovery | M |
| Apple Health in coaching | Apple Health plan, out of scope there | Heart-rate variability and resting heart rate are shown, not used in readiness; no background delivery | L |
| Session volume warning | rule `volume-ratio` (planned) | `calculateSessionVolumeRatio` exists; its own comment says its thresholds flag nearly every cutting session; no screen shows it | M |
| Weigh-in reminder | Settings "Weigh-in reminder" and its time | Only feeds the "weigh-in due" card on Today; no notification is scheduled | M |
| Minimum length for the sync passphrase | security review | `src/lib/syncKey.ts` has no length check (waiting for the owner to set a long passphrase first) | S |
| Dashboards the user builds | UI refresh U7; glass-box option F | The metrics layer exists; no stored tile list or builder | L |
| Two-column layout from 768 px | UI refresh U15 | Almost no screen uses it; the glass-box plan lists tablet layout as out of scope | M |
| Android | `CLAUDE.md` (now corrected) | iOS only; no Android project | L |

## Partly built

- First home weights: own history, then learned ratio, then starting ratio (done, F6). The
  accessory first-weight helper (`ownHistoryFirstWeight`) and the home seed are two functions
  with the same idea; unify them.
- The lift page's "Show all" renders every session.
- Still app-only (imported history not counted): the weekly review, insights, the Strength
  tab's recovery rows.
- `docs/architecture.md`, "Cleanup still to do": remaining local copies of text and date
  helpers, about eight lift-naming functions with different wording, `forecastText.ts` (860
  lines of logic in a component folder), three naming schemes for test builders, logic still
  inside hooks. (Logic importing from components and the lint warnings: done 2026-11-18.)
- R3 (one owner for each piece of active-workout state): deferred on purpose.
- `QuickAddSheet` still plans a whole workout to read which day is next; a home exercise no
  longer offered is seeded from app sets only in the rebuild but from app plus imported sets
  on resume.

## Decide: build or remove

Code that exists, is tested, and nothing uses. Each should be either switched on behind a
rule the owner accepts, or deleted, not left in between.

- `deload` and `pain-load-changes`: the evidence is graded limited and two plans chose to
  leave them off.
- `volume-ratio`: needs new thresholds before it could be shown.
- The "lighter week worth considering" forecast: the research note argues against it.
- The weigh-in reminder: schedule a notification, or rename the setting to what it does.
- The unused `Logo` component.

## Corrected in the docs on 2026-11-17

- `CLAUDE.md` said sign-in was Auth.js with Apple and Google, and that the app ran on Android.
  There is no sign-in (one shared sync passphrase) and no Android project.
- `README.md` was the unedited create-next-app text.
- Settings showed a hard-coded "Version 0.1.0"; it now reads the real version, as More does.

## Owner actions still open

- A long sync passphrase on every device and in Vercel; then the minimum length is enforced.
- Two-factor sign-in on GitHub, Vercel and Neon; rotate the Neon password; scope the Vercel
  environment variables to Production.
- Settings → Import history: confirm or edit the starting-weight suggestions.
- If the installed iPhone app is used: rebuild and reinstall it (the sync protocol changed).
- All SQL scripts in `scripts/sql/` are applied to the live database as of 2026-11-17.
