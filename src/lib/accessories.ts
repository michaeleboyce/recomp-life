import type { TrainingPhase } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccessoryState {
  exerciseId: string;
  weight: number;
  lastSessionReps: number[]; // reps per set from last session
}

export interface AccessoryProgressionResult {
  newWeight: number;
  action: "increase" | "maintain" | "deload";
  message: string;
}

export interface AccessoryRepRange {
  min: number;
  max: number;
  sets: number;
}

// ─── Accessory Rep Range Lookup ───────────────────────────────────────────────

/** Exercises that use the high-rep range: 3x15-20 */
const HIGH_REP_EXERCISES = new Set([
  "face_pulls",
  "lateral_raises",
  "calf_raises",
]);

/** Exercises that use the low-rep range: 3x10-12 (core work and compound rows). */
const LOW_REP_EXERCISES = new Set([
  "ab_rollout",
  "back_extensions",
  "machine_row",
  "cable_row",
  "db_bent_over_row",
  "incline_db_row",
]);

/**
 * Compound leg and barbell accessories that load heavier: 3x8-12. A machine squat or
 * press taken to 15-20 reps is limited by breathing and the heart more than by the muscle.
 */
const COMPOUND_REP_EXERCISES = new Set([
  "hack_squat",
  "pendulum_squat",
  "leg_press",
  "db_lunge",
  "barbell_rdl",
  "barbell_incline_bench",
]);

/**
 * Returns the appropriate rep range for a given accessory exercise.
 *
 * - Face pulls, lateral raises, calf raises: 3x15-20
 * - Ab rollout, back extensions and compound rows (machine, cable, bent-over, incline
 *   dumbbell): 3x10-12
 * - Compound leg and barbell work (hack, pendulum and leg press, dumbbell lunge, barbell
 *   Romanian deadlift, barbell incline bench): 3x8-12
 * - Everything else (curls, tricep work, leg curls and extensions, flies, kickbacks, hip
 *   thrust): 3x12-15
 */
export function getAccessoryRepRange(exerciseId: string): AccessoryRepRange {
  if (HIGH_REP_EXERCISES.has(exerciseId)) {
    return { min: 15, max: 20, sets: 3 };
  }
  if (LOW_REP_EXERCISES.has(exerciseId)) {
    return { min: 10, max: 12, sets: 3 };
  }
  if (COMPOUND_REP_EXERCISES.has(exerciseId)) {
    return { min: 8, max: 12, sets: 3 };
  }
  // Default: 3x12-15 for curls, tricep work, leg curls/extensions, flies, kickbacks,
  // hip thrust, and any unknown exercise
  return { min: 12, max: 15, sets: 3 };
}

// ─── Accessory Progression (Double Progression) ───────────────────────────────

/**
 * Evaluates whether an accessory exercise should increase weight, maintain,
 * or deload based on double progression logic.
 *
 * Rules:
 * 1. If ALL sets hit the top of the rep range (or above), increase weight by one
 *    step (`step`, 5 lbs unless given: the dumbbell increment for dumbbell work).
 * 2. If stuck for ACCESSORY_STUCK_SESSIONS+ consecutive sessions at the same weight
 *    without hitting the top of the range, deload to ACCESSORY_DELOAD_FRACTION of it
 *    (rounded to the nearest step).
 * 3. Otherwise, maintain the current weight.
 *
 * Read by `accessoryPrescription` (src/lib/accessories/prescription.ts).
 *
 * @evidence accessory-progression
 */
export function evaluateAccessoryProgression(
  state: AccessoryState,
  targetRepRange: { min: number; max: number },
  stuckSessionCount: number,
  step: number = 5
): AccessoryProgressionResult {
  const allAtTop = state.lastSessionReps.every(
    (r) => r >= targetRepRange.max
  );
  const anyBelowMin = state.lastSessionReps.some(
    (r) => r < targetRepRange.min
  );

  if (allAtTop) {
    return {
      newWeight: state.weight + step,
      action: "increase",
      message: `All sets at ${targetRepRange.max}+ reps — adding ${step} lbs`,
    };
  }

  if (stuckSessionCount >= ACCESSORY_STUCK_SESSIONS) {
    const deloadWeight = roundToNearestStep(state.weight * ACCESSORY_DELOAD_FRACTION, step);
    return {
      newWeight: deloadWeight,
      action: "deload",
      message: `Stuck ${ACCESSORY_STUCK_SESSIONS}+ sessions — dropping to ${deloadWeight} lbs and rebuilding`,
    };
  }

  return {
    newWeight: state.weight,
    action: "maintain",
    message: anyBelowMin
      ? "Some sets below minimum reps — keep same weight"
      : "Working toward top of rep range — keep same weight",
  };
}

/** Sessions at one weight without reaching the top of the range before the weight drops. */
export const ACCESSORY_STUCK_SESSIONS = 3;

/** The fraction of the weight an accessory drops to after being stuck. */
export const ACCESSORY_DELOAD_FRACTION = 0.9;

// ─── Phase Accessory Cap ──────────────────────────────────────────────────────

/**
 * Maximum number of accessory exercises suggested per session, by phase.
 *
 * Cutting uses the same cap as maintaining: research on dieting lifters does
 * not support reducing training volume in a deficit, and keeping volume up may
 * help retain muscle. Bulking allows one more.
 */
export const PHASE_ACCESSORY_CAP: Record<TrainingPhase["mode"], number> = {
  cutting: 3,
  maintaining: 3,
  bulking: 4,
};

/**
 * Returns the maximum number of accessory exercises suggested for a given
 * training phase.
 *
 * @evidence accessories-in-cut
 */
export function getPhaseAccessoryCap(phase: TrainingPhase): number {
  return PHASE_ACCESSORY_CAP[phase.mode];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rounds a weight to the nearest 5 lbs.
 */
export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

/** Rounds a weight to the nearest multiple of `step` (5 lbs when the step is not positive). */
export function roundToNearestStep(weight: number, step: number): number {
  const s = step > 0 ? step : 5;
  return Math.round(weight / s) * s;
}
