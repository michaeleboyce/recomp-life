# Workout Flow Redesign — Design Document

## Problem

The current workout flow has three UX pain points:

1. **Setup friction:** A 6-step wizard (location → readiness → warnings → technique → body check → exercise preview) forces linear progression through screens that are often irrelevant.
2. **No set-level visibility:** During an exercise, you only see completed sets. There's no view of upcoming sets within the current exercise.
3. **No workout-level context:** You can't see the full workout structure without losing your place in the current exercise. The "Up Next" component only shows future exercises, not a complete map.

## Design

### 1. Compressed Setup (Single Page)

Replace the 6-step wizard with a single scrollable page.

**Always visible:**
- Workout template name + day label
- Location toggle (Gym/Home) — remembers last choice
- Warm-up toggle

**Main content — Exercise preview:**
- Full exercise list with tier badges, weights, rep schemes
- Home adaptations shown inline if location = Home
- Accessory picker as expandable section at bottom of list
- Warm-up preview under T1 if enabled
- Time estimate at bottom

**Expandable sections (collapsed by default):**
- "How are you feeling?" → Readiness check (sleep, stress)
- "Any pain or soreness?" → Body check with recent entries
- "Technique review" → Form checklist (only if workout has T1)

**Auto-surfaced warnings (not collapsed):**
- Run fatigue advisory and recovery warnings appear as dismissible alert banners above the exercise list. Safety-critical content is never hidden.

**Sticky bottom:** START WORKOUT button.

### 2. Set Progress List (Active Workout)

Replace the `CompletedSets` component with a full set list showing all sets:

```
✅ Set 1    185 lbs × 3 reps    RPE 7
✅ Set 2    185 lbs × 3 reps    RPE 8
→  Set 3    185 lbs × 3 target         ← current
○  Set 4    185 lbs × 3 target
○  Set 5    185 lbs × 3 target
```

- **Completed:** checkmark, actual reps, RPE if recorded
- **Current:** arrow indicator, highlighted row, target reps
- **Remaining:** dim circle, target reps
- **AMRAP:** "+" badge on target for last set
- **Warm-ups:** shown above working sets with subtle separator

The set progress list stays visible during rest timer (rest timer replaces the set logger below it, not the whole view).

### 3. Mini-Map (Persistent Progress Strip)

A thin horizontal strip (~28px) below the workout header showing workout structure:

```
[■■■] [■■□] [□□□] [○○○]
 T1     T2    T3   Acc
```

- Each exercise = a group of small segments (one per set)
- Color-coded by tier: T1 red, T2 orange, T3 blue, Acc green
- Filled = completed, current = partially filled/pulsing, empty = remaining
- Warm-ups excluded from mini-map
- Tapping opens the workout overview sheet
- Subtle handle/chevron indicates interactivity

### 4. Workout Overview Sheet (Bottom Sheet)

Opens from the mini-map tap, covers ~75% of screen:

```
── Workout Overview ──────────────────
                                   ✕ close

✅ T1  Squat              185 lbs   5/5 sets
→  T2  Overhead Press      95 lbs   2/5 sets
○  T3  Lat Pulldown        80 lbs   0/3 sets
○  Acc  Face Pulls         25 lbs   0/3 sets

                   Elapsed: 32:15
```

- **Tappable rows** — tap any exercise to jump to it
- Completed exercises: checkmark, slightly dimmed
- Current exercise: arrow indicator
- Remaining exercises: open circle
- Dismissible via X, swipe down, or tap outside

**Jumping behavior:**
- Tapping navigates to that exercise and closes the sheet
- Set logger loads with that exercise's current state (completed sets preserved)
- Workout is non-linear — free navigation between exercises
- Replaces the current `UpNext` component entirely

## Components Affected

| Action | Component/File |
|--------|---------------|
| **Rewrite** | `/workout/configure/page.tsx` — 6-step wizard → single page |
| **Replace** | `CompletedSets` → new `SetProgressList` component |
| **Remove** | `UpNext` component — replaced by overview sheet |
| **New** | `WorkoutMiniMap` component (persistent progress strip) |
| **New** | `WorkoutOverviewSheet` component (bottom sheet) |
| **Modify** | `ExerciseBlock` — integrate set progress list |
| **Modify** | `RestTimer` — only replaces set logger, not set list |
| **Modify** | Active workout page — support non-linear exercise navigation |
| **Modify** | Workout store — support jumping between exercises |
