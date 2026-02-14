/**
 * GZCLP Progression Engine
 *
 * Pure functions implementing the GZCLP linear progression scheme:
 * - T1: 5x3 -> 6x2 -> 10x1 -> reset (failure cascade)
 * - T2: 3x10 -> 3x8 -> 3x6 -> reset (failure cascade)
 * - T3: AMRAP-based progression with phase adjustments
 * - T2 Auto-regulation: RPE-based load drops per training phase
 *
 * All functions are pure — they take state in and return new state out.
 */

import type {
  LiftState,
  SetLog,
  SetStatus,
  EquipmentProfile,
  TrainingPhase,
  WorkoutLocation,
  T1Stage,
  T2Stage,
  T2AutoRegResult,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Round a weight to the nearest 5 lbs.
 */
export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

/**
 * Determine the weight increment for a given lift category, location, and
 * equipment profile.
 *
 * - Home workouts always use the dumbbell increment (typically 5 lbs).
 * - Gym upper-body lifts increment by the barbell increment (e.g., 2.5 or 5).
 * - Gym lower-body lifts increment by double the barbell increment (e.g., 5 or 10).
 */
export function getIncrement(
  lift: "upper" | "lower",
  location: WorkoutLocation,
  equipment: EquipmentProfile
): number {
  if (location === "home") {
    return equipment.dumbbellIncrementLbs;
  }
  if (lift === "upper") {
    return equipment.gymBarbellIncrementLbs;
  }
  return equipment.gymBarbellIncrementLbs * 2;
}

// ---------------------------------------------------------------------------
// Freeze-status detection
// ---------------------------------------------------------------------------

const FREEZE_STATUSES: ReadonlySet<SetStatus> = new Set([
  "skipped_pain",
  "reduced_run_fatigue",
  "reduced_equipment",
]);

/**
 * Returns true if *any* set in the workout carries a status that should
 * freeze progression (pain, run fatigue, equipment limitation).
 */
function hasFreezeStatus(sets: SetLog[]): boolean {
  return sets.some((s) => FREEZE_STATUSES.has(s.status));
}

/**
 * Returns true if *any* set carries the autoregulated load-drop status.
 */
function hasAutoregulatedLoadDrop(sets: SetLog[]): boolean {
  return sets.some((s) => s.status === "autoregulated_load_drop");
}

// ---------------------------------------------------------------------------
// T1 Progression
// ---------------------------------------------------------------------------

/** Schema for sets/reps per T1 stage. Last set is always AMRAP. */
const T1_STAGE_CONFIG: Record<T1Stage, { sets: number; reps: number }> = {
  "5x3": { sets: 5, reps: 3 },
  "6x2": { sets: 6, reps: 2 },
  "10x1": { sets: 10, reps: 1 },
};

/** Failure cascade order for T1 stages. */
const T1_NEXT_STAGE: Record<T1Stage, T1Stage | "reset"> = {
  "5x3": "6x2",
  "6x2": "10x1",
  "10x1": "reset",
};

/**
 * Determine whether T1 sets count as a pass.
 *
 * A pass requires:
 * - All non-AMRAP sets completed at prescribed reps
 * - The AMRAP set achieved at least the target rep count
 * - No sets marked "failed"
 */
function isT1Pass(sets: SetLog[], stage: T1Stage): boolean {
  const config = T1_STAGE_CONFIG[stage];

  // Every set must be "completed" status
  if (sets.some((s) => s.status === "failed")) {
    return false;
  }

  // Check each set hit at least the target reps
  for (const s of sets) {
    if (s.actualReps < config.reps) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate T1 progression after a workout.
 *
 * Returns a new (shallow-copied) LiftState with updated T1 fields.
 */
export function evaluateT1Progression(
  liftState: LiftState,
  setsCompleted: SetLog[],
  location: WorkoutLocation,
  equipment: EquipmentProfile,
  liftType: "upper" | "lower"
): LiftState {
  // Freeze: return unchanged if any set has a freeze status
  if (hasFreezeStatus(setsCompleted)) {
    return { ...liftState };
  }

  const stage = liftState.t1Stage;
  const passed = isT1Pass(setsCompleted, stage);

  if (passed) {
    const increment = getIncrement(liftType, location, equipment);
    return {
      ...liftState,
      t1Weight: liftState.t1Weight + increment,
      t1FailCount: 0,
    };
  }

  // Failed — cascade
  const next = T1_NEXT_STAGE[stage];

  if (next === "reset") {
    const resetWeight = roundToNearest5(liftState.t1Weight * 0.85);
    return {
      ...liftState,
      t1Weight: resetWeight,
      t1Stage: "5x3",
      t1FailCount: 0,
      t1LastResetWeight: liftState.t1Weight,
    };
  }

  return {
    ...liftState,
    t1Stage: next,
    t1FailCount: liftState.t1FailCount + 1,
  };
}

// ---------------------------------------------------------------------------
// T2 Progression
// ---------------------------------------------------------------------------

/** Failure cascade order for T2 stages. */
const T2_NEXT_STAGE: Record<T2Stage, T2Stage | "reset"> = {
  "3x10": "3x8",
  "3x8": "3x6",
  "3x6": "reset",
};

/** Schema for sets/reps per T2 stage. */
const T2_STAGE_CONFIG: Record<T2Stage, { sets: number; reps: number }> = {
  "3x10": { sets: 3, reps: 10 },
  "3x8": { sets: 3, reps: 8 },
  "3x6": { sets: 3, reps: 6 },
};

/**
 * Determine whether T2 sets count as a pass.
 */
function isT2Pass(sets: SetLog[], stage: T2Stage): boolean {
  const config = T2_STAGE_CONFIG[stage];

  if (sets.some((s) => s.status === "failed")) {
    return false;
  }

  for (const s of sets) {
    if (s.actualReps < config.reps) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate T2 progression after a workout.
 *
 * Returns a new (shallow-copied) LiftState with updated T2 fields.
 */
export function evaluateT2Progression(
  liftState: LiftState,
  setsCompleted: SetLog[],
  location: WorkoutLocation,
  equipment: EquipmentProfile,
  liftType: "upper" | "lower"
): LiftState {
  // Freeze: return unchanged for pain/run/equipment statuses
  if (hasFreezeStatus(setsCompleted)) {
    return { ...liftState };
  }

  // Autoregulated load drop: counts as pass but FREEZE weight
  if (hasAutoregulatedLoadDrop(setsCompleted)) {
    return { ...liftState };
  }

  const stage = liftState.t2Stage;
  const passed = isT2Pass(setsCompleted, stage);

  if (passed) {
    const increment = getIncrement(liftType, location, equipment);
    return {
      ...liftState,
      t2Weight: liftState.t2Weight + increment,
      t2FailCount: 0,
    };
  }

  // Failed — cascade
  const next = T2_NEXT_STAGE[stage];

  if (next === "reset") {
    const resetWeight = roundToNearest5(liftState.t2Weight * 0.85);
    return {
      ...liftState,
      t2Weight: resetWeight,
      t2Stage: "3x10",
      t2FailCount: 0,
      t2LastResetWeight: liftState.t2Weight,
    };
  }

  return {
    ...liftState,
    t2Stage: next,
    t2FailCount: liftState.t2FailCount + 1,
  };
}

// ---------------------------------------------------------------------------
// T3 Progression
// ---------------------------------------------------------------------------

export interface T3ProgressionResult {
  newWeight: number;
  increased: boolean;
}

/**
 * Evaluate T3 progression after a workout.
 *
 * v3.2 critical fix: weight increases when AMRAP last set >= 25 reps
 * (NOT just total >= 25).
 *
 * Progression criteria (use EITHER trigger in maintaining/bulking):
 * - IF last-set AMRAP reps >= 25 -> ADD 5 lbs
 * - OR IF total reps across 3 sets >= 50 -> ADD 5 lbs
 *
 * Phase-adjusted behavior:
 * - Cutting: only AMRAP trigger (last set >= 25)
 * - Maintaining/Bulking: either trigger works
 */
export function evaluateT3Progression(
  totalReps: number,
  amrapLastSetReps: number,
  currentWeight: number,
  phase: TrainingPhase
): T3ProgressionResult {
  const amrapTrigger = amrapLastSetReps >= 25;
  const totalTrigger = totalReps >= 50;

  let shouldIncrease: boolean;

  if (phase.mode === "cutting") {
    // Cutting: only AMRAP trigger
    shouldIncrease = amrapTrigger;
  } else {
    // Maintaining or Bulking: either trigger
    shouldIncrease = amrapTrigger || totalTrigger;
  }

  if (shouldIncrease) {
    return {
      newWeight: currentWeight + 5,
      increased: true,
    };
  }

  return {
    newWeight: currentWeight,
    increased: false,
  };
}

// ---------------------------------------------------------------------------
// T2 Auto-Regulation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether to suggest a load drop for T2 sets 2-3 based on
 * the RPE of set 1.
 *
 * Per spec section 5.3.1:
 * - Cutting threshold: RPE >= 9.0
 * - Maintaining threshold: RPE >= 9.5
 * - Bulking threshold: RPE >= 10.0
 *
 * If RPE >= 10: suggest 10% drop
 * If RPE >= threshold (but < 10): suggest 5% drop
 */
export function evaluateT2AutoRegulation(
  set1RPE: number | null,
  phase: TrainingPhase,
  prescribedWeight: number
): T2AutoRegResult {
  if (set1RPE === null) {
    return { action: "continue" };
  }

  const threshold =
    phase.mode === "cutting"
      ? 9.0
      : phase.mode === "maintaining"
        ? 9.5
        : 10.0;

  if (set1RPE >= threshold) {
    const dropPercent = set1RPE >= 10 ? 0.1 : 0.05;
    const reducedWeight = roundToNearest5(
      prescribedWeight * (1 - dropPercent)
    );
    return {
      action: "suggest_drop",
      reducedWeight,
      message: `Set 1 felt very hard (RPE ${set1RPE}). Suggest dropping to ${reducedWeight} lbs for Sets 2-3.`,
      progressionEffect: "freeze",
    };
  }

  return { action: "continue" };
}
