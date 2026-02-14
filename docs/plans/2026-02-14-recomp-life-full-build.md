# ReComp Life — Full Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first GZCLP workout tracker PWA with intelligent autoregulation, offline-first data, and cross-platform support via Capacitor.

**Architecture:** Next.js 14+ App Router with Dexie.js (IndexedDB) for offline-first local storage, Neon Postgres + Drizzle ORM for cloud sync, Zustand for transient UI state only. All GZCLP logic lives as pure functions in `src/lib/` with full test coverage. Capacitor wraps the same codebase for native iOS/Android.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, Dexie.js, Neon Postgres, Drizzle ORM, Auth.js, Capacitor, Recharts, Vitest, React Testing Library

---

## Dependency Graph

```
Phase 0: Foundation
  ├── 0A: Project scaffolding + tooling
  ├── 0B: Type definitions (all interfaces)
  └── 0C: Dexie.js local database setup
        │
Phase 1: Core Logic (all parallelizable, depends on 0B + 0C)
  ├── 1A: Progression engine (T1/T2/T3 + failure cascade)
  ├── 1B: Exercise registry + workout templates
  ├── 1C: Auto-adapt engine (DB ↔ barbell conversion)
  ├── 1D: Recovery tracking logic
  ├── 1E: e1RM calculation
  └── 1F: Warm-up generation
        │
Phase 2: Core UI (depends on Phase 1)
  ├── 2A: Dashboard (depends on 1B, 1D, 1E)
  ├── 2B: Pre-workout configuration flow (depends on 1B, 1C)
  ├── 2C: Active workout screen (depends on 1A, 1B, 1F)
  ├── 2D: Workout summary + history (depends on 1A, 1E)
  └── 2E: Settings + equipment profile (depends on 0B)
        │
Phase 3: Timers + Audio (parallelizable with Phase 2)
  ├── 3A: Web Worker timer engine
  └── 3B: Audio/haptics integration
        │
Phase 4: Advanced Features (depends on Phase 2)
  ├── 4A: Pain & soreness system (body map UI + modification logic)
  ├── 4B: Running & concurrent training
  ├── 4C: Accessories + volume ratio monitor
  └── 4D: T2 autoregulatory load drops (RPE-driven)
        │
Phase 5: Intelligence Layer (depends on Phase 4)
  ├── 5A: Fitness-fatigue deload triggers
  ├── 5B: Inactivity & consistency tracking
  ├── 5C: Weekly volume tracker + analytics
  └── 5D: RPE/e1RM trend charts + PR detection
        │
Phase 6: Backend + Sync (parallelizable with Phases 4-5)
  ├── 6A: Neon Postgres + Drizzle schema
  ├── 6B: Auth.js (Apple + Google sign-in)
  ├── 6C: Sync logic (push/pull/dedup)
  └── 6D: API routes
        │
Phase 7: Native + HealthKit (depends on Phase 6)
  ├── 7A: Capacitor wrapper for iOS
  ├── 7B: HealthKit read integration
  └── 7C: HealthKit write-back
        │
Phase 8: Tools + Polish (depends on Phase 2, parallelizable with 4-7)
  ├── 8A: Plate calculator
  ├── 8B: DB ↔ barbell converter tool
  ├── 8C: Data export/import
  ├── 8D: Bodyweight trend + rate-of-loss visualization
  ├── 8E: Training phase selector UI
  └── 8F: Manual nutrition/supplement toggles
```

---

## Phase 0: Foundation

**Goal:** Scaffold the project with all tooling, types, and local database ready for feature development. Every subsequent phase depends on this.

---

### Task 0A: Project Scaffolding + Tooling

**Files:**
- Modify: `package.json`
- Modify: `tailwind.config.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `vitest.config.ts`

**Step 1: Install core dependencies**

Run:
```bash
cd /Users/michaelboyce/Documents/Programming/recomp-life
npm install dexie uuid recharts zustand
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/uuid
```

**Step 2: Install and initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init -d
```

Follow prompts: style=default, baseColor=neutral, css variables=yes.

Then install commonly needed components:
```bash
npx shadcn@latest add button card dialog sheet tabs toggle switch slider badge alert progress separator
```

**Step 3: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Configure dark mode as default**

Update `src/app/layout.tsx` — add `className="dark"` to the `<html>` tag. Update `src/app/globals.css` to ensure dark theme CSS variables are set.

**Step 5: Run verification**

```bash
npm run build
npx vitest run
```
Expected: Build succeeds, vitest finds 0 tests (no test files yet).

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with shadcn/ui, vitest, dexie, zustand"
```

---

### Task 0B: Type Definitions

**Files:**
- Create: `src/types/index.ts`

**Step 1: Write all TypeScript interfaces**

Create `src/types/index.ts` with every interface from the spec:
- `UserProfile`, `UserSettings`, `TrainingPhase`, `EquipmentProfile`
- `Exercise`, `BodyRegion` (union type), `SensationType`
- `LiftState` (including v3.2 deload/autoregulation fields)
- `WorkoutSession`, `WorkoutModification`, `SetLog`
- `RunLog` (with `category` field)
- `BodyweightLog`, `ReadinessLog`
- `PainSorenessEntry`
- `Estimated1RM`
- `WeeklyVolumeSummary`
- `RecoveryState`, `RecoveryStatus`
- `ExerciseAdaptation`, `AdaptationOption`, `AdaptationStatus`
- `WarmUpSet`
- `VolumeRatioCheck`
- `FatigueSignal`, `FatigueAlert`, `DeloadWeek`
- `InactivityAlert`
- `T2AutoRegResult`
- `WorkoutTemplate` (for A1/B1/A2/B2 definitions)

All types from §1.1 through §1.9 of the spec plus supporting types from §2, §3, §5, §6, §7, §8.

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add all TypeScript type definitions from v3.2 spec"
```

