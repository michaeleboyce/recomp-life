/**
 * GZCLP Progression Engine
 *
 * Pure functions implementing the GZCLP linear progression scheme:
 * - T1: 5x3 -> 6x2 -> 10x1 -> reset (failure cascade)
 * - T2: 3x10 -> 3x8 -> 3x6 -> reset (failure cascade)
 * - T3: the weight goes up when the last set reaches its rep target
 * - T2 Auto-regulation: RPE-based load drops per training phase
 *
 * All functions are pure — they take state in and return new state out. `evaluateT1`,
 * `evaluateT2` and `evaluateT3` also return the outcome: what the rule did and why.
 *
 * @evidence gzclp-progression
 */

import type {
  LiftState,
  ProgressionOutcome,
  ProgressionOutcomeKind,
  ProgressionOutcomeReason,
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
// Constants
// ---------------------------------------------------------------------------

/** Fraction of the failed weight a lift restarts at after its last stage. */
export const RESET_FACTOR = 0.85;

/**
 * RPE of the first T2 set at or above which a lighter load is suggested for
 * the remaining sets, by training phase. The per-phase split is a heuristic.
 */
export const T2_AUTOREG_RPE_THRESHOLD: Record<TrainingPhase["mode"], number> = {
  cutting: 9.0,
  maintaining: 9.5,
  bulking: 10.0,
};

/** Suggested T2 load drop: `max` after an RPE 10 set, `standard` otherwise. */
export const T2_AUTOREG_DROP = { standard: 0.05, max: 0.1 } as const;

/** Reps on the last T3 set at or above which the T3 weight goes up, in every phase. */
export const T3_LAST_SET_INCREASE_REPS = 25;

/** Pounds added to a T3 lift when it goes up. */
export const T3_INCREMENT_LBS = 5;

/**
 * The evidence rule each kind of progression outcome points at: the program's own
 * rules for T1 and T2, the T3 rule, the rule that suggests a T2 load drop, and the
 * rule for a lift done differently from its prescription.
 */
export const OUTCOME_RULE_IDS = {
  program: "gzclp-progression",
  t3: "t3-progression",
  loadDrop: "t2-autoregulation",
  credit: "off-program-credit",
} as const;

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
// Partial-completion freeze detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the exercise was only partially completed (or fully skipped),
 * meaning progression should be frozen — no pass, no fail.
 */
export function shouldFreezeProgression(
  setsCompleted: number,
  targetSets: number
): boolean {
  return setsCompleted < targetSets;
}

// ---------------------------------------------------------------------------
// Freeze-status detection
// ---------------------------------------------------------------------------

/** Set statuses that freeze progression, and the reason each one stands for. */
const FREEZE_REASONS: Partial<Record<SetStatus, "pain" | "run" | "equipment">> = {
  skipped_pain: "pain",
  reduced_run_fatigue: "run",
  reduced_equipment: "equipment",
};

/**
 * Returns true if *any* set carries the autoregulated load-drop status.
 */
function hasAutoregulatedLoadDrop(sets: SetLog[]): boolean {
  return sets.some((s) => s.status === "autoregulated_load_drop");
}

export type HoldReason = Extract<
  ProgressionOutcomeReason,
  "pain" | "run" | "equipment" | "loadDrop"
>;

/**
 * Why a tier's progression is on hold whatever the reps were, or null when it is not.
 * Checked in the order progression checks it: a set skipped or reduced for pain, a
 * run or equipment first (the first such set in logging order gives the reason), then,
 * for T2 only, an accepted load drop. A hold is neither a pass nor a miss.
 */
export function getHoldReason(tier: "T1" | "T2" | "T3", sets: SetLog[]): HoldReason | null {
  for (const set of sets) {
    const reason = FREEZE_REASONS[set.status];
    if (reason) return reason;
  }
  if (tier === "T2" && hasAutoregulatedLoadDrop(sets)) return "loadDrop";
  return null;
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/** A lift state after a session, with what the program rules did to reach it. */
export interface ProgressionResult {
  state: LiftState;
  outcome: ProgressionOutcome;
}

type OutcomePoint = ProgressionOutcome["from"];

/** A tier's weight and stage in a lift state, as an outcome records them. T3 has no stage. */
export function outcomePoint(state: LiftState, tier: ProgressionOutcome["tier"]): OutcomePoint {
  if (tier === "T1") return { weight: state.t1Weight, stage: state.t1Stage };
  if (tier === "T2") return { weight: state.t2Weight, stage: state.t2Stage };
  return { weight: state.t3Weight };
}

/** A new state for one tier with the outcome that says how it differs from `before`. */
function resultFor(
  tier: ProgressionOutcome["tier"],
  before: LiftState,
  state: LiftState,
  kind: ProgressionOutcomeKind,
  reason?: ProgressionOutcomeReason
): ProgressionResult {
  return {
    state,
    outcome: makeOutcome(
      before.exerciseId,
      tier,
      kind,
      outcomePoint(before, tier),
      outcomePoint(state, tier),
      reason
    ),
  };
}

/** The evidence rule behind an outcome, from its tier and its reason. */
export function outcomeRuleId(
  tier: ProgressionOutcome["tier"],
  reason?: ProgressionOutcomeReason
): string {
  if (reason === "edited" || reason === "heavier") return OUTCOME_RULE_IDS.credit;
  if (reason === "loadDrop") return OUTCOME_RULE_IDS.loadDrop;
  return tier === "T3" ? OUTCOME_RULE_IDS.t3 : OUTCOME_RULE_IDS.program;
}

/** One outcome record. `to` defaults to `from`: nothing about the lift changed. */
export function makeOutcome(
  exerciseId: string,
  tier: ProgressionOutcome["tier"],
  kind: ProgressionOutcomeKind,
  from: OutcomePoint,
  to: OutcomePoint = from,
  reason?: ProgressionOutcomeReason
): ProgressionOutcome {
  return {
    exerciseId,
    tier,
    kind,
    ...(reason ? { reason } : {}),
    from: { ...from },
    to: { ...to },
    ruleId: outcomeRuleId(tier, reason),
  };
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
export const T1_NEXT_STAGE: Readonly<Record<T1Stage, T1Stage | "reset">> = {
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
 * Evaluate T1 progression after a workout: the new lift state and the outcome that
 * explains it. Branch order: hold (pain, a run, equipment), pass, reset after the
 * last stage, otherwise one stage down.
 *
 * The state is a new (shallow-copied) LiftState with updated T1 fields.
 */
export function evaluateT1(
  liftState: LiftState,
  setsCompleted: SetLog[],
  location: WorkoutLocation,
  equipment: EquipmentProfile,
  liftType: "upper" | "lower"
): ProgressionResult {
  const stage = liftState.t1Stage;
  const result = (
    state: LiftState,
    kind: ProgressionOutcomeKind,
    reason?: ProgressionOutcomeReason
  ): ProgressionResult => resultFor("T1", liftState, state, kind, reason);

  // Freeze: return unchanged if any set has a freeze status
  const hold = getHoldReason("T1", setsCompleted);
  if (hold) {
    return result({ ...liftState }, "held", hold);
  }

  const passed = isT1Pass(setsCompleted, stage);

  if (passed) {
    const increment = getIncrement(liftType, location, equipment);
    return result(
      {
        ...liftState,
        t1Weight: liftState.t1Weight + increment,
        t1FailCount: 0,
      },
      "passed"
    );
  }

  // Failed — cascade
  const next = T1_NEXT_STAGE[stage];

  if (next === "reset") {
    const resetWeight = roundToNearest5(liftState.t1Weight * RESET_FACTOR);
    return result(
      {
        ...liftState,
        t1Weight: resetWeight,
        t1Stage: "5x3",
        t1FailCount: 0,
        t1LastResetWeight: liftState.t1Weight,
      },
      "reset"
    );
  }

  return result(
    {
      ...liftState,
      t1Stage: next,
      t1FailCount: liftState.t1FailCount + 1,
    },
    "stageDown"
  );
}

/** The lift state `evaluateT1` gives, without the outcome. */
export function evaluateT1Progression(...args: Parameters<typeof evaluateT1>): LiftState {
  return evaluateT1(...args).state;
}

// ---------------------------------------------------------------------------
// T2 Progression
// ---------------------------------------------------------------------------

/** Failure cascade order for T2 stages. */
export const T2_NEXT_STAGE: Readonly<Record<T2Stage, T2Stage | "reset">> = {
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
 * Evaluate T2 progression after a workout: the new lift state and the outcome that
 * explains it. Branch order: hold (pain, a run, equipment, then an accepted load
 * drop), pass, reset after the last stage, otherwise one stage down.
 *
 * The state is a new (shallow-copied) LiftState with updated T2 fields.
 */
export function evaluateT2(
  liftState: LiftState,
  setsCompleted: SetLog[],
  location: WorkoutLocation,
  equipment: EquipmentProfile,
  liftType: "upper" | "lower"
): ProgressionResult {
  const stage = liftState.t2Stage;
  const result = (
    state: LiftState,
    kind: ProgressionOutcomeKind,
    reason?: ProgressionOutcomeReason
  ): ProgressionResult => resultFor("T2", liftState, state, kind, reason);

  // Freeze: return unchanged for pain/run/equipment statuses, then for an accepted
  // autoregulated load drop (neither a pass nor a failure: the weight stays).
  const hold = getHoldReason("T2", setsCompleted);
  if (hold) {
    return result({ ...liftState }, "held", hold);
  }

  const passed = isT2Pass(setsCompleted, stage);

  if (passed) {
    const increment = getIncrement(liftType, location, equipment);
    return result(
      {
        ...liftState,
        t2Weight: liftState.t2Weight + increment,
        t2FailCount: 0,
      },
      "passed"
    );
  }

  // Failed — cascade
  const next = T2_NEXT_STAGE[stage];

  if (next === "reset") {
    const resetWeight = roundToNearest5(liftState.t2Weight * RESET_FACTOR);
    return result(
      {
        ...liftState,
        t2Weight: resetWeight,
        t2Stage: "3x10",
        t2FailCount: 0,
        t2LastResetWeight: liftState.t2Weight,
      },
      "reset"
    );
  }

  return result(
    {
      ...liftState,
      t2Stage: next,
      t2FailCount: liftState.t2FailCount + 1,
    },
    "stageDown"
  );
}

/** The lift state `evaluateT2` gives, without the outcome. */
export function evaluateT2Progression(...args: Parameters<typeof evaluateT2>): LiftState {
  return evaluateT2(...args).state;
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
 * The weight goes up by T3_INCREMENT_LBS when the last set reached
 * T3_LAST_SET_INCREASE_REPS reps, in every training phase. Total reps across the
 * sets do not count: two easy sets must not stand in for a hard last one.
 *
 * Applied by `computeCompletion` when a T3 exercise was fully completed. The
 * workout detail page explains the result ("What it did").
 *
 * @evidence t3-progression
 */
export function evaluateT3Progression(
  lastSetReps: number,
  currentWeight: number
): T3ProgressionResult {
  return lastSetReps >= T3_LAST_SET_INCREASE_REPS
    ? { newWeight: currentWeight + T3_INCREMENT_LBS, increased: true }
    : { newWeight: currentWeight, increased: false };
}

/**
 * T3 after a workout in which every set of the lift was done: the new lift state and
 * the outcome that explains it. A set skipped or reduced for pain, a run or equipment
 * holds the weight like any other tier; otherwise `evaluateT3Progression` decides
 * from the last set logged. The weight never goes down.
 */
export function evaluateT3(liftState: LiftState, setsCompleted: SetLog[]): ProgressionResult {
  const hold = getHoldReason("T3", setsCompleted);
  if (hold) {
    return resultFor("T3", liftState, { ...liftState }, "held", hold);
  }

  const lastSetReps = setsCompleted[setsCompleted.length - 1]?.actualReps ?? 0;
  const result = evaluateT3Progression(lastSetReps, liftState.t3Weight);
  return resultFor(
    "T3",
    liftState,
    { ...liftState, t3Weight: result.newWeight },
    result.increased ? "t3Up" : "t3Same",
    "lastSet"
  );
}

// ---------------------------------------------------------------------------
// T2 Auto-Regulation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether to suggest a load drop for T2 sets 2-3 based on
 * the RPE of set 1.
 *
 * Thresholds by phase are in T2_AUTOREG_RPE_THRESHOLD.
 *
 * If RPE >= 10: suggest the max drop (10%)
 * If RPE >= threshold (but < 10): suggest the standard drop (5%)
 *
 * Accepting the drop freezes T2 progression for the session; it is neither
 * a pass nor a failure.
 *
 * @evidence t2-autoregulation
 */
export function evaluateT2AutoRegulation(
  set1RPE: number | null,
  phase: TrainingPhase,
  prescribedWeight: number
): T2AutoRegResult {
  if (set1RPE === null) {
    return { action: "continue" };
  }

  const threshold = T2_AUTOREG_RPE_THRESHOLD[phase.mode];

  if (set1RPE >= threshold) {
    const dropPercent =
      set1RPE >= 10 ? T2_AUTOREG_DROP.max : T2_AUTOREG_DROP.standard;
    const reducedWeight = roundToNearest5(
      prescribedWeight * (1 - dropPercent)
    );
    return {
      action: "suggest_drop",
      reducedWeight,
      message: `Set 1 felt very hard (RPE ${set1RPE}). Suggest dropping to ${reducedWeight} lbs for Sets 2-3.`,
      progressionEffect: "freeze",
      evidenceId: "t2-autoregulation",
    };
  }

  return { action: "continue" };
}

// ---------------------------------------------------------------------------
// Stage performed in a session
// ---------------------------------------------------------------------------

/** What a failed session moves to, by the stage that was performed. */
export const NEXT_STAGE_LABEL: Record<T1Stage | T2Stage, string> = {
  "5x3": "6x2",
  "6x2": "10x1",
  "10x1": `reset to ${Math.round(RESET_FACTOR * 100)}%`,
  "3x10": "3x8",
  "3x8": "3x6",
  "3x6": `reset to ${Math.round(RESET_FACTOR * 100)}%`,
};

/**
 * The stage a session was performed at, worked out from the target reps of
 * its sets. Use this (not the lift state) when describing a finished session:
 * the lift state has already moved on to the next stage by then.
 */
export function getPerformedStage(
  tier: "T1" | "T2",
  targetReps: number
): { stage: T1Stage | T2Stage; sets: number } | null {
  const stages = tier === "T1" ? T1_STAGE_CONFIG : T2_STAGE_CONFIG;
  for (const [stage, config] of Object.entries(stages)) {
    if (config.reps === targetReps) {
      return { stage: stage as T1Stage | T2Stage, sets: config.sets };
    }
  }
  return null;
}
