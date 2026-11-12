/**
 * Deload Detection & Prescription Engine
 *
 * Pure functions that detect systemic fatigue across lifts and prescribe
 * deload parameters based on the current training phase.
 *
 * Fatigue signals:
 * - e1rm_decline: consecutive drops in estimated 1RM
 * - rpe_increase: consecutive RPE increases at same weight
 * - amrap_decline: consecutive drops in AMRAP reps
 *
 * Session thresholds vary by phase:
 * - Cutting: 2 consecutive sessions
 * - Maintaining: 3 consecutive sessions
 * - Bulking: 3 for e1rm/amrap, 4 for RPE
 *
 * Alert levels:
 * - "watch": 1 signal detected (informational)
 * - "systemic": 2+ signals across any lifts (deload recommended)
 */

import type {
  LiftState,
  TrainingPhase,
  FatigueAlert,
  FatigueSignal,
  DeloadPrescription,
} from "@/types";

import { roundToNearest5 } from "./progression";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the last `threshold` entries in the array are
 * consecutively declining (each entry < the previous one).
 *
 * Requires at least `threshold` entries to evaluate.
 */
export function isConsecutivelyDeclining(
  arr: number[],
  threshold: number
): boolean {
  if (arr.length < threshold + 1) {
    return false;
  }

  // We need `threshold` consecutive drops, which means checking
  // the last `threshold + 1` entries for a downward sequence.
  // e.g. threshold=2 means we need 3 entries where entry[n-2] > entry[n-1] > entry[n]
  const start = arr.length - threshold - 1;
  for (let i = start + 1; i < arr.length; i++) {
    if (arr[i] >= arr[i - 1]) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if the last `threshold` entries in the array are
 * consecutively increasing (each entry > the previous one).
 *
 * Requires at least `threshold` entries to evaluate.
 */
export function isConsecutivelyIncreasing(
  arr: number[],
  threshold: number
): boolean {
  if (arr.length < threshold + 1) {
    return false;
  }

  const start = arr.length - threshold - 1;
  for (let i = start + 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Session threshold lookup
// ---------------------------------------------------------------------------

interface SessionThresholds {
  e1rm: number;
  rpe: number;
  amrap: number;
}

function getSessionThresholds(phase: TrainingPhase): SessionThresholds {
  switch (phase.mode) {
    case "cutting":
      return { e1rm: 2, rpe: 2, amrap: 2 };
    case "maintaining":
      return { e1rm: 3, rpe: 3, amrap: 3 };
    case "bulking":
      return { e1rm: 3, rpe: 4, amrap: 3 };
  }
}

// ---------------------------------------------------------------------------
// Signal detection for a single lift
// ---------------------------------------------------------------------------

function detectSignals(
  lift: LiftState,
  thresholds: SessionThresholds
): FatigueSignal[] {
  const signals: FatigueSignal[] = [];

  // e1RM decline
  if (isConsecutivelyDeclining(lift.recentE1RMs, thresholds.e1rm)) {
    signals.push({
      type: "e1rm_decline",
      lift: lift.exerciseId,
      consecutiveSessions: thresholds.e1rm,
    });
  }

  // RPE increase (increasing RPE at same weight = fatigue signal)
  if (isConsecutivelyIncreasing(lift.recentAvgRPEs, thresholds.rpe)) {
    signals.push({
      type: "rpe_increase",
      lift: lift.exerciseId,
      consecutiveSessions: thresholds.rpe,
    });
  }

  // AMRAP decline
  if (isConsecutivelyDeclining(lift.recentAMRAPReps, thresholds.amrap)) {
    signals.push({
      type: "amrap_decline",
      lift: lift.exerciseId,
      consecutiveSessions: thresholds.amrap,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check all main lifts for systemic fatigue signals.
 *
 * Returns a FatigueAlert if any signals are detected:
 * - 2+ signals across any lifts -> "systemic" alert
 * - 1 signal -> "watch" level (informational)
 * - 0 signals -> null
 *
 * Not connected to the UI. Before connecting, see the activation notes on
 * the rule: RPE and AMRAP signals must be compared at equal load.
 *
 * @evidence fatigue-detection
 */
export function checkSystemicFatigue(
  liftStates: LiftState[],
  phase: TrainingPhase
): FatigueAlert | null {
  const thresholds = getSessionThresholds(phase);
  const allSignals: FatigueSignal[] = [];

  for (const lift of liftStates) {
    const signals = detectSignals(lift, thresholds);
    allSignals.push(...signals);
  }

  if (allSignals.length === 0) {
    return null;
  }

  if (allSignals.length >= 2) {
    return {
      level: "systemic",
      signals: allSignals,
      message:
        "Multiple fatigue indicators detected across lifts. A deload week is recommended.",
    };
  }

  return {
    level: "watch",
    signals: allSignals,
    message:
      "One fatigue indicator detected. Monitor closely over the next sessions.",
  };
}

/**
 * Generate a deload prescription based on the current training phase.
 *
 * - Cutting: -15% weight, half T3 volume, drop all accessories, RPE 6-7
 * - Maintaining: -10% weight, -25% T3 volume, max 1 accessory, RPE 6-7
 * - Bulking: -10% weight, keep T3 volume, max 1 accessory, RPE 6-7
 *
 * Not connected to the UI.
 *
 * @evidence deload
 */
export function generateDeloadPrescription(
  phase: TrainingPhase
): DeloadPrescription {
  switch (phase.mode) {
    case "cutting":
      return {
        weightReductionPercent: 15,
        t3VolumeReduction: 0.5,
        dropAllAccessories: true,
        maxAccessories: 0,
        rpeTarget: "6-7",
      };
    case "maintaining":
      return {
        weightReductionPercent: 10,
        t3VolumeReduction: 0.25,
        dropAllAccessories: false,
        maxAccessories: 1,
        rpeTarget: "6-7",
      };
    case "bulking":
      return {
        weightReductionPercent: 10,
        t3VolumeReduction: 0,
        dropAllAccessories: false,
        maxAccessories: 1,
        rpeTarget: "6-7",
      };
  }
}

/**
 * Activate a deload for a given lift.
 *
 * - Sets deloadActive = true, deloadSessionsRemaining = 4
 * - Stores pre-deload T1 and T2 weights
 * - Applies weight reduction based on phase prescription
 */
export function activateDeload(
  liftState: LiftState,
  phase: TrainingPhase
): LiftState {
  const prescription = generateDeloadPrescription(phase);
  const reductionFactor = 1 - prescription.weightReductionPercent / 100;

  return {
    ...liftState,
    deloadActive: true,
    deloadSessionsRemaining: 4,
    preDeloadT1Weight: liftState.t1Weight,
    preDeloadT2Weight: liftState.t2Weight,
    t1Weight: roundToNearest5(liftState.t1Weight * reductionFactor),
    t2Weight: roundToNearest5(liftState.t2Weight * reductionFactor),
  };
}

/**
 * Process a completed deload session.
 *
 * - Decrements deloadSessionsRemaining
 * - When it hits 0: deactivates deload and restores pre-deload weights
 */
export function completeDeloadSession(liftState: LiftState): LiftState {
  const remaining = liftState.deloadSessionsRemaining - 1;

  if (remaining <= 0) {
    return {
      ...liftState,
      deloadActive: false,
      deloadSessionsRemaining: 0,
      t1Weight: liftState.preDeloadT1Weight ?? liftState.t1Weight,
      t2Weight: liftState.preDeloadT2Weight ?? liftState.t2Weight,
      preDeloadT1Weight: null,
      preDeloadT2Weight: null,
    };
  }

  return {
    ...liftState,
    deloadSessionsRemaining: remaining,
  };
}