---

### Task 0C: Dexie.js Local Database Setup

**Files:**
- Create: `src/db/local.ts`
- Create: `src/db/seed.ts`

**Depends on:** 0B (needs type definitions)

**Step 1: Create Dexie database class**

Create `src/db/local.ts`:
```typescript
import Dexie, { type Table } from 'dexie';
import type {
  WorkoutSession, SetLog, RunLog, BodyweightLog,
  PainSorenessEntry, Estimated1RM, LiftState, UserProfile, ReadinessLog
} from '@/types';

export class RecompDatabase extends Dexie {
  workouts!: Table<WorkoutSession>;
  sets!: Table<SetLog>;
  runs!: Table<RunLog>;
  bodyweight!: Table<BodyweightLog>;
  painEntries!: Table<PainSorenessEntry>;
  estimated1RMs!: Table<Estimated1RM>;
  liftStates!: Table<LiftState>;
  userProfile!: Table<UserProfile>;
  readinessLogs!: Table<ReadinessLog>;

  constructor() {
    super('recomp-life');
    this.version(1).stores({
      workouts: 'id, clientId, startedAt, templateId, synced',
      sets: 'id, clientId, exerciseId, completedAt, synced',
      runs: 'id, clientId, date, synced',
      bodyweight: 'id, clientId, date, synced',
      painEntries: 'id, date, region',
      estimated1RMs: 'id, exerciseId, date',
      liftStates: 'exerciseId',
      userProfile: 'id',
      readinessLogs: 'id, sessionId, date',
    });
  }
}

export const db = new RecompDatabase();
```

**Step 2: Create seed data**

Create `src/db/seed.ts` with `INITIAL_LIFT_STATES` and `DEFAULT_USER_PROFILE` from §17 of the spec. Include the full `UserProfile` with `TrainingPhase` set to cutting mode and the complete `EquipmentProfile`.

**Step 3: Verify module resolution**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/db/
git commit -m "feat: add Dexie.js local database with seed data"
```

---

## Phase 1: Core Logic

**Goal:** Implement all business logic as pure, tested functions. No React code in this phase — everything in `src/lib/`. These tasks are **fully parallelizable** since they have no inter-dependencies (they all just import from `src/types/`).

**Agent assignment:** Up to 6 agents can work on 1A-1F simultaneously.

---

### Task 1A: Progression Engine

**Files:**
- Create: `src/lib/progression.ts`
- Create: `src/lib/progression.test.ts`

**Depends on:** 0B

**This is the most critical module in the app.** The GZCLP failure cascade, phase-adjusted behavior, and freeze logic all live here.

**Step 1: Write failing tests for T1 progression**

Test cases from §16.1:
- `passes 5x3 → weight increases by configured increment`
- `gym with 2.5 lb plates: upper body increments by 2.5`
- `gym with 5 lb plates: upper body increments by 5`
- `home: always increments barbell-equivalent by 5 (DB step size)`
- `fails 5x3 → moves to 6x2 at same weight`
- `fails 6x2 → moves to 10x1 at same weight`
- `fails 10x1 → resets to 85%, returns to 5x3`
- `pain-modified session does NOT trigger failure cascade`
- `run-fatigue-reduced session does NOT trigger failure cascade`
- `equipment-limited skip does NOT trigger failure cascade`
- `completed DB-adapted workout counts as pass`

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/progression.test.ts
```

**Step 3: Implement T1 progression**

Implement `evaluateT1Progression()` per §5.2 of the spec. Must accept `EquipmentProfile` and `location` parameters to determine increment size.

Key function: `getIncrement(lift, location, equipment)` per §2.8.

**Step 4: Run tests to verify they pass**

**Step 5: Write failing tests for T2 progression**

Including v3.2 autoregulatory behavior:
- Standard T2 cascade (3x10 → 3x8 → 3x6 → reset)
- `autoregulated_load_drop` status counts as pass but freezes

**Step 6: Implement T2 progression per §5.3**

**Step 7: Write failing tests for T3 progression (v3.2 CRITICAL FIX)**

From §16.1:
- `3×15 (45 total reps) does NOT trigger weight increase`
- `last set AMRAP ≥ 25 → weight increases`
- `total reps ≥ 50 → weight increases`
- `cutting mode: only AMRAP trigger counts`
- `maintaining/bulking: either trigger works`

**Step 8: Implement T3 progression per §5.4**

**Step 9: Write failing tests for T2 autoregulatory load drop evaluation**

From §16.1:
- `RPE 9.0 on T2 Set 1 in cutting → suggests 5% drop`
- `RPE 10 on T2 Set 1 in cutting → suggests 10% drop`
- `RPE 9.0 in bulking → no suggestion (threshold is 10)`
- `RPE not logged → no intervention`
- Various acceptance/decline outcomes

