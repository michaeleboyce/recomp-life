# Home Exercise Fallback System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When training at home and dumbbell weight exceeds the user's max, auto-select a fallback exercise that fits, show converted weights everywhere, and let the user pick between alternatives on the configure page.

**Architecture:** Add fallback chains per barbell exercise in `exercises.ts`. Enhance `adaptExerciseForHome()` to walk the chain and populate `alternatives[]`. Fix `NextWorkoutCard` to display converted weights. Add a picker on the configure page when alternatives exist.

**Tech Stack:** TypeScript, React, Dexie (IndexedDB), Vitest

---

### Task 1: Add New Exercises to Catalog

**Files:**
- Modify: `src/lib/exercises.ts` (after line 155, before Accessories section)

**Step 1: Add four new exercise definitions**

Add these exercises to `EXERCISES` in `src/lib/exercises.ts`, between `db_shoulder_press` and the Accessories section comment:

```typescript
db_lunge: {
  id: "db_lunge",
  name: "DB Lunge",
  type: "dumbbell",
  muscleGroup: "legs",
  requiresGym: false,
  barbellEquivalent: "squat",
  grip: "per_hand",
  primaryMuscles: ["left_quad", "right_quad"],
  secondaryMuscles: ["left_hamstring", "right_hamstring", "left_hip", "right_hip"],
  painSensitiveRegions: ["left_knee", "right_knee"],
},

db_floor_press: {
  id: "db_floor_press",
  name: "DB Floor Press",
  type: "dumbbell",
  muscleGroup: "push",
  requiresGym: false,
  barbellEquivalent: "bench",
  grip: "per_hand",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow"],
  painSensitiveRegions: ["left_shoulder", "right_shoulder"],
},

single_leg_db_rdl: {
  id: "single_leg_db_rdl",
  name: "Single-Leg DB RDL",
  type: "dumbbell",
  muscleGroup: "pull",
  requiresGym: false,
  barbellEquivalent: "deadlift",
  grip: "per_hand",
  primaryMuscles: ["left_hamstring", "right_hamstring"],
  secondaryMuscles: ["upper_back", "core", "left_hip", "right_hip"],
  painSensitiveRegions: ["lower_back"],
},

db_arnold_press: {
  id: "db_arnold_press",
  name: "DB Arnold Press",
  type: "dumbbell",
  muscleGroup: "push",
  requiresGym: false,
  barbellEquivalent: "ohp",
  grip: "per_hand",
  primaryMuscles: ["left_shoulder", "right_shoulder"],
  secondaryMuscles: ["chest", "core"],
  painSensitiveRegions: ["left_shoulder", "right_shoulder"],
},
```

**Step 2: Run tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All existing tests still pass.

**Step 3: Commit**

```bash
git add src/lib/exercises.ts
git commit -m "feat: add fallback dumbbell exercises (lunge, floor press, single-leg RDL, arnold press)"
```

---

### Task 2: Add Fallback Chains Data Structure

**Files:**
- Modify: `src/lib/exercises.ts` (after `ACCESSORY_IDS` export)

**Step 1: Add the HOME_SUBSTITUTE_CHAINS export**

Add after `ACCESSORY_IDS`:

```typescript
/**
 * Ordered fallback chains for home dumbbell substitutes.
 * When the primary substitute (index 0) exceeds maxDumbbellWeight,
 * the system tries each fallback in order.
 */
export const HOME_SUBSTITUTE_CHAINS: Record<string, string[]> = {
  squat: ["goblet_squat", "bulgarian_split_squat", "db_lunge"],
  bench: ["db_bench", "db_floor_press"],
  deadlift: ["db_rdl", "single_leg_db_rdl"],
  ohp: ["db_shoulder_press", "db_arnold_press"],
};
```

**Step 2: Commit**

```bash
git add src/lib/exercises.ts
git commit -m "feat: add HOME_SUBSTITUTE_CHAINS for fallback exercise selection"
```

---

### Task 3: Update autoAdapt to Use Fallback Chains

**Files:**
- Modify: `src/lib/autoAdapt.ts`
- Test: `src/lib/autoAdapt.test.ts`

**Step 1: Write failing tests for fallback behavior**

Add to `src/lib/autoAdapt.test.ts`:

