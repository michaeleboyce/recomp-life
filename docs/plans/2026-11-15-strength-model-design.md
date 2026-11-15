# One strength model for gym and home, with per-set weights and drop sets

Status: draft for Michael's sign-off. Builds on the glass-box design
(`docs/plans/2026-11-14-glass-box-design.md`).

## Why

Michael trains at the gym (barbell) and at home (dumbbell substitutes for the same program
lifts). His direction (2026-11-15): "home weight should affect the strength of the muscle, and
should factor into things when I use those muscles, as part of the overall algorithm", and
"include dropsets, and variable rates" (confirmed: a weight per set).

What the app does today (audit, 2026-11-15, checked in a running app):
- One stored state per program lift, in barbell terms. Nothing is stored per home exercise.
  A home weight is computed on the fly: 80% of the barbell weight, per hand, rounded to 5,
  capped at the heaviest dumbbell.
- A home pass raises the barbell weight by the dumbbell step; a home miss moves the barbell
  stage. Home sets give no estimated max and no new-best line.
- At the dumbbell cap the home weight never moves again while home passes keep raising the
  barbell. From about 210 lb squat the substitute flips from Bulgarian split squat at 80 a
  hand (160 total) to goblet squat with one 80 dumbbell: the load halves.
- The same lift shows three numbers at home: 80 (Today, Ready, first set), 245 (the home
  lift page's Adjust weight) and "190 barbell equiv." (the active workout).
- Thirteen screens disagree in smaller ways (table in the audit; see "Consistency fixes").

## The model in one paragraph

Every set of every exercise is evidence about the strength of the muscles it works and of the
program lift it stands in for. Each home exercise keeps its own working weight and progresses
by the same GZCLP rules in dumbbell steps, as far as the equipment allows. A pooled strength
estimate per program lift combines barbell sets with home sets, translated through a ratio
between the two exercises that starts at a sensible default and is learned from Michael's own
sessions. That estimate decides the first barbell weight after a stretch at home (and the first
home weight after the gym), feeds new-best lines, forecasts and the muscle view, and appears in
the "why" trace with its grade.

## Decisions this spec makes (Michael can change any of them)

1. Home exercises progress on their own weight. A home pass no longer raises the barbell weight
   directly; it raises the home exercise's weight and adds to the pooled strength estimate.
2. At the dumbbell cap, a pass moves to the next harder variant in the chain or progresses by
   reps (for example 3×10 → 3×12). It never switches to a variant with a lighter total load.
3. Back at the gym after home sessions, the barbell weight is the smaller of (a) the last
   barbell weight plus the steps the home passes earned and (b) the weight the pooled estimate
   implies for the current stage, rounded to loadable plates. The same rule, capped by the
   heaviest dumbbell, picks the first home weight after gym sessions.
4. Program rule in CLAUDE.md changes from "DB-adapted workouts at home count as passes for
   progression" to: "Home sessions progress their own weight by the GZCLP rules, count for the
   rotation, and are strength evidence for the program lift; the barbell weight moves at
   re-entry, within limits."
5. Per-set weights: any set can have its own weight and rep target, set before or during the
   workout. Pass or fail is judged on the program's working sets only; extra back-off sets are
   extra volume.
6. Drop sets: after a set, "Drop" continues at a lighter weight (default about 20% lighter,
   rounded to the equipment step, adjustable) with no rest timer, as many times as wanted.
   Drops never turn a pass into a fail, are discounted in the strength estimate and kept out
   of the estimated max and new bests, and count half a set each toward muscle volume (at most
   one extra set per working set).

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| H1 | A derived state per program lift, exercise performed and tier (weight as lifted, per-hand flag, stage, fail count), rebuilt from the log like the lift states | Two Bulgarian split squat passes raise it by one dumbbell step and leave the barbell weight unchanged |
| H2 | Cap policy (decision 2) | Squat 245 with an 80 lb heaviest dumbbell never plans goblet squat at 80 after a Bulgarian split squat pass at 80 a hand |
| H3 | A first home session is seeded from the pooled estimate | With no home history it equals today's conversion |
| H4 | Strength estimate per exercise and pooled per program lift (`src/lib/strength/`) | With gym-only history the estimated max equals today's |
| H5 | Learned exercise-to-exercise ratio, starting from the default and shrinking toward it with few pairs | Synthetic pairs with ratio 0.7 converge to within ±0.03 after six pairs; no pairs leaves the default |
| H6 | Bounded re-entry both ways (decision 3) | A scripted three-week home block, then gym: the barbell weight follows the rule exactly |
| H7 | Muscle strength trend from all exercises (primary muscles weight 1, secondary 0.5) | A quads trend appears from Bulgarian split squat data alone |
| H8 | Every home surface shows and edits the home exercise's own weight, per hand where it is per hand: Today, the home lift page and its Adjust weight, Ready and Edit workout, the active workout's dumbbell line, the summary, the Log and its set editor, the why sheet, favourites | A scripted run at home shows the same number on every one of them |
| H9 | Trace steps ("Strength estimate", "From home sets: BSS 75×8 ≈ squat 205, ratio 0.78 from 4 pairs", "Re-entry"), new rules (`strength-pooling` heuristic, `transfer-ratio` graded per lift from sources, `cap-progression` heuristic, `drop-set-evidence` heuristic), changelog entries, regenerated rules doc | Evidence contract tests; trace tests |
| H10 | Per-set weights and rep targets in the plan and plan edits | A 5×3 ramp logs each set at its own weight; pass or fail uses the working sets |
| H11 | Drop sets in the active workout: one tap, adjustable weight, no rest timer, any number of drops | One set plus three drops logs four rows and starts no rest timer |
| H12 | Credit with drops and back-offs (decision 5, 6) | A missed drop does not turn a pass into a fail |
| H13 | Drops in the strength model and muscle volume (decision 6) | Drops create no estimated-max rows; volume adds at most one set per working set |
| H14 | Forecasts skip drops; the Log shows them under their set ("↳ 185×6, 155×5") | Component tests |
| H15 | CLAUDE.md, the golden rebuild fixtures and the demo data (with home blocks and a drop set) updated on purpose | Full suite green |

## Consistency fixes that do not wait for the model

These are wrong today whatever the model: the active workout's "barbell equiv." line (wrong
for one dumbbell and against the prescription), the Log row naming the barbell lift with a
per-hand weight, favourites pinning dumbbell weights that land on the barbell at the gym, the
deload trigger and new-best chance mixing home and gym reps, `dumbbellToBarbell` (×1.2) not
being the inverse of ×0.8, a borderline weight capped without a word, and past home sessions
rebuilt with today's heaviest-dumbbell setting. Each is folded into the package that owns the
code.