**Step 10: Implement `evaluateT2AutoRegulation()` per §5.3.1**

**Step 11: Run full test suite**

```bash
npx vitest run src/lib/progression.test.ts
```
Expected: All tests pass.

**Step 12: Commit**

```bash
git add src/lib/progression.ts src/lib/progression.test.ts
git commit -m "feat: implement GZCLP progression engine with full test coverage"
```

---

### Task 1B: Exercise Registry + Workout Templates

**Files:**
- Create: `src/lib/exercises.ts`
- Create: `src/lib/workoutTemplates.ts`
- Create: `src/lib/exercises.test.ts`

**Depends on:** 0B

**Step 1: Create exercise registry**

Define all exercises from §1.2 and the accessory library (§4.3). Each exercise needs:
- Unique ID, name, type, muscleGroup
- `requiresGym` flag
- `dumbbellAlternative` / `barbellEquivalent` links
- `primaryMuscles` / `secondaryMuscles` arrays for volume tracking
- `painSensitiveRegions` array

Include: Squat, Bench, Deadlift, OHP, Lat Pulldown, DB Row, Goblet Squat, Bulgarian Split Squat, DB RDL, DB Bench, DB Shoulder Press, and all accessories from §4.3.

**Step 2: Create workout templates**

Define A1, B1, A2, B2 templates per §5.1 table. Each template specifies T1 exercise + scheme, T2 exercise + scheme, T3 exercise + scheme.

**Step 3: Create accessory recommendation map**

Per §4.2: map each workout day to its recommended accessories.

**Step 4: Write tests**

- Verify all exercises have required fields
- Verify substitution links are bidirectional
- Verify templates reference valid exercise IDs
- Verify muscle group mappings are complete

**Step 5: Run tests, verify pass**

**Step 6: Commit**

```bash
git add src/lib/exercises.ts src/lib/workoutTemplates.ts src/lib/exercises.test.ts
git commit -m "feat: add exercise registry, workout templates, and accessory map"
```

---

### Task 1C: Auto-Adapt Engine

**Files:**
- Create: `src/lib/autoAdapt.ts`
- Create: `src/lib/autoAdapt.test.ts`
- Create: `src/lib/dbConversion.ts`
- Create: `src/lib/dbConversion.test.ts`

**Depends on:** 0B

**Step 1: Implement DB ↔ barbell conversion functions**

Per §2.3:
- `barbellToDumbbell(barbellWeight)` — 80% rule, round each DB to nearest 5
- `dumbbellToBarbell(dumbbellPerHand)` — 120% inverse

**Step 2: Write conversion tests**

- `145 lb barbell bench → 60 lb DB per hand`
- `220 lb barbell deadlift → 90 lb DB per hand (exceeds 80)`
- Round-trip accuracy tests

**Step 3: Implement auto-adapt engine**

Per §2.5: `adaptExerciseForHome(exercise, prescribedWeight, equipment)` returns `ExerciseAdaptation` with:
- Status: "fits" / "borderline" / "exceeds" / "no_substitute"
- Confidence label: "high" / "medium" / "low" (per §12.2 Step 3)
- Warning messages
- Alternative options

**Step 4: Write auto-adapt tests**

From §16.1:
- Fits within DB range → correct substitution + weight
- Borderline (within 10 lbs of max) → warning + alternatives
- Exceeds max → skip recommendation + alternatives
- Respects configurable `maxDumbbellWeight`
- Confidence labels: DB bench = high, goblet squat = medium, heavy DL alternative = low

**Step 5: Run tests, verify pass**

**Step 6: Commit**

```bash
git add src/lib/autoAdapt.ts src/lib/autoAdapt.test.ts src/lib/dbConversion.ts src/lib/dbConversion.test.ts
git commit -m "feat: implement auto-adapt engine for home workouts with confidence labels"
```

---

### Task 1D: Recovery Tracking Logic

**Files:**
- Create: `src/lib/recovery.ts`
- Create: `src/lib/recovery.test.ts`

**Depends on:** 0B

**Step 1: Write failing tests**

From §16.1 and §8.2:
- `lift trained <48h ago → status "recovering"`
- `lift trained 48-96h ago → status "ready" or "primed"`
- `lift not trained in 7+ days → status "detraining"`
- `lift not trained in 14+ days → triggers ramp-up suggestion`
- `run on rest day extends lower body recovery estimate`
- Cutting phase adds +12h to lower body recovery window (§5.7)

**Step 2: Implement `calculateRecoveryStatus()`**

Per §8.2: takes last T1/T2 dates for a lift, training phase, and recent runs → returns `RecoveryState`.

**Step 3: Implement `generateRampUpSuggestion()`**

Per §8.6: when lift hasn't been trained 14+ days, suggest 85% working weight for one session.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add src/lib/recovery.ts src/lib/recovery.test.ts
git commit -m "feat: implement per-lift recovery tracking with phase-aware windows"
```

---

### Task 1E: Estimated 1RM Calculation

**Files:**
- Create: `src/lib/e1rm.ts`
- Create: `src/lib/e1rm.test.ts`

**Depends on:** 0B

**Step 1: Write failing tests**

- `155 × 7 reps → e1RM = 191 (Epley)`
- `e1RM not calculated for AMRAP < 2 reps`
- `e1RM correctly rounds`
- PR detection: new e1RM > previous max

**Step 2: Implement Epley formula**

```typescript
function calculateE1RM(weight: number, reps: number): number | null
```

Per §5.5: `e1RM = weight × (1 + reps / 30)`. Return null if reps < 2.

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add src/lib/e1rm.ts src/lib/e1rm.test.ts
git commit -m "feat: implement estimated 1RM calculation with Epley formula"
```

