# Workout Flow Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the workout flow with three improvements: compressed single-page setup, set progress list for active workout visibility, and mini-map + workout overview bottom sheet for non-linear exercise navigation.

**Architecture:** Add a `goToExercise(index)` action to the Zustand workout store for non-linear navigation. Create three new components (SetProgressList, WorkoutMiniMap, WorkoutOverviewSheet) and integrate them into the active workout page. Rewrite the configure page from a 6-step wizard into a single scrollable page with smart defaults and expandable sections. Remove the UpNext component (replaced by the overview sheet).

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand, shadcn/ui Sheet component, Vitest + React Testing Library

---

### Task 1: Add `goToExercise` action to workout store

**Files:**
- Modify: `src/stores/workoutStore.ts`

**Step 1: Add `goToExercise` to the store interface and implementation**

Add a new action to `WorkoutStore` interface (after `advanceSet`):

```typescript
goToExercise: (exerciseIndex: number) => void;
```

And implement it in the store:

```typescript
goToExercise: (exerciseIndex: number) => {
  const state = get();
  if (exerciseIndex < 0 || exerciseIndex >= state.exercises.length) return;
  set({
    currentExerciseIndex: exerciseIndex,
    currentSetIndex: state.exercises[exerciseIndex].completedSets,
    isRestTimerActive: false,
    restTimeRemaining: 0,
    restTimerDuration: 0,
  });
},
```

**Step 2: Verify tests pass**

Run: `npx vitest run`
Expected: All existing tests still pass.

**Step 3: Commit**

```bash
git add src/stores/workoutStore.ts
git commit -m "feat(store): add goToExercise action for non-linear workout navigation"
```

---

### Task 2: Create SetProgressList component

This replaces the `CompletedSets` component. Shows all sets for the current exercise: completed, current, and remaining.

**Files:**
- Create: `src/components/ActiveWorkout/SetProgressList.tsx`

**Step 1: Create the component**

```tsx
"use client";

import type { SetLog, WorkoutLocation } from "@/types";
import type { WorkoutExerciseState } from "@/stores/workoutStore";
import { getExercise } from "@/lib/exercises";

interface SetProgressListProps {
  exercise: WorkoutExerciseState;
  completedSets: SetLog[];
  location: WorkoutLocation;
}

export function SetProgressList({
  exercise,
  completedSets,
  location,
}: SetProgressListProps) {
  const exerciseId = exercise.substituteExerciseId || exercise.exerciseId;
  const exerciseInfo = getExercise(exerciseId);

  // Filter completed sets for THIS exercise
  const exerciseSets = completedSets.filter((s) => {
    const matchId = s.substituteExerciseId || s.exerciseId;
    return matchId === exerciseId || s.exerciseId === exerciseId;
  });

  const currentSetNumber = exercise.completedSets + 1;
  const isDumbbell = exerciseInfo.grip === "per_hand";

  const formatWeight = (weight: number) =>
    isDumbbell ? `${weight}/h` : `${weight}`;

  return (
    <div className="px-4 py-3 space-y-1">
      {Array.from({ length: exercise.targetSets }, (_, i) => {
        const setNum = i + 1;
        const loggedSet = exerciseSets[i]; // ith completed set
        const isCurrent = setNum === currentSetNumber;
        const isCompleted = setNum < currentSetNumber;
        const isRemaining = setNum > currentSetNumber;
        const isAMRAPSet = exercise.isAMRAP && setNum === exercise.targetSets;

        return (
          <div
            key={setNum}
            className={`flex items-center gap-2 text-sm py-1 rounded-md px-2 ${
              isCurrent
                ? "bg-accent-primary/10 text-foreground font-medium"
                : isCompleted
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50"
            }`}
          >
            {/* Status indicator */}
            <span className="w-5 text-center shrink-0">
              {isCompleted && (
                <span className="text-green-500 font-medium">&#10003;</span>
              )}
              {isCurrent && (
                <span className="text-accent-primary font-bold">&rarr;</span>
              )}
              {isRemaining && (
                <span className="opacity-40">&#9675;</span>
              )}
            </span>

            {/* Set label */}
            <span className="font-mono tabular-nums w-12 shrink-0">
              Set {setNum}
            </span>

            {/* Weight x reps */}
            <span className="font-mono tabular-nums flex-1">
              {isCompleted && loggedSet ? (
                <>
                  {formatWeight(loggedSet.weight)} &times; {loggedSet.actualReps}
                  {loggedSet.isAMRAP && (
                    <span className="text-amber-400 ml-1 text-xs">AMRAP</span>
                  )}
                </>
              ) : (
                <>
                  {formatWeight(exercise.weight)} &times;{" "}
                  {exercise.targetReps}{isAMRAPSet ? "+" : ""}{" "}
                  <span className="text-xs opacity-60">target</span>
                </>
              )}
            </span>

            {/* RPE if available */}
            {isCompleted && loggedSet?.rpe != null && (
              <span className="text-xs opacity-60 shrink-0">
                RPE {loggedSet.rpe}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify the app builds**

Run: `npx vitest run`
Expected: All tests still pass (new component not yet wired in).

**Step 3: Commit**

```bash
git add src/components/ActiveWorkout/SetProgressList.tsx
git commit -m "feat(ui): create SetProgressList component showing all sets (done/current/remaining)"
```

---

### Task 3: Create WorkoutMiniMap component

Persistent progress strip below the workout header showing workout structure with colored segments.

**Files:**
- Create: `src/components/ActiveWorkout/WorkoutMiniMap.tsx`

**Step 1: Create the component**

```tsx
"use client";

