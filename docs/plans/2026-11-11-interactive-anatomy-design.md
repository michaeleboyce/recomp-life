# Interactive Anatomy and Exercise Demos — Design Document

## Problem

1. **No visuals.** Workouts are text. The body map is a grid of labelled rectangles. Exercises have no demonstration.
2. **Muscle data is wrong at the root.** `Exercise.primaryMuscles` uses `BodyRegion`, a pain-tracking type that contains joints. Bicep curls are stored as `left_elbow`, calf raises as `left_knee`, hip thrusts as `left_hip`.
3. **Weekly volume is miscounted.** `VolumeBars` sums left and right entries into one label, so one squat set counts as 2 "Quads" sets while one bench set counts as 1 "Chest" set, both against the same target of 10. Biceps and triceps are merged into "Arms". Calves and lower back are computed and never shown.

## Goal

The best interactive graphics achievable with free, legally usable assets, for a single-user app: an anatomical 2D muscle map, a rotatable 3D anatomy model, reference photos, and an animated 3D mannequin, wired through every workout screen. Offline-first is preserved.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| R1 | `MuscleId` (19 muscles) replaces `BodyRegion` in `primaryMuscles` / `secondaryMuscles`; new `stabilizerMuscles`. `painSensitiveRegions` and all pain logic unchanged | Every exercise has ≥1 primary; no muscle in two levels of one exercise; pain tests untouched and passing |
| R2 | Volume credit per set: primary 1.0, secondary 0.5, stabiliser 0, keyed by muscle. Display groups take the highest credit among their muscles per set | One squat set = 1 Quads set; curls count to Biceps only; calves and lower back appear |
| R3 | Per-muscle recovery status from the last session with primary or secondary work, using the existing thresholds including cutting +12h | Unit tests mirror `recovery.test.ts` cases |
| R4 | 2D muscle map: front and back, coloured by activation or load, tappable | Component test renders and fires tap callback |
| R5 | Body check uses the anatomical figure; all 19 `BodyRegion`s tappable (muscle areas or joint dots) | Same `BodyRegion` values emitted; `RegionDetail` and `PainHistory` unchanged |
| R6 | Optimised anatomy model ships locally with licence notice | Every muscle has left and right meshes (manifest test); file near 2 MB |
| R7 | 3D viewer: rotate, zoom, tap muscle for details, view presets, heat colours | Falls back to 2D while loading or without WebGL; inline viewers do not trap vertical scroll; reduced motion respected |
| R8 | Exercise detail page for all 32 exercises: demo, muscles, photos, how-to, alternatives, e1RM chart | Every id loads; tabs with no content are hidden, not empty |
| R9 | Exercises list: muscle thumbnail, link to detail, filter by tapping a muscle | Filter returns exactly the exercises with that muscle as primary or secondary |
| R10 | `/muscles` explorer with weekly volume, recovery and pain modes | Tapping a muscle shows sets this week, last trained, exercises |
| R11 | Dashboard muscle heat card; target map on `NextWorkoutCard` | Renders with no workouts logged |
| R12 | Active workout: muscle thumbnail, "Form" sheet, session-so-far heat | Set logging and progression behaviour unchanged |
| R13 | Workout summary "Muscles worked" card | Matches `calculateMuscleLoad` for that session |
| R14 | Program page: coverage map per A1/B1/A2/B2; `VolumeBars` uses the new groups | Group totals match R2 |
| R15 | Reference photos (public domain) for each exercise with a faithful match | No photo tab when there is no faithful match |
| R16 | Animated 3D mannequin for each exercise | Motion invariants pass; unclear motions are dropped, not shipped |
| R17 | Works offline after one online load | Model, photos, `/muscles`, unvisited exercise pages load offline |
| R18 | Credits and licences in Settings; `NOTICE.md` beside the model | All third-party assets listed |
| R19 | No regressions | All existing tests pass except `volumeTracking.test.ts` and `autoAdapt.test.ts` fixtures, rewritten for R1/R2 |

Baseline before this work: 429/429 tests passing.

## Data contracts

### Types (`src/types/index.ts`)

```ts
export type MuscleId =
  | "chest" | "front_delts" | "side_delts" | "rear_delts" | "rotator_cuff"
  | "biceps" | "triceps" | "forearms"
  | "upper_traps" | "mid_back" | "lats" | "lower_back"
  | "abs" | "obliques"
  | "glutes" | "quads" | "hamstrings" | "adductors" | "calves";

export type ActivationLevel = "primary" | "secondary" | "stabilizer";

export interface Exercise {
  // ...unchanged fields
  primaryMuscles: MuscleId[];     // was BodyRegion[]
  secondaryMuscles: MuscleId[];   // was BodyRegion[]
  stabilizerMuscles: MuscleId[];  // new
  painSensitiveRegions: BodyRegion[]; // unchanged
}
```