---

### Task 1F: Warm-Up Generation

**Files:**
- Create: `src/lib/warmups.ts`
- Create: `src/lib/warmups.test.ts`

**Depends on:** 0B

**Step 1: Write failing tests**

- Gym warm-ups for working weight > 95 lbs: 4 sets (bar, 50%, 70%, 85%)
- Gym warm-ups for working weight ≤ 95 lbs: 2 sets (bar, 70%)
- Home warm-ups: 2 sets (40%, 70% of DB equivalent)
- All weights round to nearest 5

**Step 2: Implement `generateWarmUpSets()` per §3.2**

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add src/lib/warmups.ts src/lib/warmups.test.ts
git commit -m "feat: implement warm-up set generation for gym and home"
```

---

## Phase 2: Core UI

**Goal:** Build the main screens users interact with. These depend on Phase 1 logic modules but are themselves **mostly parallelizable** (each screen is independent).

**Agent assignment:** Up to 5 agents on 2A-2E simultaneously.

---

### Task 2A: Dashboard

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/Dashboard/WeightTrend.tsx`
- Create: `src/components/Dashboard/NextWorkoutCard.tsx`
- Create: `src/components/Dashboard/RecoveryStatusBars.tsx`
- Create: `src/components/Dashboard/WeekSummary.tsx`
- Create: `src/components/Dashboard/E1RMSummary.tsx`
- Create: `src/components/Dashboard/ActivePainBanner.tsx`
- Create: `src/components/Dashboard/GymDebtBanner.tsx`
- Create: `src/components/Dashboard/VolumeSnippet.tsx`

**Depends on:** 1B (templates), 1D (recovery), 1E (e1RM)

**Step 1: Build layout**

Implement the Dashboard per §12.1: greeting, bodyweight display, pain banner, recovery bars, week summary, volume snippet, next workout card with location toggle, e1RM summary, last workout recap.

Use shadcn/ui Card components. Mobile-first layout.

**Step 2: Wire data from Dexie**

Use Dexie's `useLiveQuery` hook to reactively read from local DB:
- Latest bodyweight entry
- Active pain entries
- Recent workouts for recovery calculation
- Current lift states for e1RM display
- This week's workout count

**Step 3: Implement location toggle + "Start Workout" button**

Location toggle stores selection in session state (Zustand or local). Start button navigates to `/workout/configure`.

**Step 4: "Log a Run" and "Body Check" action buttons**

Navigate to `/run` and `/body-check` respectively.

**Step 5: Verify in browser**

```bash
npm run dev
```
Open `http://localhost:3000`, verify dark mode, layout matches spec.

**Step 6: Commit**

```bash
git add src/app/page.tsx src/components/Dashboard/
git commit -m "feat: implement dashboard with recovery bars, e1RM summary, and workout card"
```

---

### Task 2B: Pre-Workout Configuration Flow

**Files:**
- Create: `src/app/workout/configure/page.tsx`
- Create: `src/components/PreWorkout/LocationToggle.tsx`
- Create: `src/components/PreWorkout/WarmUpToggle.tsx`
- Create: `src/components/PreWorkout/ReadinessCheck.tsx`
- Create: `src/components/PreWorkout/TechniqueChecklist.tsx`
- Create: `src/components/PreWorkout/AutoAdaptEngine.tsx`
- Create: `src/components/PreWorkout/ModificationSuggestions.tsx`
- Create: `src/components/PreWorkout/AccessoryPicker.tsx`
- Create: `src/components/PreWorkout/TimeEstimate.tsx`

**Depends on:** 1B (templates), 1C (auto-adapt)

Implement the multi-step pre-workout flow per §12.2:
1. **Step 1:** Location + warm-up toggle
2. **Step 1.5:** Readiness check (3 taps: sleep, stress) — skippable
3. **Step 1.75:** Technique checklist (squat/DL days only) — skippable
4. **Step 2:** Body check (placeholder — full implementation in Phase 4)
5. **Step 3:** Adaptations (if home), modifications (if pain), accessories

The AccessoryPicker should show volume-aware recommendations per §4.2 and respect phase-adjusted caps (cutting: max 2 recommended).

"Start Workout" button creates a `WorkoutSession` in Dexie and navigates to `/workout/active`.

**Commit after complete.**

---

### Task 2C: Active Workout Screen

**Files:**
- Create: `src/app/workout/active/page.tsx`
- Create: `src/components/ActiveWorkout/WorkoutHeader.tsx`
- Create: `src/components/ActiveWorkout/ExerciseBlock.tsx`
- Create: `src/components/ActiveWorkout/SetLogger.tsx`
- Create: `src/components/ActiveWorkout/RPESelector.tsx`
- Create: `src/components/ActiveWorkout/RestTimer.tsx` (placeholder — full timer in Phase 3)
- Create: `src/components/ActiveWorkout/CompletedSets.tsx`
- Create: `src/components/ActiveWorkout/UpNext.tsx`
- Create: `src/components/ActiveWorkout/AMRAPIndicator.tsx`
- Create: `src/components/ActiveWorkout/WarmUpSet.tsx`
- Create: `src/stores/workoutStore.ts`