import type { WorkoutExerciseState } from "@/stores/workoutStore";

interface WorkoutMiniMapProps {
  exercises: WorkoutExerciseState[];
  currentExerciseIndex: number;
  onTap: () => void;
}

function getTierFillColor(tier: string): string {
  switch (tier) {
    case "T1": return "bg-red-500";
    case "T2": return "bg-orange-500";
    case "T3": return "bg-blue-500";
    case "accessory": return "bg-green-500";
    default: return "bg-muted-foreground";
  }
}

function getTierEmptyColor(tier: string): string {
  switch (tier) {
    case "T1": return "bg-red-500/20";
    case "T2": return "bg-orange-500/20";
    case "T3": return "bg-blue-500/20";
    case "accessory": return "bg-green-500/20";
    default: return "bg-muted";
  }
}

export function WorkoutMiniMap({
  exercises,
  currentExerciseIndex,
  onTap,
}: WorkoutMiniMapProps) {
  // Group exercises by main exercise (skip warm-ups)
  const mainExercises = exercises.filter((e) => !e.isWarmUp);

  // Map back to original indices for current detection
  const mainExerciseIndices = exercises
    .map((e, i) => ({ exercise: e, index: i }))
    .filter((item) => !item.exercise.isWarmUp);

  return (
    <button
      onClick={onTap}
      className="w-full px-4 py-2 flex items-center gap-2 active:bg-muted/30 transition-colors"
      aria-label="Open workout overview"
    >
      {mainExerciseIndices.map(({ exercise, index }, groupIdx) => {
        const isCurrent = index === currentExerciseIndex;
        const isCompleted = exercise.completedSets >= exercise.targetSets;
        const isPartial = exercise.completedSets > 0 && !isCompleted;

        return (
          <div
            key={`${exercise.exerciseId}-${exercise.tier}-${groupIdx}`}
            className="flex gap-0.5 flex-1"
          >
            {Array.from({ length: exercise.targetSets }, (_, setIdx) => {
              const setDone = setIdx < exercise.completedSets;
              const isCurrentSet =
                isCurrent && setIdx === exercise.completedSets;

              return (
                <div
                  key={setIdx}
                  className={`h-2 flex-1 rounded-full transition-all ${
                    setDone
                      ? getTierFillColor(exercise.tier)
                      : isCurrentSet
                        ? `${getTierFillColor(exercise.tier)} animate-pulse`
                        : getTierEmptyColor(exercise.tier)
                  }`}
                />
              );
            })}
          </div>
        );
      })}

      {/* Chevron indicator */}
      <span className="text-muted-foreground text-xs ml-1 shrink-0">&#9660;</span>
    </button>
  );
}
```

**Step 2: Verify**

Run: `npx vitest run`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/components/ActiveWorkout/WorkoutMiniMap.tsx
git commit -m "feat(ui): create WorkoutMiniMap persistent progress strip component"
```

---

### Task 4: Create WorkoutOverviewSheet component

Bottom sheet showing the full workout map with tappable exercises.

