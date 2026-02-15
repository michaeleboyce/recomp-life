# Home Exercise Fallback System Design

## Problem

When location is "home", the app converts barbell exercises to dumbbell alternatives. But:

1. **NextWorkoutCard** shows the exercise name correctly but displays raw barbell weight (e.g., "DB Bench Press — 145 lbs" instead of "60 lbs/hand")
2. When the converted dumbbell weight exceeds `maxDumbbellWeight`, there's no fallback — the system just warns but doesn't suggest alternatives that could handle the load
3. For legs especially, goblet squat (both_hands grip) hits the dumbbell ceiling fast (80 lb max = ~100 lb barbell equivalent), while Bulgarian split squat (per_hand) could handle the load

## Design

### Fallback Chains

Each barbell exercise gets an ordered list of home substitutes. The system tries each in priority order and auto-selects the first that fits within `maxDumbbellWeight`.

| Barbell | P1 | P2 | P3 |
|---|---|---|---|
| Squat | Goblet Squat (both_hands) | Bulgarian Split Squat (per_hand) | DB Lunge (per_hand, new) |
| Bench | DB Bench Press (per_hand) | DB Floor Press (per_hand, new) | — |
| Deadlift | DB RDL (per_hand) | Single-Leg DB RDL (per_hand, new) | — |
| OHP | DB Shoulder Press (per_hand) | DB Arnold Press (per_hand, new) | — |

### Algorithm (`autoAdapt.ts`)

`adaptExerciseForHome()` changes:

1. Try primary substitute — if it fits, return as today
2. If primary exceeds, try each fallback in order
3. Auto-select the first fallback that fits as `adaptedExercise`
4. Populate `alternatives[]` with ALL options (including primary capped at max) so the configure page can present choices
5. If nothing fits, use primary capped at `maxDumbbellWeight`, mark as `exceeds`

### Dashboard Fix (`NextWorkoutCard.tsx`)

- Load user equipment profile
- When location is "home", run `adaptExerciseForHome()` for T1/T2
- Display `adaptedWeight` (not raw barbell weight)
- Show "/hand" suffix for per_hand grip exercises
- Show subtle indicator when weight is capped or fallback was used

### Configure Page Enhancement

With `alternatives[]` now populated, add a picker when multiple options exist. User taps to choose between e.g. "Goblet Squat @ 80 lbs (capped)" vs "Bulgarian Split Squat @ 55 lbs/hand (full load)".

### Progression Tracking

When a home workout uses a capped exercise, sets get `status: "reduced_equipment"` (already exists). This freezes progression — no penalty, no advancement until full load at the gym.

### New Exercises

Added to `exercises.ts`:

- **db_lunge** — per_hand, legs, primaryMuscles: left_quad/right_quad
- **db_floor_press** — per_hand, push, primaryMuscles: chest
- **single_leg_db_rdl** — per_hand, pull, primaryMuscles: left_hamstring/right_hamstring
- **db_arnold_press** — per_hand, push, primaryMuscles: left_shoulder/right_shoulder

### User Choices

- Configure page shows options when multiple alternatives exist; user picks
- Dashboard shows best-fit preview only (no picker)
- Auto-select first fitting fallback, but user overrides on configure page
