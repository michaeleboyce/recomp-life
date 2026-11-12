// Files that still break an architecture rule (see architecture.test.ts).
// One entry per line. Remove a line when its file is migrated; never add one for a
// new file without saying why in a comment beside it.

/** Rule R8: pages and components must not import the Dexie database directly. */
export const DB_IMPORT_ALLOWLIST: string[] = [
  "src/app/body-check/page.tsx",
  "src/app/exercises/page.tsx",
  "src/app/history/page.tsx",
  "src/app/page.tsx",
  "src/app/plate-calculator/page.tsx",
  "src/app/program/page.tsx",
  "src/app/settings/page.tsx",
  "src/app/weigh-in/page.tsx",
  "src/app/workout/active/page.tsx",
  "src/app/workout/configure/page.tsx",
  "src/app/workout/summary/page.tsx",
  "src/components/BodyMap/PainHistory.tsx",
  "src/components/BodyMap/RegionDetail.tsx",
  "src/components/Charts/BodyweightChart.tsx",
  "src/components/Charts/E1RMChart.tsx",
  "src/components/Charts/RPETrendChart.tsx",
  "src/components/Charts/VolumeBars.tsx",
  "src/components/Dashboard/AbandonedWorkoutBanner.tsx",
  "src/components/Dashboard/ActivePainBanner.tsx",
  "src/components/Dashboard/E1RMSummary.tsx",
  "src/components/Dashboard/GymDebtBanner.tsx",
  "src/components/Dashboard/InactivityBanner.tsx",
  "src/components/Dashboard/NextWorkoutCard.tsx",
  "src/components/Dashboard/RecoveryStatusBars.tsx",
  "src/components/Dashboard/WeekSummary.tsx",
  "src/components/Dashboard/WeightTrend.tsx",
  "src/components/RunLogger.tsx",
  "src/components/WeighInPrompt.tsx",
  // Added by the interactive-anatomy branch; migrate to src/hooks once that work has landed.
  "src/app/muscles/page.tsx",
  "src/components/Dashboard/MuscleHeatCard.tsx",
];

/** Rule R9: pages and components must use theme tokens, not raw palette classes. */
export const PALETTE_ALLOWLIST: string[] = [
  "src/app/body-check/page.tsx",
  "src/app/history/page.tsx",
  "src/app/page.tsx",
  "src/app/plate-calculator/page.tsx",
  "src/app/program/page.tsx",
  "src/app/weigh-in/page.tsx",
  "src/app/workout/active/page.tsx",
  "src/app/workout/configure/page.tsx",
  "src/app/workout/summary/page.tsx",
  "src/components/ActiveWorkout/AMRAPIndicator.tsx",
  "src/components/ActiveWorkout/ExerciseBlock.tsx",
  "src/components/ActiveWorkout/RestTimer.tsx",
  "src/components/ActiveWorkout/RPESelector.tsx",
  "src/components/ActiveWorkout/WorkoutMiniMap.tsx",
  "src/components/ActiveWorkout/WorkoutOverviewSheet.tsx",
  "src/components/BodyMap/PainHistory.tsx",
  "src/components/Charts/BodyweightChart.tsx",
  "src/components/Dashboard/AbandonedWorkoutBanner.tsx",
  "src/components/Dashboard/ActivePainBanner.tsx",
  "src/components/Dashboard/E1RMSummary.tsx",
  "src/components/Dashboard/InactivityBanner.tsx",
  "src/components/Dashboard/NextWorkoutCard.tsx",
  "src/components/Dashboard/RecoveryStatusBars.tsx",
  "src/components/Dashboard/WeightTrend.tsx",
  "src/components/Exercises/ExerciseRow.tsx",
  "src/components/PreWorkout/AccessoryPicker.tsx",
  "src/components/PreWorkout/ReadinessCheck.tsx",
  "src/components/RunLogger.tsx",
  "src/components/Settings/ExercisePreferencesEditor.tsx",
  "src/components/SyncProvider.tsx",
  "src/components/WorkoutSummary/EquipmentAdaptedResult.tsx",
  "src/components/WorkoutSummary/LiftResult.tsx",
];

/**
 * Directories exempt from the palette rule for good: anatomical figures need
 * colours that are not part of the app theme.
 */
export const PALETTE_EXEMPT_PREFIXES: string[] = [
  "src/components/Anatomy/",
  "src/components/BodyMap/BodyMapSVG.tsx",
];