**Files:**
- Create: `src/components/ActiveWorkout/WorkoutOverviewSheet.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { getExercise } from "@/lib/exercises";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { WorkoutExerciseState } from "@/stores/workoutStore";

interface WorkoutOverviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: WorkoutExerciseState[];
  currentExerciseIndex: number;
  onSelectExercise: (index: number) => void;
  elapsedTime: string;
}

function getTierColor(tier: string): string {
  switch (tier) {
    case "T1": return "bg-red-600 text-white";
    case "T2": return "bg-orange-500 text-white";
    case "T3": return "bg-blue-500 text-white";
    case "accessory": return "bg-green-600 text-white";
    default: return "bg-muted text-muted-foreground";
  }
}

export function WorkoutOverviewSheet({
  open,
  onOpenChange,
  exercises,
  currentExerciseIndex,
  onSelectExercise,
  elapsedTime,
}: WorkoutOverviewSheetProps) {
  // Filter out warm-ups but track original indices
  const mainExercises = exercises
    .map((e, i) => ({ exercise: e, originalIndex: i }))
    .filter((item) => !item.exercise.isWarmUp);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Workout Overview</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto flex-1 py-2 space-y-1">
          {mainExercises.map(({ exercise, originalIndex }, idx) => {
            const exerciseInfo = getExercise(
              exercise.substituteExerciseId || exercise.exerciseId
            );
            const isCurrent = originalIndex === currentExerciseIndex;
            const isCompleted =
              exercise.completedSets >= exercise.targetSets;
            const isDumbbell = exerciseInfo.grip === "per_hand";
            const weightLabel = isDumbbell
              ? `${exercise.weight}/h`
              : `${exercise.weight} lbs`;

            return (
              <button
                key={`${exercise.exerciseId}-${exercise.tier}-${idx}`}
                onClick={() => {
                  onSelectExercise(originalIndex);
                  onOpenChange(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                  isCurrent
                    ? "bg-accent-primary/10 ring-1 ring-accent-primary/30"
                    : "active:bg-muted/50"
                } ${isCompleted ? "opacity-60" : ""}`}
              >
                {/* Status indicator */}
                <span className="w-5 text-center shrink-0">
                  {isCompleted && (
                    <span className="text-green-500">&#10003;</span>
                  )}
                  {isCurrent && !isCompleted && (
                    <span className="text-accent-primary font-bold">&rarr;</span>
                  )}
                  {!isCompleted && !isCurrent && (
                    <span className="text-muted-foreground/40">&#9675;</span>
                  )}
                </span>

                {/* Tier badge */}
                <Badge className={`${getTierColor(exercise.tier)} text-[10px] px-1.5 py-0 shrink-0`}>
                  {exercise.tier === "accessory" ? "Acc" : exercise.tier}
                </Badge>

                {/* Exercise name */}
                <span className="flex-1 truncate text-sm">
                  {exerciseInfo.name}
                </span>

                {/* Weight */}
                <span className="text-sm font-mono tabular-nums text-muted-foreground shrink-0">
                  {weightLabel}
                </span>

                {/* Set progress */}
                <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                  {exercise.completedSets}/{exercise.targetSets}
                </span>
              </button>
            );
          })}
        </div>

        {/* Elapsed time */}
        <div className="pt-2 pb-4 text-center text-sm text-muted-foreground font-mono tabular-nums border-t">
          Elapsed: {elapsedTime}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Verify**

Run: `npx vitest run`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/components/ActiveWorkout/WorkoutOverviewSheet.tsx
git commit -m "feat(ui): create WorkoutOverviewSheet bottom sheet with tappable exercise navigation"
```

---

### Task 5: Integrate new components into the active workout page

Wire SetProgressList, WorkoutMiniMap, and WorkoutOverviewSheet into the active workout page. Remove CompletedSets and UpNext.

**Files:**
- Modify: `src/app/workout/active/page.tsx`

**Step 1: Update imports**

Replace the CompletedSets and UpNext imports:

```tsx
// REMOVE these:
import { CompletedSets } from "@/components/ActiveWorkout/CompletedSets";
import { UpNext } from "@/components/ActiveWorkout/UpNext";