**Depends on:** 1A (progression), 1B (templates), 1F (warm-ups)

Implement the active workout screen per §12.3:
- Overall timer in header (counting UP)
- Current exercise block with set/rep target
- Rep button grid (1-9+)
- Optional RPE selector (6-10 with half-steps)
- "Log Set" button → writes to Dexie, starts rest timer
- Completed sets list below
- "Up Next" preview of remaining exercises
- AMRAP indicator on last T1 set with phase-adjusted RPE guidance banner (§5.2.1)
- Warm-up sets displayed before T1 (visually distinct)
- T2 auto-regulation banner after Set 1 RPE logging (§5.3.1)

Use Zustand `workoutStore` for transient active workout state (current exercise index, current set, timer state). Persist completed sets to Dexie immediately.

On workout completion, evaluate progression for each lift (call `src/lib/progression.ts`) and update `liftStates` in Dexie. Navigate to `/workout/summary`.

**Commit after complete.**

---

### Task 2D: Workout Summary + History

**Files:**
- Create: `src/app/workout/summary/page.tsx`
- Create: `src/app/history/page.tsx`
- Create: `src/components/WorkoutSummary/LiftResult.tsx`
- Create: `src/components/WorkoutSummary/PainModifiedResult.tsx`
- Create: `src/components/WorkoutSummary/EquipmentAdaptedResult.tsx`
- Create: `src/components/WorkoutSummary/PostWorkoutBodyCheck.tsx`

**Depends on:** 1A (progression), 1E (e1RM)

**Workout Summary (§12.4):**
- Per-lift results: pass/fail, next weight, AMRAP reps, e1RM delta, avg RPE
- Pain-modified results with "weight held" messaging
- Equipment-adapted results with barbell equivalent display
- Post-workout body check prompt
- "Next workout" preview with warnings

**History (§12.6):**
- Chronological list of workouts + runs
- Filter tabs: All / Gym / Home / Runs
- Status icons at a glance: ✅ pass / 🔄 freeze / ❌ fail / ⛔ skip
- Freeze reason shown (pain / run / equipment / autoregulated / deload)
- Tap to expand full set-by-set detail
- Deload sessions visually distinct

**Commit after complete.**

---