`mid_back` is rhomboids plus middle and lower trapezius. Muscles are bilateral; there is no left/right in `MuscleId`. `BodyRegion` keeps its sides because pain is side-specific.

### Display groups (`src/lib/muscles.ts`)

Every muscle belongs to exactly one group.

| Group | Muscles |
|---|---|
| Chest | chest |
| Back | lats, mid_back, upper_traps |
| Shoulders | front_delts, side_delts, rear_delts, rotator_cuff |
| Biceps | biceps |
| Triceps | triceps |
| Forearms | forearms |
| Core | abs, obliques |
| Lower Back | lower_back |
| Glutes | glutes |
| Quads | quads |
| Hamstrings | hamstrings |
| Adductors | adductors |
| Calves | calves |

### Volume rules (R2)

Per completed set (warm-ups and `skipped_pain` excluded, substitute exercise used when present, exactly as today):

- Per muscle: primary `directSets += 1`, `totalFractional += 1.0`; secondary `indirectSets += 1`, `totalFractional += 0.5`; stabiliser nothing.
- Per display group: credit is the highest among its member muscles for that set. A group with a primary member gets one direct set; a group with only secondary members gets one indirect set at 0.5. A set never credits a group twice.

### Heat scale

Weekly sets per muscle map to five levels: 0 none, 1 under 3, 2 under 6, 3 under 10, 4 at 10 or more (10 is the existing target line). A single session or a single exercise is scaled relative to its own maximum; for one exercise, primary is level 4, secondary level 2, stabiliser level 1.

### Recovery (R3)

A muscle's last-trained time is the latest completed session in which it received primary or secondary work. Status comes from `calculateRecoveryStatus(last, null, now, phase)` in `src/lib/recovery.ts`, so thresholds and the cutting bonus stay in one place.

## Muscle configuration

| Exercise | Primary | Secondary | Stabilisers |
|---|---|---|---|
| squat | quads, glutes | adductors, lower_back | abs, hamstrings, calves |
| bench | chest | front_delts, triceps | rotator_cuff |
| deadlift | hamstrings, glutes, lower_back | quads, upper_traps, mid_back, lats, forearms | abs, obliques |
| ohp | front_delts | side_delts, triceps, upper_traps | abs, obliques, lower_back |
| lat_pulldown | lats | biceps, mid_back, rear_delts | forearms |
| db_row | lats, mid_back | rear_delts, biceps | forearms, lower_back |
| goblet_squat | quads, glutes | adductors | abs, lower_back |
| bulgarian_split_squat | quads, glutes | adductors, hamstrings | abs, obliques, calves |
| db_bench | chest | front_delts, triceps | rotator_cuff |
| db_rdl | hamstrings, glutes | lower_back | forearms, upper_traps, lats, abs |
| db_shoulder_press | front_delts | side_delts, triceps, upper_traps | abs, rotator_cuff |
| db_lunge | quads, glutes | hamstrings, adductors | abs, calves, forearms |
| db_floor_press | chest, triceps | front_delts | rotator_cuff |
| single_leg_db_rdl | hamstrings, glutes | lower_back | obliques, abs, calves, forearms |
| db_arnold_press, arnold_press | front_delts | side_delts, triceps, upper_traps | abs, rotator_cuff |
| face_pulls | rear_delts | mid_back, rotator_cuff, upper_traps | biceps |
| lateral_raises | side_delts | upper_traps | forearms |
| bicep_curls | biceps | forearms | front_delts |
| tricep_pushdowns | triceps | — | abs, lats, forearms |
| oh_tricep_ext | triceps | — | abs, front_delts |
| incline_db_fly | chest | front_delts | biceps, rotator_cuff |
| leg_curls | hamstrings | calves | — |
| leg_extensions | quads | — | — |
| calf_raises | calves | — | — |
| ab_rollout | abs | obliques, lats | triceps |
| back_extensions | lower_back | glutes, hamstrings | — |
| hip_thrust | glutes | hamstrings | quads, abs, adductors |
| hammer_curls | biceps, forearms | — | front_delts |
| front_raises | front_delts | side_delts | upper_traps, abs |
| reverse_fly | rear_delts | mid_back | rotator_cuff, lower_back |
| db_skull_crushers | triceps | — | forearms |

## Visual layers

Each layer falls back to the one before it.

