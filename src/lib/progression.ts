/**
 * GZCLP Progression Engine
 *
 * Pure functions implementing the GZCLP linear progression scheme:
 * - T1: 5x3 -> 6x2 -> 10x1 -> reset (failure cascade)
 * - T2: 3x10 -> 3x8 -> 3x6 -> reset (failure cascade)
 * - T3: the weight goes up when the last set reaches the reps its next step asks for
 * - T2 Auto-regulation: load drops from the reps left on the first set, per training phase
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
  RepsInReserve,
  SetLog,
  SetStatus,
  EquipmentProfile,
  TrainingPhase,
  WorkoutLocation,
  T1Stage,
  T2Stage,
  T2AutoRegResult,
} from "@/types";
import { repsInReserveLabel } from "@/lib/effort";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fraction of the failed weight a lift restarts at after its last stage. */
export const RESET_FACTOR = 0.85;

/**
 * What the first T2 set's reps-in-reserve answer suggests for the remaining sets, by
 * training phase: "max" is the larger drop, "step" the smallest one, null no
 * suggestion. The per-phase split is a heuristic.
 */
export const T2_AUTOREG_SUGGESTION: Record<
  TrainingPhase["mode"],
  Record<RepsInReserve, "max" | "step" | null>
> = {
  cutting: { "0": "max", "1-2": "step", "3+": null },
  maintaining: { "0": "max", "1-2": null, "3+": null },
  bulking: { "0": "max", "1-2": null, "3+": null },
};

/**
 * Suggested T2 load drop. `max` is the fraction taken off after a set with nothing
 * left; `stepLbs` is the smallest drop, used on its own for the "step" suggestion and
 * as the least a `max` drop takes off (loads round to 5 lb, so a small percentage of
 * a light weight would otherwise round back to no change).
 */
export const T2_AUTOREG_DROP = { max: 0.075, stepLbs: 5 } as const;

/**
 * The fewest reps on the last T3 set that can move the weight up, however small the
 * next step: the rep formula is rough at high reps, so a tiny step does not go below it.
 */
export const T3_INCREASE_REPS_MIN = 18;

/**
 * The most reps on the last T3 set the weight ever asks for: the stock GZCLP number.
 * A big step, bodyweight work and a T3 at the heaviest dumbbell use it.
 */
export const T3_INCREASE_REPS_MAX = 25;

/** Reps a set of the stock T3 scheme (3×15, the last set as many as you can). */
export const T3_TARGET_REPS = 15;

/** Pounds added to a T3 lift when it goes up. */
export const T3_INCREMENT_LBS = 5;

/** The divisor of the rep-to-strength formula, `weight × (1 + reps / 30)`. */
export const REPS_FORMULA_DIVISOR = 30;
/** Floating-point slack, so 24.000000000000004 needed reps reads as 24. */
const REPS_EPSILON = 1e-9;

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

/** What a T3 weight's next step asks of the last set. */
export interface T3IncreaseInput {
  /** The weight lifted, as lifted (a hand, where the exercise is per hand). 0 for bodyweight. */
  weight: number;
  /** The weight the progression gives next, in the same terms; null when there is none. */
  nextWeight: number | null;
  /** Reps a set of the scheme (15 for the stock 3×15+). */
  targetReps: number;
}

/**
 * Reps the last T3 set needs for the weight to go up: enough that, by the rep-to-
 * strength formula the app uses everywhere (`weight × (1 + reps / 30)`), the lifter
 * could still do the target reps at the next weight.
 *
 *   needed    = ceil(30 × ((next / weight) × (1 + target / 30) − 1))
 *   threshold = needed, kept between T3_INCREASE_REPS_MIN and T3_INCREASE_REPS_MAX
 *
 * No weight (bodyweight work) or no next step (already at the heaviest dumbbell): the
 * maximum. A small step (5 lb on a heavy machine) asks for fewer reps than a big one
 * (5 lb on a light dumbbell). The only place the T3 rep count is worked out. Pure.
 *
 * @evidence t3-progression
 */