// ADD these:
import { SetProgressList } from "@/components/ActiveWorkout/SetProgressList";
import { WorkoutMiniMap } from "@/components/ActiveWorkout/WorkoutMiniMap";
import { WorkoutOverviewSheet } from "@/components/ActiveWorkout/WorkoutOverviewSheet";
```

**Step 2: Add state and handlers for the overview sheet**

Inside `ActiveWorkoutContent`, after the existing local state declarations, add:

```tsx
const [overviewOpen, setOverviewOpen] = useState(false);
```

Destructure `goToExercise` from the store alongside other actions.

Add an elapsed time calculation:

```tsx
const [elapsedStr, setElapsedStr] = useState("0:00");
useEffect(() => {
  if (!workoutStartTime) return;
  const interval = setInterval(() => {
    const seconds = Math.floor((Date.now() - workoutStartTime.getTime()) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    setElapsedStr(`${m}:${s.toString().padStart(2, "0")}`);
  }, 1000);
  return () => clearInterval(interval);
}, [workoutStartTime]);
```

Add handler for exercise selection from the overview:

```tsx
const handleSelectExercise = useCallback((index: number) => {
  goToExercise(index);
  setSelectedReps(null);
  setSelectedRPE(null);
  setE1rmDisplay(null);
  setT2AutoRegBanner(null);
  setT2AutoRegAccepted(false);
}, [goToExercise]);
```

**Step 3: Update the JSX**

After the `<WorkoutHeader>`, add the mini-map:

```tsx
{/* Mini-Map */}
<WorkoutMiniMap
  exercises={exercises}
  currentExerciseIndex={currentExerciseIndex}
  onTap={() => setOverviewOpen(true)}
/>
```

Replace the `<CompletedSets>` usage with `<SetProgressList>`:

```tsx
{/* Set Progress List — replaces CompletedSets */}
<SetProgressList
  exercise={currentExercise}
  completedSets={completedSets}
  location={store.location}
/>
```

Remove the `<UpNext>` component entirely.

Add the overview sheet at the end of the component JSX (before closing `</div>`):

```tsx
{/* Workout Overview Sheet */}
<WorkoutOverviewSheet
  open={overviewOpen}
  onOpenChange={setOverviewOpen}
  exercises={exercises}
  currentExerciseIndex={currentExerciseIndex}
  onSelectExercise={handleSelectExercise}
  elapsedTime={elapsedStr}
/>
```

**Step 4: Move SetProgressList above the set logger**

Reorder the JSX so the set progress list appears between ExerciseBlock and the set logger:

```
ExerciseBlock → AMRAP Indicator → e1RM Display → T2 Banner → SetProgressList → RestTimer → SetLogger → [Sheet at bottom]
```

**Step 5: Verify**

Run: `npx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/app/workout/active/page.tsx
git commit -m "feat(workout): integrate mini-map, set progress list, and overview sheet into active workout

Replace CompletedSets with SetProgressList showing all sets. Replace UpNext
with WorkoutOverviewSheet bottom sheet. Add WorkoutMiniMap progress strip
below header. Support non-linear exercise navigation via goToExercise."
```

---

### Task 6: Rewrite the configure page as a single scrollable page

Transform the 6-step wizard into a single page with the exercise preview as the main content and expandable sections for optional items.

**Files:**
- Modify: `src/app/workout/configure/page.tsx`

**Step 1: Understand the rewrite scope**

The configure page currently uses a `currentStep` state machine to progress through 6 steps. The rewrite:
- Removes the step state machine entirely
- Shows the exercise preview (currently step "preview") as the main content
- Adds collapsible `<details>` elements or similar for readiness check, body check, and technique checklist
- Keeps warning banners auto-shown (not collapsed)
- Keeps the START WORKOUT button sticky at the bottom
- All existing state variables (location, warmUps, sleepHours, stressLevel, selectedAccessories, exerciseOverrides, etc.) are preserved — only the multi-step navigation is removed

**Step 2: Rewrite the JSX**

Replace the multi-step conditional rendering with a single page layout. The structure should be:

```
<div className="min-h-screen bg-background pb-24">
  {/* Header */}
  <div className="px-4 pt-6 pb-4 space-y-4">
    <h1>{templateName}</h1>
    <div className="flex gap-2">
      <LocationToggle ... />
      <WarmUpToggle ... />
    </div>
  </div>

  {/* Auto-surfaced warnings (NOT collapsible) */}
  {runAdvisory && !runAdvisoryDismissed && <RunAdvisoryBanner ... />}
  {recoveryWarnings.length > 0 && <RecoveryWarningBanner ... />}

  {/* Expandable: Readiness Check */}
  <details className="px-4">
    <summary>How are you feeling?</summary>
    <ReadinessCheck ... />
  </details>

  {/* Expandable: Body Check */}
  <details className="px-4">
    <summary>Any pain or soreness?</summary>
    {recentPainEntries display + link to /body-check}
  </details>

  {/* Expandable: Technique (only if T1) */}
  {t1Type && (
    <details className="px-4">
      <summary>Technique review</summary>
      <TechniqueChecklist ... />
    </details>
  )}

  {/* Main content: Exercise Preview */}
  <div className="px-4 py-4 space-y-3">
    {exerciseAdaptations list with tier badges, weights, warm-up previews}
  </div>

  {/* Accessory Picker */}
  <AccessoryPicker ... />

  {/* Time Estimate */}
  <TimeEstimate ... />

  {/* Sticky Start Button */}
  <div className="fixed bottom-0 inset-x-0 p-4 bg-background/95 backdrop-blur border-t">
    <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={handleStartWorkout}>
      START WORKOUT
    </Button>
  </div>
</div>
```

**Step 3: Remove step-related state and handlers**

- Remove `currentStep` state
- Remove `STEP_ORDER` constant
- Remove `goToStep` function
- Remove `handleLocationNext`, `handleReadinessNext`, `handleReadinessSkip`, `handleWarningsNext`, `handleTechniqueNext`, `handleTechniqueSkip`, `handleBodyCheckNext` handlers
- Keep `handleStartWorkout` and all data-fetching logic unchanged

**Step 4: Style the expandable sections**

Use styled `<details>` with Tailwind for a clean collapsible look:

```tsx
<details className="group border-b border-border">
  <summary className="px-4 py-3 flex items-center justify-between cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
    <span>How are you feeling?</span>
    <span className="text-xs group-open:rotate-180 transition-transform">&#9660;</span>
  </summary>
  <div className="px-4 pb-4">
    <ReadinessCheck ... />
  </div>
</details>
```

The `ReadinessCheck`, `TechniqueChecklist`, and body check sections need their `onNext`/`onSkip` props removed since there's no step progression. They become simple inline forms.

**Step 5: Verify**

Run: `npx vitest run`
Expected: All tests pass.

**Step 6: Verify in browser**

Use Playwright MCP to navigate to `/workout/configure` and verify:
- Single page loads with exercise preview visible
- Location toggle works
- Expandable sections open/close
- Warnings auto-surface
- START WORKOUT button is sticky at bottom

**Step 7: Commit**

```bash
git add src/app/workout/configure/page.tsx
git commit -m "feat(configure): rewrite setup as single scrollable page with smart defaults

Replace 6-step wizard with single page. Exercise preview is main content.
Readiness, body check, and technique are collapsible sections. Warnings
auto-surface as dismissible banners. START WORKOUT button is sticky."
```

---

### Task 7: Clean up removed components

**Files:**
- Check: `src/components/ActiveWorkout/CompletedSets.tsx` — verify no other imports
- Check: `src/components/ActiveWorkout/UpNext.tsx` — verify no other imports
- If no other consumers, these files can be deleted (but don't delete until verified)

**Step 1: Search for remaining imports**

```bash
# Check if CompletedSets is imported anywhere else
grep -r "CompletedSets" src/ --include="*.tsx" --include="*.ts"

# Check if UpNext is imported anywhere else
grep -r "UpNext" src/ --include="*.tsx" --include="*.ts"
```

If only the active workout page imported them (and we already removed those imports in Task 5), delete the files.

**Step 2: Delete unused files**

```bash
rm src/components/ActiveWorkout/CompletedSets.tsx
rm src/components/ActiveWorkout/UpNext.tsx
```

**Step 3: Verify**

Run: `npx vitest run`
Expected: All tests pass, no broken imports.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove CompletedSets and UpNext components (replaced by SetProgressList and WorkoutOverviewSheet)"
```

---

### Task 8: Final integration verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Browser verification with Playwright**

Verify the following flows:
1. Navigate to `/workout/configure` — single page with exercise preview, expandable sections
2. Start a workout — navigate to active workout page
3. Verify mini-map appears below header with colored segments
4. Verify set progress list shows all sets (current highlighted)
5. Log a set — verify set progress list updates (check mark appears)
6. Tap mini-map — verify overview sheet opens
7. Tap a different exercise in the sheet — verify navigation works
8. Verify rest timer doesn't hide the set progress list

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues from workout flow redesign"
```