## Packages

| Package | Model | Requirements | Lane (summary) |
|---|---|---|---|
| P1 data and rebuild | Opus | H1, H3, the H10 and H11 schemas | `src/types`, `src/lib/rebuild`, `src/db`, sync registry, SQL |
| P2 strength library | Opus | H4, H5, H13 | new `src/lib/strength/` |
| P3 progression | Opus | H2, H6, H12 | `src/lib/progression.ts`, `src/lib/workout/**`, `src/lib/autoAdapt.ts` |
| P4 home surfaces | Opus | H8 | Today, Lift, Ready, Log, summary, favourites |
| P5 active workout | Opus | H10, H11, H14 | `src/components/ActiveWorkout/**`, forecast skip |
| P6 trace, evidence, docs | Sonnet | H9, H15 | `src/lib/trace`, `src/lib/evidence`, CLAUDE.md |
| P7 muscles and forecasts | Sonnet | H7 | muscle view, forecast inputs |

Order: P1 and P2 together; then P3, P5 and P7; then P4 and P6. An independent review before
the deploy. Live data: a new derived table needs an additive script on Neon (empty table, no
change to existing rows).

## Risks

- Ratios between exercises are not in the literature for most pairs; they start as heuristics
  and learn from Michael's data, and the "why" trace says how many pairs they rest on.
- Changing who owns progression at home rewrites the golden rebuild fixtures; the change is
  deliberate and the diff is reviewed field by field.
- Six packages touch shared code; lanes are exclusive and P1 lands first.