```typescript
import { EXERCISES } from './exercises';

describe('fallback chain behavior', () => {
  it('falls back from goblet squat to bulgarian split squat when weight exceeds max', () => {
    const equipment = makeEquipment({ maxDumbbellWeight: 80 });
    // Squat at 135 lb: goblet = 110 (exceeds 80), BSS = 55/hand (fits)
    const result = adaptExerciseForHome(
      EXERCISES.squat,
      135,
      equipment,
      EXERCISES.goblet_squat
    );

    expect(result.adaptedExercise.id).toBe('bulgarian_split_squat');
    expect(result.adaptedWeight).toBe(55);
    expect(result.adaptationStatus).toBe('fits');
  });

  it('populates alternatives with all options when primary exceeds', () => {
    const equipment = makeEquipment({ maxDumbbellWeight: 80 });
    const result = adaptExerciseForHome(
      EXERCISES.squat,
      135,
      equipment,
      EXERCISES.goblet_squat
    );

    expect(result.alternatives.length).toBeGreaterThanOrEqual(2);
    // Primary (capped) should be in alternatives
    expect(result.alternatives.some(a => a.exercise.id === 'goblet_squat')).toBe(true);
    // Selected fallback should also be in alternatives
    expect(result.alternatives.some(a => a.exercise.id === 'bulgarian_split_squat')).toBe(true);
  });

  it('caps primary at maxDumbbellWeight in alternatives', () => {
    const equipment = makeEquipment({ maxDumbbellWeight: 80 });
    const result = adaptExerciseForHome(
      EXERCISES.squat,
      135,
      equipment,
      EXERCISES.goblet_squat
    );

    const gobletAlt = result.alternatives.find(a => a.exercise.id === 'goblet_squat');
    expect(gobletAlt).toBeDefined();
    expect(gobletAlt!.weight).toBe(80); // capped at max
  });

  it('returns primary substitute when weight fits without needing fallback', () => {
    const equipment = makeEquipment({ maxDumbbellWeight: 80 });
    // Bench at 145 lb: DB bench = 60/hand (fits within 80)
    const result = adaptExerciseForHome(
      EXERCISES.bench,
      145,
      equipment,
      EXERCISES.db_bench
    );

    expect(result.adaptedExercise.id).toBe('db_bench');
    expect(result.adaptedWeight).toBe(60);
    expect(result.alternatives).toHaveLength(0); // no alternatives needed
  });

  it('caps at max and marks exceeds when ALL fallbacks exceed', () => {
    // maxDumbbellWeight so low that even per_hand fallbacks exceed
    const equipment = makeEquipment({ maxDumbbellWeight: 30 });
    // Squat at 200: goblet = 160 (exceeds), BSS = 80/hand (exceeds), lunge = 80/hand (exceeds)
    const result = adaptExerciseForHome(
      EXERCISES.squat,
      200,
      equipment,
      EXERCISES.goblet_squat
    );

    expect(result.adaptationStatus).toBe('exceeds');
    expect(result.adaptedWeight).toBe(30); // capped at max
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/autoAdapt.test.ts`
Expected: New tests FAIL (fallback logic not implemented yet).

**Step 3: Implement fallback logic in adaptExerciseForHome**

Modify `src/lib/autoAdapt.ts`:

1. Add import for `HOME_SUBSTITUTE_CHAINS` and `EXERCISES`:
```typescript
import { HOME_SUBSTITUTE_CHAINS, EXERCISES } from './exercises';
```

2. Replace the Case 2 section (lines 113-149) with fallback chain logic:

```typescript
// Case 2: Requires gym and has a dumbbell alternative
const isBothHands = substituteExercise.grip === 'both_hands';
const dbEquiv = isBothHands
  ? barbellToBothHands(prescribedWeight)
  : barbellToDumbbell(prescribedWeight);

// Check if primary substitute fits
if (dbEquiv <= equipment.maxDumbbellWeight) {
  // Primary fits — return as before, no alternatives needed
  const adaptationStatus: AdaptationStatus =
    dbEquiv <= equipment.maxDumbbellWeight ? 'fits' : 'borderline';
  const confidenceLevel = getConfidenceLevel(substituteExercise.id, adaptationStatus);
  const warningMessage = buildWarningMessage(
    exercise.name, prescribedWeight, substituteExercise.name,
    dbEquiv, equipment.maxDumbbellWeight, adaptationStatus, isBothHands
  );

  return {
    originalExercise: exercise,
    originalWeight: prescribedWeight,
    adaptedExercise: substituteExercise,
    adaptedWeight: dbEquiv,
    adaptationStatus,
    confidenceLevel,
    warningMessage,
    alternatives: [],
  };
}

// Primary exceeds — try fallback chain
const chain = HOME_SUBSTITUTE_CHAINS[exercise.id] ?? [];
const alternatives: AdaptationOption[] = [];
let bestFit: { exercise: Exercise; weight: number; status: AdaptationStatus } | null = null;

for (const subId of chain) {
  const sub = EXERCISES[subId];
  if (!sub) continue;

  const subIsBothHands = sub.grip === 'both_hands';
  const subWeight = subIsBothHands
    ? barbellToBothHands(prescribedWeight)
    : barbellToDumbbell(prescribedWeight);

  const fits = subWeight <= equipment.maxDumbbellWeight;
  const isBorderline = !fits && subWeight < equipment.maxDumbbellWeight + 10;
  const displayWeight = fits ? subWeight : equipment.maxDumbbellWeight;
  const suffix = subIsBothHands ? 'lbs' : 'lbs/hand';

  alternatives.push({
    label: `${sub.name} @ ${displayWeight} ${suffix}`,
    exercise: sub,
    weight: displayWeight,
    pros: fits ? 'Full load achieved' : (isBorderline ? 'Close to limit' : 'Capped at max DB weight'),
    cons: fits ? '' : `Needs ${subWeight} ${suffix}, max is ${equipment.maxDumbbellWeight}`,
  });

  if (fits && !bestFit) {
    bestFit = { exercise: sub, weight: subWeight, status: 'fits' };
  }
}

if (bestFit) {
  const confidenceLevel = getConfidenceLevel(bestFit.exercise.id, bestFit.status);
  return {
    originalExercise: exercise,
    originalWeight: prescribedWeight,
    adaptedExercise: bestFit.exercise,
    adaptedWeight: bestFit.weight,
    adaptationStatus: bestFit.status,
    confidenceLevel,
    warningMessage: buildWarningMessage(
      exercise.name, prescribedWeight, bestFit.exercise.name,
      bestFit.weight, equipment.maxDumbbellWeight, bestFit.status,
      bestFit.exercise.grip === 'both_hands'
    ),
    alternatives,
  };
}

// Nothing fits — cap at max, return primary with exceeds
const cappedWeight = equipment.maxDumbbellWeight;
const adaptationStatus: AdaptationStatus = 'exceeds';
const confidenceLevel = getConfidenceLevel(substituteExercise.id, adaptationStatus);

return {
  originalExercise: exercise,
  originalWeight: prescribedWeight,
  adaptedExercise: substituteExercise,
  adaptedWeight: cappedWeight,
  adaptationStatus,
  confidenceLevel,
  warningMessage: buildWarningMessage(
    exercise.name, prescribedWeight, substituteExercise.name,
    dbEquiv, equipment.maxDumbbellWeight, adaptationStatus, isBothHands
  ),
  alternatives,
};
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/autoAdapt.test.ts`
Expected: ALL tests pass (new + existing). Some existing tests for "exceeds" / "borderline" may need updating since the function now auto-selects fallbacks — check and adjust expected values.

**Step 5: Commit**

```bash
git add src/lib/autoAdapt.ts src/lib/autoAdapt.test.ts
git commit -m "feat: implement fallback chain logic in adaptExerciseForHome"
```

---

### Task 4: Fix NextWorkoutCard Weight Display

**Files:**
- Modify: `src/components/Dashboard/NextWorkoutCard.tsx`

**Step 1: Add imports and load equipment profile**

Add imports at top:
```typescript
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import type { EquipmentProfile } from "@/types";
```

Add inside the component, after the `activePain` query:
```typescript
const userProfile = useLiveQuery(() => db.userProfile.toCollection().first());
const equipment: EquipmentProfile | undefined = userProfile?.settings?.equipment;
```

**Step 2: Compute adapted exercises for home display**

Add after `t2Info` (around line 66):