### Task 2E: Settings + Equipment Profile

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/components/Equipment/EquipmentProfileEditor.tsx`

**Depends on:** 0B

Implement settings page per §1.1 with:
- Theme toggle (dark/light)
- Timer audio/vibration toggles
- Show warm-ups default toggle
- Show RPE default toggle
- Morning weigh-in reminder toggle + time picker
- Training phase selector (cutting / maintaining / bulking) with explanation text on switch (§5.7)
- Equipment profile editor per §1.1 UI mockup:
  - Home: max DB weight (±5 lb steps), bench/bands/pullup-bar toggles
  - Gym: smallest plate (2.5 or 5), barbell weight (45 or 35)

All settings persist to Dexie `userProfile` table.

**Commit after complete.**

---

## Phase 3: Timers + Audio

**Goal:** Implement accurate background timers with audio/haptic feedback. Can run **in parallel** with Phase 2 UI work.

---

### Task 3A: Web Worker Timer Engine

**Files:**
- Create: `src/lib/timerWorker.ts`
- Create: `public/workers/timer.js`
- Modify: `src/components/ActiveWorkout/RestTimer.tsx`

**Depends on:** None (can start during Phase 2)

**Step 1: Create Web Worker for background timer accuracy**

The timer must remain accurate when the phone screen locks or app backgrounds. Use a Web Worker that sends tick messages back to the main thread.

**Step 2: Implement rest countdown timer**

Per §13.2:
- Auto-starts when a set is logged
- Counts DOWN from configurable defaults (T1: 180s, T2: 120s, T3: 60s, etc.)
- Phase adjustment: cutting mode adds +30s to T1/T2 defaults
- At 0:00: trigger vibration + audio chime
- Continues counting UP past 0:00 (shows overtime)
- "+30s" and "Skip Rest" buttons

**Step 3: Implement Screen Wake Lock**

Use `navigator.wakeLock.request('screen')` during active workouts.

**Step 4: Implement background notification fallback**

If fully backgrounded, use Notification API to alert when rest is done.

**Commit after complete.**

---

### Task 3B: Audio + Haptics

**Files:**
- Create: `public/sounds/timer-chime.mp3` (or use Web Audio API synthesis)
- Modify: `src/components/ActiveWorkout/RestTimer.tsx`

**Depends on:** 3A

Use Web Audio API to generate a clean chime sound. Use `navigator.vibrate()` for haptic feedback. Both controlled by user settings (`restTimerAudio`, `restTimerVibration`).

**Commit after complete.**

---

## Phase 4: Advanced Features

**Goal:** Add pain tracking, running, accessories, and autoregulation. These are **mostly parallelizable** — each feature area is independent.

**Agent assignment:** Up to 4 agents on 4A-4D simultaneously.

---

### Task 4A: Pain & Soreness System

**Files:**
- Create: `src/app/body-check/page.tsx`
- Create: `src/components/BodyMap/BodyMapSVG.tsx`
- Create: `src/components/BodyMap/RegionDetail.tsx`
- Create: `src/components/BodyMap/PainHistory.tsx`
- Create: `src/lib/painModifications.ts`
- Create: `src/lib/painModifications.test.ts`

**Depends on:** Phase 2 (needs to integrate into pre-workout + active workout flows)

**Logic (`painModifications.ts`):**
- `generateModifications(painEntries, exercises)` → `WorkoutModification[]`
- Severity-based response per §6.3 table
- Lower back specific guidance per §6.4 table
- Red flag warning trigger per §6.3.1 (severity 4+ first time, severity 5 always)
- Soreness entries generate ZERO modifications (§6.5)
- Pain-modified sets freeze progression

**UI:**
- Tappable body map SVG with color coding (yellow = soreness, red = pain)
- Region detail modal: sensation type, severity 1-5, notes
- Pain history per region
- "Auto-clear" prompt for entries > 7 days old
- Red flag medical screen (one-time per region per 30 days)
- Integrate into pre-workout Step 2 and mid-workout pain log

**Tests:** All cases from §16.1 Pain Modifications and Red Flag Warning sections.

**Commit after complete.**

---

### Task 4B: Running & Concurrent Training

**Files:**
- Create: `src/app/run/page.tsx`
- Create: `src/components/RunLogger.tsx`
- Create: `src/lib/runRecovery.ts`
- Create: `src/lib/runRecovery.test.ts`

**Depends on:** Phase 2 (needs dashboard integration)

**Logic (`runRecovery.ts`):**
- `evaluateRunImpact(recentRuns, nextWorkout, phase)` → advisory message
- Category-refined thresholds per §7.2: intervals/tempo lower the trigger threshold, easy raises it
- Cutting phase: glycogen depletion note for long runs (45+ min)

**UI:**
- Run logging form: duration, distance (optional), type (outdoor/treadmill/trail), category (easy/tempo/intervals/long), effort 1-5, notes
- Run entries appear in History with distinct icon
- Pre-workout run fatigue warning integrates into the configure flow
- `reduced_run_fatigue` freeze logic

**Tests:** All cases from §16.1 Run Recovery and Run Category Tags sections.

**Commit after complete.**

---

### Task 4C: Accessories + Volume Ratio Monitor

**Files:**
- Create: `src/lib/accessories.ts`
- Create: `src/lib/accessories.test.ts`
- Create: `src/lib/volumeRatio.ts`
- Create: `src/lib/volumeRatio.test.ts`
- Modify: `src/components/PreWorkout/AccessoryPicker.tsx`

**Depends on:** 2B (pre-workout flow)

**Accessory Logic (`accessories.ts`):**
- Accessory progression: double progression (§4.4)
- Phase-adjusted caps (cutting: 2, maintaining: 3, bulking: 4+)
- Location-aware substitutions (cable → DB at home)

**Volume Ratio Logic (`volumeRatio.ts`):**
- `calculateSessionVolumeRatio(t1Reps, t2Reps, t3Reps, accessoryReps, phase)` per §5.9.1
- Returns status + ratio string + warning message when T3:T1 ratio exceeds phase limits
- Real-time check as user selects accessories in picker

**Tests:** All cases from §16.1 Volume Ratio Monitor section.

**Commit after complete.**

---

### Task 4D: T2 Autoregulatory Load Drops (RPE-Driven)

**Files:**
- Modify: `src/components/ActiveWorkout/ExerciseBlock.tsx`
- Create: `src/components/ActiveWorkout/AutoRegBanner.tsx`
- Modify: `src/lib/progression.ts` (add `evaluateT2AutoRegulation`)

**Depends on:** 2C (active workout screen)

**Logic:** Already implemented in 1A tests — this task wires it into the UI.

**UI behavior per §5.3.1:**
- After logging T2 Set 1 reps + RPE, check threshold
- If RPE ≥ phase threshold → show banner with suggested weight drop
- "Accept Drop" → update remaining sets' target weight, log as `autoregulated_load_drop`
- "Keep Weight" → continue normally
- Banner shows rationale (preserving volume, preventing form breakdown)

**Commit after complete.**

---

## Phase 5: Intelligence Layer

**Goal:** Analytics, fatigue detection, and proactive coaching. Depends on Phase 4 for complete workout data.

**Agent assignment:** Up to 4 agents on 5A-5D simultaneously.

---

### Task 5A: Fitness-Fatigue Deload Triggers

**Files:**
- Create: `src/lib/fatigue.ts`
- Create: `src/lib/fatigue.test.ts`
- Create: `src/components/Dashboard/FatigueAlert.tsx`

**Depends on:** Phase 4 (needs complete workout data with RPE + AMRAP)

Implement §5.8 in full:
- `checkSystemicFatigue(recentSessions, phase)` → `FatigueAlert | null`
- Three signal types: e1RM decline, RPE increase at same weight, AMRAP decline
- Phase-adjusted session thresholds (cutting: 2, maintaining: 3, bulking: 3-4)
- Systemic alert when 2+ signals fire
- `generateDeloadPrescription(phase)` → `DeloadWeek`
- Deload state management: frozen progression, weight reduction, 4-session countdown
- Post-deload: revert to pre-deload weights, extend if first session back RPE 9+
- Works without RPE data (AMRAP + e1RM signals alone)

**UI:** Systemic Fatigue Alert modal per §5.8.2 mockup. "Start Deload Week" / "Dismiss" buttons.

**Tests:** All cases from §16.1 Fitness-Fatigue Deload Triggers section.

**Commit after complete.**

---

### Task 5B: Inactivity & Consistency Tracking

**Files:**
- Create: `src/lib/inactivity.ts`
- Create: `src/lib/inactivity.test.ts`
- Create: `src/components/Dashboard/ConsistencyWidget.tsx`

**Depends on:** Phase 2 (dashboard)

Implement §5.10:
- `evaluateTrainingGap(daysSinceLastWorkout, phase)` → `InactivityAlert | null`
- Phase-adjusted thresholds: cutting warns at 3 days, maintaining at 5
- Escalation: gentle → urgent → detraining (with 85% ramp-up)
- Cutting-specific muscle loss messaging at 7+ days

**UI:** Consistency widget per §5.10.3 (sessions this week, last week, streak, next up, phase tip).

**Tests:** All cases from §16.1 Inactivity Tracking section.

**Commit after complete.**

---

### Task 5C: Weekly Volume Tracker

**Files:**
- Create: `src/lib/volumeTracker.ts`
- Create: `src/lib/volumeTracker.test.ts`
- Create: `src/app/tools/volume/page.tsx`
- Create: `src/components/Charts/VolumeBars.tsx`

**Depends on:** Phase 2 (needs workout data)

Implement §11:
- Fractional method: primary muscles = 1.0 set credit, secondary = 0.5
- Warm-up sets and RPE < 7 sets excluded
- Weekly bars per muscle group with color coding (green = on target, yellow = below)
- Volume-aware accessory suggestions: highlight under-volume groups

**Tests:** All cases from §16.1 Volume Tracker section.

**Commit after complete.**

---

### Task 5D: RPE/e1RM Trend Charts + PR Detection

**Files:**
- Create: `src/app/program/page.tsx`
- Create: `src/components/Charts/E1RMChart.tsx`
- Create: `src/components/Charts/RPETrendChart.tsx`

**Depends on:** Phase 2 (history data)

Implement §12.5 Program Overview:
- Per-lift e1RM trend line (Recharts line chart)
- RPE trend per lift
- Current T1/T2 stages and weights
- Recovery status bars
- "Gym debt" list
- Active pain flags
- PR detection: new e1RM > previous max → "New e1RM PR!" badge

**Commit after complete.**

---

## Phase 6: Backend + Sync

**Goal:** Add cloud persistence, auth, and sync. This phase is **parallelizable with Phases 4-5** since it doesn't modify existing UI logic — it adds a sync layer underneath.

**Agent assignment:** Up to 4 agents on 6A-6D simultaneously.

---

### Task 6A: Neon Postgres + Drizzle Schema

**Files:**
- Create: `src/db/schema.ts`
- Create: `drizzle.config.ts`
- Modify: `package.json` (add drizzle dependencies)

**Depends on:** 0B (type definitions)

Install `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`. Create Drizzle schema per §14.5 (users, workouts, sets, runs, bodyweight, painEntries, estimated1RMs tables). Set up Drizzle config pointing to Neon.

**Commit after complete.**

---

### Task 6B: Auth.js Setup

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/auth.ts`
- Modify: `src/app/layout.tsx` (add SessionProvider)

