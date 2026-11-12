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

/** Exercises that use the low-rep range: 3x10-12 */
const LOW_REP_EXERCISES = new Set(["ab_rollout", "back_extensions"]);

/**
 * Returns the appropriate rep range for a given accessory exercise.
 *
 * - Face pulls, lateral raises, calf raises: 3x15-20
 * - Ab rollout, back extensions: 3x10-12
 * - Everything else (bicep curls, tricep work, leg curls, leg extensions,
 *   incline fly, hip thrust): 3x12-15
 */
export function getAccessoryRepRange(exerciseId: string): AccessoryRepRange {
  if (HIGH_REP_EXERCISES.has(exerciseId)) {
    return { min: 15, max: 20, sets: 3 };
  }
  if (LOW_REP_EXERCISES.has(exerciseId)) {
    return { min: 10, max: 12, sets: 3 };
  }
  // Default: 3x12-15 for bicep curls, tricep work, leg curls/extensions,
  // incline fly, hip thrust, and any unknown exercise
  return { min: 12, max: 15, sets: 3 };
}

// ─── Accessory Progression (Double Progression) ───────────────────────────────

/**
 * Evaluates whether an accessory exercise should increase weight, maintain,
 * or deload based on double progression logic.
 *
 * Rules:
 * 1. If ALL sets hit the top of the rep range (or above), increase weight by 5 lbs.
 * 2. If stuck for 3+ consecutive sessions at the same weight without hitting
 *    the top of the range, deload to 90% (rounded to nearest 5 lbs).
 * 3. Otherwise, maintain the current weight.
 *
 * Not connected to the UI yet.
 *
 * @evidence accessory-progression
 */
export function evaluateAccessoryProgression(
  state: AccessoryState,
  targetRepRange: { min: number; max: number },
  stuckSessionCount: number
): AccessoryProgressionResult {
  const allAtTop = state.lastSessionReps.every(
    (r) => r >= targetRepRange.max
  );
  const anyBelowMin = state.lastSessionReps.some(
    (r) => r < targetRepRange.min
  );

  if (allAtTop) {
    return {
      newWeight: state.weight + 5,
      action: "increase",
      message: `All sets at ${targetRepRange.max}+ reps — adding 5 lbs`,
    };
  }

  if (stuckSessionCount >= 3) {
    const deloadWeight = roundToNearest5(state.weight * 0.9);
    return {
      newWeight: deloadWeight,
      action: "deload",
      message: `Stuck 3+ sessions — dropping to ${deloadWeight} lbs and rebuilding`,
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