```typescript
// Compute home adaptations for weight display
const t1Adaptation = (() => {
  if (location !== "home" || !t1Info || !t1State || !equipment) return null;
  const sub = t1Info.dumbbellAlternative ? EXERCISES[t1Info.dumbbellAlternative] : undefined;
  return adaptExerciseForHome(t1Info, t1State.t1Weight, equipment, sub);
})();

const t2Adaptation = (() => {
  if (location !== "home" || !t2Info || !t2State || !equipment) return null;
  const sub = t2Info.dumbbellAlternative ? EXERCISES[t2Info.dumbbellAlternative] : undefined;
  return adaptExerciseForHome(t2Info, t2State.t2Weight, equipment, sub);
})();
```

**Step 3: Update T1 weight display (lines 109-116)**

Replace the T1 weight display block:
```typescript
<div className="text-right">
  <p className="text-sm font-bold text-foreground font-mono">
    {location === "home" && t1Adaptation
      ? t1Adaptation.adaptedWeight
      : t1State?.t1Weight ?? "—"}{" "}
    lbs
    {location === "home" &&
      t1Adaptation?.adaptedExercise.grip === "per_hand" &&
      "/hand"}
  </p>
  <p className="text-xs text-muted-foreground font-mono">
    {t1State?.t1Stage ?? "5x3"}
  </p>
  {location === "home" &&
    t1Adaptation?.adaptationStatus === "exceeds" && (
      <p className="text-xs text-yellow-400">capped</p>
    )}
</div>
```

**Step 4: Update T1 exercise name display (lines 103-107)**

Replace to use the adapted exercise name:
```typescript
<p className="text-sm font-medium text-foreground">
  {location === "home" && t1Adaptation
    ? t1Adaptation.adaptedExercise.name
    : t1Info.name}
</p>
```

**Step 5: Update T2 weight display (lines 132-139) — same pattern**

Replace the T2 weight display block:
```typescript
<div className="text-right">
  <p className="text-sm font-bold text-foreground font-mono">
    {location === "home" && t2Adaptation
      ? t2Adaptation.adaptedWeight
      : t2State?.t2Weight ?? "—"}{" "}
    lbs
    {location === "home" &&
      t2Adaptation?.adaptedExercise.grip === "per_hand" &&
      "/hand"}
  </p>
  <p className="text-xs text-muted-foreground font-mono">
    {t2State?.t2Stage ?? "3x10"}
  </p>
  {location === "home" &&
    t2Adaptation?.adaptationStatus === "exceeds" && (
      <p className="text-xs text-yellow-400">capped</p>
    )}
</div>
```

**Step 6: Update T2 exercise name display (lines 126-130)**

```typescript
<p className="text-sm font-medium text-foreground">
  {location === "home" && t2Adaptation
    ? t2Adaptation.adaptedExercise.name
    : t2Info.name}
</p>
```

**Step 7: Run tests and verify build**

Run: `npx vitest run && npx next build`
Expected: Tests pass, build succeeds.

**Step 8: Commit**

```bash
git add src/components/Dashboard/NextWorkoutCard.tsx
git commit -m "fix: display converted dumbbell weights on dashboard home view"
```

---

### Task 5: Add Alternative Picker to Configure Page

**Files:**
- Modify: `src/app/workout/configure/page.tsx`

**Step 1: Add state for user-selected overrides**

Add near other `useState` declarations:
```typescript
const [exerciseOverrides, setExerciseOverrides] = useState<Record<string, string>>({});
```

**Step 2: Apply overrides to exerciseAdaptations**

After the `exerciseAdaptations` memo (around line 321), add a memo that applies user overrides:

```typescript
const effectiveAdaptations = useMemo(() => {
  return exerciseAdaptations.map((ea) => {
    if (!ea?.adaptation || ea.adaptation.alternatives.length === 0) return ea;

    const overrideId = exerciseOverrides[ea.templateExercise.exerciseId];
    if (!overrideId) return ea;

    const selectedAlt = ea.adaptation.alternatives.find(
      (alt) => alt.exercise.id === overrideId
    );
    if (!selectedAlt) return ea;

    return {
      ...ea,
      adaptation: {
        ...ea.adaptation,
        adaptedExercise: selectedAlt.exercise,
        adaptedWeight: selectedAlt.weight,
        adaptationStatus: selectedAlt.weight <= (equipment.maxDumbbellWeight)
          ? 'fits' as const
          : 'exceeds' as const,
      },
    };
  });
}, [exerciseAdaptations, exerciseOverrides, equipment]);
```