**Depends on:** 6A (needs users table)

Set up Auth.js with Apple + Google providers. Session stored in JWT. User created in Neon on first sign-in.

**Commit after complete.**

---

### Task 6C: Sync Logic

**Files:**
- Create: `src/lib/sync.ts`
- Create: `src/lib/sync.test.ts`

**Depends on:** 6A, 6B

Implement §14.3 sync strategy:
- All writes go to Dexie first
- On app focus / after workout: push unsynced records (synced = false)
- On page load / app resume: pull latest from API
- `clientId` deduplication for interrupted pushes
- Last-write-wins for rare edit conflicts
- Mark records `synced = true` after successful push

**Tests:**
- Unsynced records pushed on app focus
- `clientId` deduplicates interrupted pushes
- Pull merges remote data with local

**Commit after complete.**

---

### Task 6D: API Routes

**Files:**
- Create: `src/app/api/sync/push/route.ts`
- Create: `src/app/api/sync/pull/route.ts`

**Depends on:** 6A, 6B, 6C

Implement push/pull API routes. Push accepts arrays of new records, deduplicates by clientId, inserts into Neon. Pull returns records newer than client's last sync timestamp.

**Commit after complete.**

---

## Phase 7: Native + HealthKit

**Goal:** Wrap the app for iOS with Capacitor and integrate HealthKit.

---

### Task 7A: Capacitor Setup

**Files:**
- Create: `capacitor.config.ts`
- Generated: `ios/` directory

**Depends on:** Phase 6 (app should be fully functional before wrapping)

