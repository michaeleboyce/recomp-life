# Interactive Anatomy and Exercise Demos — Implementation Plan

**Spec:** `2026-11-11-interactive-anatomy-design.md`. Every task cites requirement IDs from it.

**Branch:** `feat/interactive-anatomy` in worktree `.claude/worktrees/interactive-anatomy`. Dev server: `npx next dev -p 3107`.

**Method per task:** failing test → implement → `npx vitest run` → commit per phase (conventional commits). UI verified with Playwright at 390×844.

**Tech added:** `react-muscle-highlighter`, `three`, `@react-three/fiber`, `@react-three/drei`; dev-only `@types/three`, `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `draco3dgltf`.

---

## Phase 1 — Muscle data (R1, R2, R3, R19)

### Task 1.1 Types and muscle metadata
- Modify `src/types/index.ts`: add `MuscleId`, `ActivationLevel`; change `Exercise.primaryMuscles` / `secondaryMuscles` to `MuscleId[]`; add `stabilizerMuscles`.
- Create `src/lib/muscles.ts` (+ test): `MUSCLE_IDS`, `MUSCLE_LABELS`, `MUSCLE_GROUPS`, `groupOf(muscle)`, `MUSCLE_VIEW` (front/back/both).
- Tests: every `MuscleId` has a label and exactly one group.

### Task 1.2 Exercise configuration
- Modify `src/lib/exercises.ts`: muscle fields from the spec table.
- Extend `src/lib/exercises.test.ts`: ≥1 primary; no muscle in two levels; all values are valid `MuscleId`s; spot checks (curls → biceps, calf raises → calves, hip thrust → glutes).
- Update fixtures in `src/lib/autoAdapt.test.ts`.

### Task 1.3 Volume
- Modify `src/lib/volumeTracking.ts`: per-muscle keys; add `calculateGroupVolume(sets)` with highest-credit-per-set rule.
- Rewrite `src/lib/volumeTracking.test.ts` for muscle keys; add: one squat set = 1 Quads direct set; curl credits Biceps not Triceps; OHP credits Shoulders once.
- Create `src/lib/dates.ts` (+ test): `getMonday`. Use it in `WeekSummary.tsx` and `VolumeBars.tsx`.
- Modify `src/components/Charts/VolumeBars.tsx`: use `calculateGroupVolume` and group order.
- Modify `src/components/Exercises/ExerciseRow.tsx`: muscle labels.

### Task 1.4 Load and recovery
- Create `src/lib/muscleLoad.ts` (+ test): `getExerciseActivation`, `calculateMuscleLoad`, `getWeeklyMuscleLoad`, `weeklyHeatLevel`, `relativeHeatLevels`, `activationHeatLevels`, `getMuscleLastTrained`, `getMuscleRecovery`, `exercisesForMuscle`.

**Commit:** `feat(muscles): replace joint-based muscle config with MuscleId model`

---

## Phase 2 — 2D muscle map (R4, R5, R9, R11, R12, R14)

### Task 2.1 Mapping
- Create `src/lib/anatomy/regionMapping.ts` (+ test): `MUSCLE_TO_SLUGS`, `slugToMuscles`, `REGION_TARGETS` (slug area or joint dot per `BodyRegion`), `slugToRegion(slug, side)`.
- Tests: every `MuscleId` maps to ≥1 slug; every `BodyRegion` has a target; round trip slug → region → target.

### Task 2.2 Components
- Create `src/components/Anatomy/palette.ts`, `MuscleMap.tsx`, `MuscleLegend.tsx`.
- Component test `MuscleMap.test.tsx`: renders both views; tap fires with a `MuscleId`.

### Task 2.3 Pain map
- Rewrite `src/components/BodyMap/BodyMapSVG.tsx` on the figure, same props; joint dots for elbow, wrist, hip.
- Component test: tapping each target emits the expected `BodyRegion`.

### Task 2.4 Wiring
- `ExerciseRow.tsx` (thumbnail, link), `src/app/exercises/page.tsx` (muscle filter), `ExerciseBlock.tsx`, `WorkoutOverviewSheet.tsx`, `NextWorkoutCard.tsx`, `src/app/program/page.tsx`, new `src/components/Dashboard/MuscleHeatCard.tsx` on the dashboard.

**Commit:** `feat(anatomy): 2D muscle map across workout screens`

---

## Phase 3 — 3D anatomy (R6, R7, R10, R13)

### Task 3.1 Mesh classification
- Create `src/lib/anatomy/meshMapping.ts` (+ test): `classifyMuscleMesh(name, nameDetail)`.

### Task 3.2 Model build
- Create `scripts/build-anatomy-model.mjs`; run once; commit `public/models/anatomy.glb`, `public/models/NOTICE.md`, `src/lib/anatomy/meshManifest.json`.
- Copy Draco decoder to `public/draco/`.
- Test against manifest: every `MuscleId` has left and right meshes.

### Task 3.3 Viewer
- Create `src/components/Anatomy/Anatomy3D.tsx`, `Anatomy3DScene.tsx`, `MuscleInfoSheet.tsx`.
- Create `src/app/muscles/page.tsx`.
- Summary page "Muscles worked" card.

**Commit:** `feat(anatomy): 3D anatomy viewer and muscle explorer`

---

## Phase 4 — Exercise page and photos (R8, R15)

- Create `scripts/fetch-exercise-media.ts`, `src/lib/exerciseMedia.ts` (+ test), `src/lib/exerciseMedia.generated.json`, `public/exercise-media/`.
- Create `src/components/ExerciseDemo/ExercisePhotos.tsx`, `ExerciseViewer.tsx`.
- Create `src/app/exercises/[id]/page.tsx` (static params) and its client component.
- Active workout "Form" sheet.

**Commit:** `feat(exercises): detail page with reference photos`

---

## Phase 5 — Animated mannequin (R16)

- Create `src/lib/motion/` (`vec.ts`, `ik.ts`, `rig.ts`, `archetypes.ts`, `motions.ts`, `sample.ts`) with tests for the invariants.
- Create `src/components/ExerciseDemo/Mannequin.tsx`, `MannequinScene.tsx`.
- Quality gate on the four main lifts before the rest.

**Commit:** `feat(exercises): animated 3D mannequin demos`

---

## Phase 6 — Offline and credits (R17, R18)

- Modify `public/sw.js`, `src/components/ServiceWorkerRegistration.tsx`; create `src/lib/offlineWarmList.ts` (+ test).
- Settings: Credits and licences; figure choice.
- Tools page entry; `BottomNav` `alsoActive`.

**Commit:** `feat(offline): warm media cache; credits and licences`

---

## Final verification

- `npx vitest run`, `npm run lint`, `npm run build`.
- Playwright pass per requirement R4–R18, screenshots kept in the session scratchpad.
- Offline and no-WebGL passes.
- Report: each requirement → evidence; anything dropped is listed.