### 1. 2D muscle map
`react-muscle-highlighter` (MIT) wrapped in `MuscleMap`. Front and back figures side by side. Used wherever a small or instant figure is needed. The pain map (`BodyMapSVG`) is rebuilt on it: muscle regions are tappable areas, and elbow, wrist and hip, which the figure has no area for, are tappable joint dots.

### 2. 3D anatomy model
Source: `body.glb` from hpfrei/body-anatomy-3d-viewer, derived from Z-Anatomy (CC BY-SA 4.0). 8.2 MB as published, of which 5.4 MB is encyclopedia text in node metadata; 439 muscle meshes, 269 bone meshes, 176k vertices, Draco compressed, no rig. A build script strips the text, tags each muscle mesh with its `MuscleId` and side, merges bones into one mesh and non-training muscles (face, throat, hands, feet) into another, and re-encodes. Heads are separate meshes, so front, side and rear delts light up individually.

Viewer: React Three Fiber, render on demand, a small set of shared materials (one per heat level), tap picking, front/back/side presets, skeleton toggle. Inline viewers rotate horizontally only so vertical page scroll is never trapped; the `/muscles` explorer has free orbit. The 2D map shows while the model loads and stays if WebGL is unavailable.

### 3. Exercise demos
- **Photos:** two frames per exercise (start and end) from yuhonas/free-exercise-db (Unlicense), cross-faded in a loop with play/pause and scrub. Each pair is checked by eye; no faithful match means no photo tab.
- **Mannequin:** an original stylised figure. Motion is computed, not recorded: a pure function `samplePose(motion, t)` returns joint positions using two-bone inverse kinematics for arms and legs, so feet stay planted and hands stay on the bar. About 16 parametric archetypes (squat, hinge, lunge, supine press, overhead press, row, pulldown, curl, raise, triceps, leg machine, calf raise, rollout, back extension, hip thrust, face pull) cover the 32 exercises. The renderer draws capsules between joints and adds equipment props. Controls: play/pause, speed, scrub, view presets, bar-path trail.

  Invariants tested for every exercise across sampled `t`: limb lengths constant, planted feet on the floor, hands on the implement, barbell level, no NaN.

  This is the one stylised piece: a clean mannequin, not a realistic human. A motion that does not read clearly in screenshots is dropped and the exercise ships with photos and muscles only.

## Screens

| Screen | Change | Req |
|---|---|---|
| `/exercises/[id]` (new) | Hero viewer with tabs (3D demo, Muscles, Photos), how-to, muscle chips, pain-sensitive regions, alternatives, `E1RMChart` | R8 |
| `/exercises` | Muscle thumbnail per row, link to detail, tap-a-muscle filter | R9 |
| `/muscles` (new) | 3D explorer: weekly volume, recovery, pain. Muscle sheet with sets, last trained, exercises | R10 |
| Dashboard | `MuscleHeatCard`; target map on `NextWorkoutCard` | R11 |
| Active workout | Thumbnail in `ExerciseBlock`, "Form" sheet, session heat in `WorkoutOverviewSheet` | R12 |
| Summary | "Muscles worked" card | R13 |
| Program | Coverage map per workout; corrected `VolumeBars` | R14 |
| Body check | Anatomical pain map, same props | R5 |
| Settings | Credits and licences; 2D figure choice | R18 |

## Offline (R17)

The service worker is network-first and caches every successful GET, so assets are cached once fetched. To make the first gym session work offline, the client sends the worker a warm list when idle: the model, the Draco decoder, all photos, `/muscles`, and every `/exercises/<id>` page. It also pre-imports the 3D chunk so its hashed file is cached.

## Sources and licences

| Asset | Licence | Obligation |
|---|---|---|
| `body.glb` (hpfrei/body-anatomy-3d-viewer, Z-Anatomy data) | CC BY-SA 4.0 | Credit in app; optimised copy remains CC BY-SA 4.0 with changes noted in `public/models/NOTICE.md`. App code is a separate work |
| yuhonas/free-exercise-db | Unlicense | None; credited anyway |
| `react-muscle-highlighter` | MIT | None |
| `three`, `@react-three/fiber`, `@react-three/drei` | MIT | None |
| Mannequin and motion data | Original to this app | None |

Considered and excluded: MuscleWiki API (free tier is browser-playground only), Gym Visual GIF datasets (paid licence), Mixamo (account-gated, no redistribution, few gym lifts).

## Not in scope

Realistic human animation, video, any paid or account-gated source, changes to pain rules or progression logic, sync schema changes.

## Behaviour changes to existing screens

- Program page weekly volume: paired muscles halve (the double count is removed), Arms splits into Biceps and Triceps, Calves and Lower Back appear.
- Exercise details show muscle names instead of joint names.