export function t3IncreaseThreshold({ weight, nextWeight, targetReps }: T3IncreaseInput): number {
  if (!(weight > 0) || nextWeight == null || !(nextWeight > weight)) return T3_INCREASE_REPS_MAX;
  const needed = Math.ceil(
    REPS_FORMULA_DIVISOR * ((nextWeight / weight) * (1 + targetReps / REPS_FORMULA_DIVISOR) - 1) -
      REPS_EPSILON
  );
  return Math.min(T3_INCREASE_REPS_MAX, Math.max(T3_INCREASE_REPS_MIN, needed));
}

/** The next weight of a T3 lift state: T3_INCREMENT_LBS more. */
export function t3NextWeight(weight: number): number {
  return weight + T3_INCREMENT_LBS;
}

export interface T3ProgressionResult {
  newWeight: number;
  increased: boolean;
  /** Reps the last set needed (`t3IncreaseThreshold`). */
  threshold: number;
}

/**
 * Evaluate T3 progression after a workout.
 *
 * The weight goes up by T3_INCREMENT_LBS when the last set reached the threshold for
 * that step (`t3IncreaseThreshold`), in every training phase. Total reps across the
 * sets do not count: two easy sets must not stand in for a hard last one.
 *
 * Applied by `computeCompletion` when a T3 exercise was fully completed. The
 * workout detail page explains the result ("What it did").
 *
 * @evidence t3-progression
 */
export function evaluateT3Progression(
  lastSetReps: number,
  currentWeight: number,
  targetReps: number = T3_TARGET_REPS
): T3ProgressionResult {
  const nextWeight = t3NextWeight(currentWeight);
  const threshold = t3IncreaseThreshold({ weight: currentWeight, nextWeight, targetReps });
  return lastSetReps >= threshold
    ? { newWeight: nextWeight, increased: true, threshold }
    : { newWeight: currentWeight, increased: false, threshold };
}

/**
 * T3 after a workout in which every set of the lift was done: the new lift state and
 * the outcome that explains it. A set skipped or reduced for pain, a run or equipment
 * holds the weight like any other tier; otherwise `evaluateT3Progression` decides
 * from the last set logged, against the threshold for this weight's next step and the
 * scheme's `targetReps`. The weight never goes down.
 */
export function evaluateT3(
  liftState: LiftState,
  setsCompleted: SetLog[],
  targetReps: number = T3_TARGET_REPS
): ProgressionResult {
  const hold = getHoldReason("T3", setsCompleted);
  if (hold) {
    return resultFor("T3", liftState, { ...liftState }, "held", hold);
  }

  const lastSetReps = setsCompleted[setsCompleted.length - 1]?.actualReps ?? 0;
  const result = evaluateT3Progression(lastSetReps, liftState.t3Weight, targetReps);
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
 * Evaluate whether to suggest a load drop for T2 sets 2-3 from the reps the lifter
 * had left on set 1.
 *
 * What each answer suggests in each phase is in T2_AUTOREG_SUGGESTION; the sizes of
 * the two drops are in T2_AUTOREG_DROP. A suggestion always lowers the weight and
 * never takes it to zero.
 *
 * Accepting the drop freezes T2 progression for the session; it is neither
 * a pass nor a failure.
 *
 * @evidence t2-autoregulation
 */
export function evaluateT2AutoRegulation(
  set1RepsInReserve: RepsInReserve | null,
  phase: TrainingPhase,
  prescribedWeight: number
): T2AutoRegResult {
  if (set1RepsInReserve === null) {
    return { action: "continue" };
  }

  const suggestion = T2_AUTOREG_SUGGESTION[phase.mode][set1RepsInReserve];
  if (suggestion === null) {
    return { action: "continue" };
  }

  const oneStepDown = prescribedWeight - T2_AUTOREG_DROP.stepLbs;
  const reducedWeight =
    suggestion === "max"
      ? Math.min(oneStepDown, roundToNearest5(prescribedWeight * (1 - T2_AUTOREG_DROP.max)))
      : oneStepDown;
  if (reducedWeight <= 0) {
    return { action: "continue" };
  }

  return {
    action: "suggest_drop",
    reducedWeight,
    message: `Set 1 left you ${repsInReserveLabel(set1RepsInReserve)}. Suggest dropping to ${reducedWeight} lbs for Sets 2-3.`,
    progressionEffect: "freeze",
    evidenceId: "t2-autoregulation",
  };
}