Update references from `exerciseAdaptations` to `effectiveAdaptations` in the JSX render and `warmUpSetsMap`.

**Step 3: Add alternative picker UI in the adaptation display**

In the adaptation section of the exercise list (around lines 594-619), after the status badges, add:

```typescript
{/* Alternative picker */}
{adaptation.alternatives.length > 1 && (
  <div className="mt-2 space-y-1">
    <p className="text-xs text-muted-foreground">Alternatives:</p>
    {adaptation.alternatives.map((alt) => (
      <button
        key={alt.exercise.id}
        className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-all ${
          adaptation.adaptedExercise.id === alt.exercise.id
            ? "border-foreground/40 bg-foreground/5"
            : "border-border hover:border-foreground/20"
        }`}
        onClick={() =>
          setExerciseOverrides((prev) => ({
            ...prev,
            [templateExercise.exerciseId]: alt.exercise.id,
          }))
        }
      >
        <span className="font-medium">{alt.exercise.name}</span>{" "}
        @ {alt.weight} {alt.exercise.grip === "per_hand" ? "lbs/hand" : "lbs"}
        {alt.pros && (
          <span className="text-muted-foreground ml-1">— {alt.pros}</span>
        )}
      </button>
    ))}
  </div>
)}
```

**Step 4: Run build and verify**

Run: `npx vitest run && npx next build`
Expected: Tests pass, build succeeds.

**Step 5: Verify in browser with Playwright**

Navigate to configure page, toggle location to home, verify:
- Adapted weights display correctly
- Alternative picker appears for exercises where primary exceeds max
- Tapping an alternative updates the displayed exercise and weight

**Step 6: Commit**

```bash
git add src/app/workout/configure/page.tsx
git commit -m "feat: add alternative exercise picker on configure page for home workouts"
```

---

### Task 6: Update getConfidenceLevel for New Exercises

**Files:**
- Modify: `src/lib/autoAdapt.ts` (getConfidenceLevel function)
- Test: `src/lib/autoAdapt.test.ts`

**Step 1: Write failing tests**

```typescript
it('returns "medium" for bulgarian_split_squat', () => {
  expect(getConfidenceLevel('bulgarian_split_squat', 'fits')).toBe('medium');
});

it('returns "medium" for db_lunge', () => {
  expect(getConfidenceLevel('db_lunge', 'fits')).toBe('medium');
});

it('returns "high" for db_floor_press', () => {
  expect(getConfidenceLevel('db_floor_press', 'fits')).toBe('high');
});

it('returns "high" for db_arnold_press', () => {
  expect(getConfidenceLevel('db_arnold_press', 'fits')).toBe('high');
});

it('returns "medium" for single_leg_db_rdl', () => {
  expect(getConfidenceLevel('single_leg_db_rdl', 'fits')).toBe('medium');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/autoAdapt.test.ts`
Expected: `db_floor_press` and `db_arnold_press` tests FAIL (not in highConfidence list).

**Step 3: Update getConfidenceLevel**

```typescript
const highConfidence = ['db_bench', 'db_row', 'db_shoulder_press', 'db_floor_press', 'db_arnold_press'];
const mediumConfidence = ['goblet_squat', 'bulgarian_split_squat', 'db_rdl', 'db_lunge', 'single_leg_db_rdl'];
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/autoAdapt.test.ts`
Expected: ALL pass.

**Step 5: Commit**

```bash
git add src/lib/autoAdapt.ts src/lib/autoAdapt.test.ts
git commit -m "feat: update confidence levels for new fallback exercises"
```

---

### Task 7: Run Full Test Suite and Final Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Build check**

Run: `npx next build`
Expected: Build succeeds with no errors.

**Step 3: Browser verification with Playwright**

1. Navigate to dashboard (home page)
2. Toggle location to "Home"
3. Verify T1/T2 show converted dumbbell weights with "/hand" suffix where applicable
4. Verify exercises that exceed max show fallback exercise name (e.g., "Bulgarian Split Squat" instead of "Goblet Squat")
5. Navigate to configure page
6. Toggle to home
7. Verify alternative picker appears for exercises where primary exceeds max
8. Tap between alternatives, verify weight and exercise name update

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for home exercise fallback system"
```