Install Capacitor:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init recomp-life com.recomplife.app --web-dir=out
npm install @capacitor/ios
npx cap add ios
```

Configure `next.config.ts` for static export (`output: 'export'`). Build and sync:
```bash
npm run build
npx cap sync ios
```

**Commit after complete.**

---

### Task 7B: HealthKit Read Integration

**Files:**
- Create: `src/lib/healthkit.ts`
- Modify: `src/components/Dashboard/` (add HealthKit data display)

**Depends on:** 7A

Per §9.4.1: read daily protein, calories, sleep duration, step count, bodyweight from Apple Health. Display as dashboard snapshot. Auto-populate readiness screen sleep field.

**Commit after complete.**

---

### Task 7C: HealthKit Write-Back

**Files:**
- Modify: `src/lib/healthkit.ts`

**Depends on:** 7B

Export completed workouts to Apple Health (duration, type, estimated calories).

**Commit after complete.**

---

## Phase 8: Tools + Polish

**Goal:** Standalone tools, visualizations, and polish. **Parallelizable with Phases 4-7.**

**Agent assignment:** Up to 6 agents on 8A-8F simultaneously.

---

### Task 8A: Plate Calculator

**Files:**
- Create: `src/app/tools/plate-calculator/page.tsx`
- Create: `src/lib/plateCalculator.ts`
- Create: `src/lib/plateCalculator.test.ts`
- Create: `src/components/ActiveWorkout/PlatePopover.tsx`

**Depends on:** 0B (equipment profile)

Implement §10: given target weight, show plates per side using user's configured bar weight and available plates. Standalone page + inline popover (tap weight during workout).

**Commit after complete.**

---

### Task 8B: DB ↔ Barbell Converter Tool

**Files:**
- Create: `src/app/tools/converter/page.tsx`

**Depends on:** 1C (dbConversion)

Simple standalone page: input barbell weight → show DB equivalent and vice versa.

**Commit after complete.**

---

### Task 8C: Data Export/Import

**Files:**
- Create: `src/app/tools/export/page.tsx`
- Create: `src/lib/dataExport.ts`

**Depends on:** 0C (Dexie)

Export all Dexie data as JSON or CSV. Import from JSON (validates schema). Trust-builder feature — prioritize per spec rec #30.

**Commit after complete.**

---

### Task 8D: Bodyweight Trend + Rate-of-Loss

**Files:**
- Create: `src/app/weigh-in/page.tsx`
- Create: `src/components/BodyweightChart.tsx`
- Modify: `src/components/Dashboard/WeightTrend.tsx`

**Depends on:** Phase 2

Implement §9.2-9.3: 7-day and 30-day averages, trend direction, rate per week, ETA to milestones, rate-of-loss green zone visualization (0.5-1.0% BW/week = green, etc.). Fat loss stall protocol (§9.4.4).

**Commit after complete.**

---

### Task 8E: Training Phase Selector UI

**Files:**
- Modify: `src/app/settings/page.tsx`

**Depends on:** 2E (settings page)

Full training phase selector with:
- Cutting / maintaining / bulking radio buttons
- Phase-specific explanation text on selection
- Optional: daily deficit, protein target fields
- Phase change confirmation with one-time explanation (§5.7)
- Immediate threshold update — no data reset

**Commit after complete.**

---

### Task 8F: Manual Nutrition/Supplement Toggles

**Files:**
- Modify: `src/components/Dashboard/` (add nutrition widget)
- Create: `src/components/Dashboard/NutritionWidget.tsx`

**Depends on:** Phase 2

Per §9.4.2: lightweight manual toggles on dashboard:
- Protein target met? (yes/no)
- Pre-workout meal? (toggle before workout)
- Creatine today? (checkbox with streak counter)
- Sleep hours manual entry (if no HealthKit)

**Commit after complete.**

---

## Integration Testing Checklist (Post Each Phase)

After each phase completes, run the relevant integration tests from §16.2:

- **After Phase 2:** Full workout flow (configure → workout → summary)
- **After Phase 4:** Home-adapted flow, pain-modified flow, run-aware flow
- **After Phase 5:** Deload trigger flow, inactivity flow, phase switch flow
- **After Phase 6:** Offline workout → sync on reconnect
- **After Phase 7:** iPhone Safari PWA install, timer with phone locked

---

## Agent Team Execution Summary

| Phase | # Parallel Agents | Dependencies | Est. Tasks |
|-------|------------------|--------------|------------|
| 0 | 1-2 (0A first, then 0B+0C parallel) | None | 3 |
| 1 | Up to 6 (all parallel) | Phase 0 | 6 |
| 2 | Up to 5 (all parallel) | Phase 1 | 5 |
| 3 | Up to 2 (parallel with Phase 2) | None | 2 |
| 4 | Up to 4 (all parallel) | Phase 2 | 4 |
| 5 | Up to 4 (all parallel) | Phase 4 | 4 |
| 6 | Up to 4 (parallel with Phases 4-5) | Phase 0 | 4 |
| 7 | 1-3 (sequential 7A→7B→7C) | Phase 6 | 3 |
| 8 | Up to 6 (all parallel) | Phase 2 | 6 |
| **Total** | | | **37 tasks** |

**Critical path:** 0A → 0B/0C → 1A → 2C → 4D → 5A (this is the longest dependency chain)

**Maximum parallelism opportunity:** After Phase 0, up to 6 agents can work simultaneously on Phase 1. Phases 3, 6, and 8 can overlap with 2, 4-5, and 4-7 respectively.
