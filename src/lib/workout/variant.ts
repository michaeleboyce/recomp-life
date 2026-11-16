// Home exercises with their own weight and progression: the state of one exercise
// performed for a program lift at one tier (a "variant"), how a variant is chosen and
// seeded, and what the GZCLP rules do to it after a session, in dumbbell steps and up to
// the heaviest dumbbell (the cap policy). Pure: no React, no database, no clock.
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { barbellToBothHands, barbellToDumbbell, ceilToStep, roundToStep } from "@/lib/dbConversion";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { asLifted, homeReentryWeight, priorFor, type StrengthSet } from "@/lib/strength";
import {
  RESET_FACTOR,
  T1_NEXT_STAGE,
  T2_NEXT_STAGE,
  T3_LAST_SET_INCREASE_REPS,
  getHoldReason,
  outcomeRuleId,
} from "@/lib/progression";
import type {
  EquipmentProfile,
  ExerciseAdaptation,
  HomePrescription,
  LiftState,
  ProgressionOutcomeKind,
  ProgressionOutcomeReason,
  SetLog,
  T1Stage,
  T2Stage,
  VariantCapAction,
  VariantOutcome,
  VariantPoint,
  VariantState,
} from "@/types";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "./prescription";
import { pooledEstimateOf } from "./strength";

export type VariantTier = VariantState["tier"];

/** How many recent last-set rep counts a variant keeps. */
export const VARIANT_TRACKING_WINDOW = 5;

/** The scheme of a T3 lift when none is given: every T3 slot of the templates is 3x15. */
export const DEFAULT_T3_SCHEME = { sets: 3, reps: 15 } as const;

/**
 * Reps added to every set when a pass at the heaviest dumbbell cannot add weight: the
 * gap between the first two stages' reps, so T2 goes 3x10 -> 3x12 (one stage's reps up)
 * and T1 5x3 -> 5x4. T3 already asks for as many reps as you can on its last set, so it
 * adds none and stays at the heaviest dumbbell.
 *
 * @evidence cap-progression
 */
export const CAP_REP_STEP: Readonly<Record<VariantTier, number>> = {
  T1: T1_STAGE_SCHEME["5x3"].reps - T1_STAGE_SCHEME["6x2"].reps,
  T2: T2_STAGE_SCHEME["3x10"].reps - T2_STAGE_SCHEME["3x8"].reps,
  T3: 0,
};

/**
 * The cap policy's "next harder variant": for an exercise at the heaviest dumbbell, the
 * exercise of the same lift's home chain (HOME_SUBSTITUTE_CHAINS) that is harder at the
 * same load. The chains are ordered by what fits the dumbbells, not by difficulty (a
 * floor press is easier than a bench press, a lunge than a split squat), so the harder
 * one is named here. A heuristic; an exercise not listed has no harder variant and, at
 * the cap, progresses by reps.
 *
 * @evidence cap-progression
 */
export const HARDER_HOME_VARIANT: Readonly<Record<string, string>> = {
  goblet_squat: "bulgarian_split_squat",
  db_lunge: "bulgarian_split_squat",
  db_floor_press: "db_bench",
  db_rdl: "single_leg_db_rdl",
  db_shoulder_press: "db_arnold_press",
};

const T1_STAGES = Object.keys(T1_STAGE_SCHEME) as T1Stage[];
const T2_STAGES = Object.keys(T2_STAGE_SCHEME) as T2Stage[];

/** The id of a variant state: "squat|bulgarian_split_squat|T1". */
export function variantKey(liftId: string, exerciseId: string, tier: VariantTier): string {
  return `${liftId}|${exerciseId}|${tier}`;
}

export function isVariantTier(tier: string): tier is VariantTier {
  return tier === "T1" || tier === "T2" || tier === "T3";
}

/** True when the exercise is done with a dumbbell in each hand (its weight is per hand). */
export function isPerHandExercise(exerciseId: string): boolean {
  return EXERCISES[exerciseId]?.grip === "per_hand";
}

/** The total load lifted: two dumbbells when the weight is per hand, else one. */
export function totalLoad(perHand: boolean, weight: number): number {
  return perHand ? weight * 2 : weight;
}

/** The home exercises that may stand in for a program lift: its substitute and its chain. */
export function homeOptionsFor(liftId: string): string[] {
  const primary = EXERCISES[liftId]?.dumbbellAlternative;
  const chain = HOME_SUBSTITUTE_CHAINS[liftId] ?? [];
  return [...new Set([...(primary ? [primary] : []), ...chain])];
}

/** The program lift's weight at a tier, in barbell terms (0 with no lift state). */
export function liftWeightAt(liftState: LiftState | undefined, tier: VariantTier): number {
  if (!liftState) return 0;
  return tier === "T1" ? liftState.t1Weight : tier === "T2" ? liftState.t2Weight : liftState.t3Weight;
}

/** Sets and reps a variant prescribes: its stage's scheme (T3: the template's), plus `extraReps`. */
export function variantScheme(
  state: Pick<VariantState, "tier" | "stage" | "extraReps">,
  t3Scheme: { sets: number; reps: number } = DEFAULT_T3_SCHEME
): { sets: number; reps: number } {
  const base =
    state.tier === "T1"
      ? T1_STAGE_SCHEME[(state.stage as T1Stage) ?? "5x3"] ?? T1_STAGE_SCHEME["5x3"]
      : state.tier === "T2"
        ? T2_STAGE_SCHEME[(state.stage as T2Stage) ?? "3x10"] ?? T2_STAGE_SCHEME["3x10"]
        : t3Scheme;
  return { sets: base.sets, reps: base.reps + (state.extraReps ?? 0) };
}

export interface VariantSeedInput {
  liftId: string;
  exerciseId: string;
  tier: VariantTier;
  /** The program lift's weight at this tier, in barbell terms. */
  barbellWeight: number;
  /** Reps per set of the stage the variant starts at (the estimate rule is worked for them). */
  targetReps: number;
  equipment: EquipmentProfile;
  /** Every logged set as strength evidence (`strengthSetsOf`); left out, no estimate is used. */
  strengthSets?: readonly StrengthSet[];
}

export interface VariantSeedWeight {
  /** As lifted: per hand for a per-hand exercise. */
  weight: number;
  /** What the seed asked for when it was more than the heaviest dumbbell. */
  cappedFrom?: number;
  source: "estimate" | "ratio" | "conversion";
  /** For "estimate" and "ratio": the exercise's starting ratio to the lift. */
  ratio?: number;
  /** For "estimate": the pooled strength estimate it was worked from. */
  estimate?: number;
}

/**
 * The first weight of a home exercise nothing has been logged for (H3).
 *
 * With a starting ratio for the exercise (`TRANSFER_PRIORS`) and a pooled strength
 * estimate for the program lift (from `strengthSets`): the heaviest weight at which the
 * estimate, through that ratio, says the stage's reps are possible, rounded down to the
 * dumbbell step (`homeReentryWeight` with no last weight; source "estimate"). With the
 * ratio and no estimate (no barbell or home T1 set yet): the ratio times the barbell
 * working weight, as lifted, rounded to the dumbbell step (source "ratio"). An exercise
 * with no starting ratio keeps the flat conversion, 80% of the barbell weight (source
 * "conversion"). Every one is capped at the heaviest dumbbell.
 *
 * @evidence home-progression
 */
export function seedVariantWeight(input: VariantSeedInput): VariantSeedWeight {
  const { liftId, exerciseId, barbellWeight, targetReps, equipment, strengthSets } = input;
  const step = equipment.dumbbellIncrementLbs;
  const capped = (wanted: number, seed: Omit<VariantSeedWeight, "weight" | "cappedFrom">): VariantSeedWeight =>
    wanted > equipment.maxDumbbellWeight
      ? { weight: equipment.maxDumbbellWeight, cappedFrom: wanted, ...seed }
      : { weight: wanted, ...seed };

  const prior = priorFor(liftId, exerciseId);
  if (!prior) {
    const wanted =
      EXERCISES[exerciseId]?.grip === "both_hands"
        ? barbellToBothHands(barbellWeight, step)
        : barbellToDumbbell(barbellWeight, step);
    return capped(wanted, { source: "conversion" });
  }

  const estimate = strengthSets ? (pooledEstimateOf(strengthSets, liftId)?.value ?? null) : null;
  if (estimate != null && estimate > 0) {
    const fromEstimate = homeReentryWeight({
      lastWeight: null,
      stepsEarned: 0,
      estimate,
      ratio: prior.ratio,
      exerciseId,
      targetReps,
      // Uncapped here: the cap is applied below, so `cappedFrom` says what was asked.
      equipment: { ...equipment, maxDumbbellWeight: Infinity },
    });
    if (fromEstimate) {
      return capped(fromEstimate.weight, { source: "estimate", ratio: prior.ratio, estimate });
    }
  }
  const total = prior.ratio * barbellWeight;
  const wanted = total > 0 ? roundToStep(asLifted(total, exerciseId), step) : 0;
  return capped(wanted, { source: "ratio", ratio: prior.ratio });
}

/**
 * A variant the first time it is used: its weight from `seedVariantWeight` (for the
 * stage the lift is at), its stage and fail count from the program lift's. Not current
 * and not stored until a session uses it.
 */
export function seedVariantState(input: {
  liftId: string;
  exerciseId: string;
  tier: VariantTier;
  liftState: LiftState | undefined;
  equipment: EquipmentProfile;
  /** Every logged set as strength evidence; left out, the seed uses no estimate. */
  strengthSets?: readonly StrengthSet[];
}): VariantState {
  const { liftId, exerciseId, tier, liftState, equipment, strengthSets } = input;
  const barbellWeight = liftWeightAt(liftState, tier);
  const stage: VariantState["stage"] =
    tier === "T1" ? (liftState?.t1Stage ?? "5x3") : tier === "T2" ? (liftState?.t2Stage ?? "3x10") : null;
  const targetReps = variantScheme({ tier, stage, extraReps: 0 }).reps;
  const seed = seedVariantWeight({
    liftId,
    exerciseId,
    tier,
    barbellWeight,
    targetReps,
    equipment,
    ...(strengthSets ? { strengthSets } : {}),
  });
  return {
    id: variantKey(liftId, exerciseId, tier),
    liftId,
    exerciseId,
    tier,
    weight: seed.weight,
    perHand: isPerHandExercise(exerciseId),
    stage,
    failCount: tier === "T1" ? (liftState?.t1FailCount ?? 0) : tier === "T2" ? (liftState?.t2FailCount ?? 0) : 0,
    extraReps: 0,
    lastResetWeight: null,
    lastSessionDate: null,
    recentLastSetReps: [],
    current: false,
    passesSinceGym: 0,
    seed: {
      source: seed.source,
      barbellWeight,
      ...(seed.cappedFrom != null ? { cappedFrom: seed.cappedFrom } : {}),
      ...(seed.ratio != null ? { ratio: seed.ratio } : {}),
      ...(seed.estimate != null ? { estimate: seed.estimate, targetReps } : {}),
    },
  };
}

export interface HomeVariantInput {
  liftId: string;
  tier: VariantTier;
  liftState: LiftState | undefined;
  variantStates: readonly VariantState[];
  equipment: EquipmentProfile;
  /** The substitute picked on Configure for this lift, if any. */
  overrideId?: string;
  /** Every logged set as strength evidence, for seeding a variant never used (H3). */
  strengthSets?: readonly StrengthSet[];
}

export interface HomeVariantChoice {
  /** The stored variant, or a fresh seed when it has never been used. */
  state: VariantState;
  seeded: boolean;
  /** The weight to plan: the state's, capped at the heaviest dumbbell. */
  weight: number;
  /** The weight asked for when `weight` is capped. */
  cappedFrom?: number;
  /** Today's conversion for the lift, for its alternatives and warning. */
  adaptation: ExerciseAdaptation;
}

/**
 * Which home exercise a program lift is planned with, at what weight. Null when the lift
 * needs no substitute (it works at home) or has none.
 *
 * The exercise: a substitute picked on Configure (one of the conversion's alternatives,
 * as before), else the lift's current variant at this tier, else today's conversion
 * pick. The weight: the variant's own, or for a variant never used, its seed
 * (`seedVariantWeight`: the pooled estimate through the exercise's starting ratio when
 * `strengthSets` give one, else the ratio times the barbell weight).
 *
 * @evidence home-progression
 */
export function chooseHomeVariant(input: HomeVariantInput): HomeVariantChoice | null {
  const { liftId, tier, liftState, variantStates, equipment, overrideId, strengthSets } = input;
  const exercise = EXERCISES[liftId];
  if (!exercise) return null;
  const adaptation = adaptExerciseForHome(
    exercise,
    liftWeightAt(liftState, tier),
    equipment,
    exercise.dumbbellAlternative ? EXERCISES[exercise.dumbbellAlternative] : undefined
  );
  // "no_substitute" and exercises that already work at home come back as themselves.
  if (adaptation.adaptedExercise.id === exercise.id) return null;

  const overridden = overrideId
    ? adaptation.alternatives.find((alt) => alt.exercise.id === overrideId)?.exercise.id
    : undefined;
  const current = variantStates.find((v) => v.liftId === liftId && v.tier === tier && v.current);
  const exerciseId = overridden ?? current?.exerciseId ?? adaptation.adaptedExercise.id;

  const stored = variantStates.find((v) => v.id === variantKey(liftId, exerciseId, tier));
  const state =
    stored ??
    seedVariantState({
      liftId,
      exerciseId,
      tier,
      liftState,
      equipment,
      ...(strengthSets ? { strengthSets } : {}),
    });
  const max = equipment.maxDumbbellWeight;
  const weight = Math.min(state.weight, max);
  const cappedFrom = state.weight > max ? state.weight : stored ? undefined : state.seed.cappedFrom;
  return {
    state,
    seeded: !stored,
    weight,
    ...(cappedFrom != null ? { cappedFrom } : {}),
    adaptation,
  };
}

/** The home part of a session's stored prescription, from a variant choice. */
export function homePrescriptionOf(
  choice: HomeVariantChoice,
  t3Scheme?: { sets: number; reps: number }
): HomePrescription {
  const { state } = choice;
  const scheme = variantScheme(state, t3Scheme);
  return {
    exerciseId: state.exerciseId,
    weight: choice.weight,
    perHand: state.perHand,
    ...(state.stage ? { stage: state.stage } : {}),
    sets: scheme.sets,
    reps: scheme.reps,
  };
}

/**
 * A variant with a session's stored home prescription laid over it (rule 4 for home
 * exercises): its weight, stage and reps become what was prescribed. The fail count
 * follows the stage as `anchorToPrescription` does for a lift. The steps gym passes had
 * earned for it are used up: the prescription already took them in (re-entry, H6).
 */
export function anchorVariant(
  state: VariantState,
  home: HomePrescription,
  t3Scheme: { sets: number; reps: number } = DEFAULT_T3_SCHEME
): VariantState {
  let stage = state.stage;
  let failCount = state.failCount;
  if (state.tier === "T1" && home.stage && T1_STAGES.includes(home.stage as T1Stage)) {
    stage = home.stage;
    if (stage !== state.stage) failCount = T1_STAGES.indexOf(stage as T1Stage);
  } else if (state.tier === "T2" && home.stage && T2_STAGES.includes(home.stage as T2Stage)) {
    stage = home.stage;
    if (stage !== state.stage) failCount = T2_STAGES.indexOf(stage as T2Stage);
  }
  const baseReps = variantScheme({ tier: state.tier, stage, extraReps: 0 }, t3Scheme).reps;
  return {
    ...withoutGymPasses(state),
    weight: home.weight,
    perHand: home.perHand,
    stage,
    failCount,
    extraReps: Math.max(0, home.reps - baseReps),
  };
}

/** The variant with no steps earned at the gym: absent means 0. */
export function withoutGymPasses(state: VariantState): VariantState {
  if (state.gymPassesSinceHome === undefined) return state;
  const rest: VariantState = { ...state };
  delete rest.gymPassesSinceHome;
  return rest;
}

/**
 * Passes at home since the lift was last done at this tier as itself: steps re-entry may add (H6).
 *
 * @evidence home-progression
 */
export function homeStepsEarned(
  variantStates: readonly VariantState[],
  liftId: string,
  tier: VariantTier
): number {
  return variantStates
    .filter((v) => v.liftId === liftId && v.tier === tier)
    .reduce((sum, v) => sum + v.passesSinceGym, 0);
}

export interface EvaluateVariantInput {
  /** The variant as prescribed going in (anchored, capped at the heaviest dumbbell). */
  state: VariantState;
  /** The entry's working sets (`workingSetsFor`), in logging order. */
  sets: SetLog[];
  /** Fewer working sets than prescribed: neither a pass nor a miss. */
  partial: boolean;
  /** Every deciding set was heavier than prescribed: the lightest of them, else null. */
  heavier: number | null;
  equipment: EquipmentProfile;
  /** The program lift's state, for seeding a harder variant. */
  liftState: LiftState | undefined;
  /** Every variant state going in, for the harder variant's own weight. */
  variantStates: readonly VariantState[];
  /** T3's sets and reps (the template's). */
  t3Scheme?: { sets: number; reps: number };
  now: Date;
  /** Strength sets before the session, for seeding a harder variant never used (H3). */
  strengthSets?: readonly StrengthSet[];
}

export interface VariantEvaluation {
  state: VariantState;
  outcome: VariantOutcome;
  /** The harder variant planned next when the cap policy moved on; it is now current. */
  switchedTo?: VariantState;
}

function pointOf(state: VariantState, t3Scheme?: { sets: number; reps: number }): VariantPoint {
  return {
    exerciseId: state.exerciseId,
    weight: state.weight,
    perHand: state.perHand,
    ...(state.stage ? { stage: state.stage } : {}),
    reps: variantScheme(state, t3Scheme).reps,
  };
}

/** The outcome of a variant nothing was evaluated for (not done, only logged). */
export function unchangedVariantOutcome(
  state: VariantState,
  kind: ProgressionOutcomeKind,
  reason?: ProgressionOutcomeReason,
  t3Scheme?: { sets: number; reps: number }
): VariantOutcome {
  const point = pointOf(state, t3Scheme);
  return {
    variantId: state.id,
    liftId: state.liftId,
    exerciseId: state.exerciseId,
    tier: state.tier,
    kind,
    ...(reason ? { reason } : {}),
    from: point,
    to: { ...point },
    ruleId: outcomeRuleId(state.tier, reason),
  };
}

/**
 * What the program rules do to a home exercise after a session, in its own weight and
 * scheme: the GZCLP rules in dumbbell steps (`dumbbellIncrementLbs`), with the cap
 * policy where the heaviest dumbbell stops a pass from adding weight.
 *
 * Branch order as for a lift: a set skipped or reduced for pain, a run or equipment (and
 * for T2 an accepted load drop) holds; fewer sets than prescribed is partial; a miss at a
 * weight heavier than prescribed holds; then pass, one stage down, or reset to
 * RESET_FACTOR of the weight after the last stage (rounded to the dumbbell step). A miss
 * or a reset clears any reps the cap policy added.
 *
 * A pass adds one dumbbell step, up to the heaviest dumbbell. At the heaviest dumbbell:
 * the next harder variant (HARDER_HOME_VARIANT) at a weight whose total load is not
 * lighter, when the dumbbells allow one; otherwise CAP_REP_STEP more reps a set. A pass
 * of any kind counts one step earned at home (`passesSinceGym`).
 *
 * @evidence home-progression
 * @evidence cap-progression
 */
export function evaluateVariant(input: EvaluateVariantInput): VariantEvaluation {
  const { sets, partial, heavier, equipment, now, t3Scheme } = input;
  const start = input.state;
  const tier = start.tier;
  const step = equipment.dumbbellIncrementLbs;
  const max = equipment.maxDumbbellWeight;
  const from = pointOf(start, t3Scheme);

  const result = (
    state: VariantState,
    kind: ProgressionOutcomeKind,
    reason?: ProgressionOutcomeReason,
    cap?: VariantCapAction,
    switchedTo?: VariantState
  ): VariantEvaluation => ({
    state,
    outcome: {
      variantId: start.id,
      liftId: start.liftId,
      exerciseId: start.exerciseId,
      tier,
      kind,
      ...(reason ? { reason } : {}),
      from,
      to: pointOf(state, t3Scheme),
      ...(cap ? { cap } : {}),
      ruleId: outcomeRuleId(tier, reason),
    },
    ...(switchedTo ? { switchedTo } : {}),
  });

  // Done at home: any steps the gym had earned for it are behind it now.
  const performed: VariantState = { ...withoutGymPasses(start), current: true, lastSessionDate: now };
  const hold = getHoldReason(tier, sets);
  if (partial) return result(performed, hold ? "held" : "partial", hold ?? undefined);

  const lastReps = sets[sets.length - 1]?.actualReps ?? 0;
  const evaluated: VariantState = {
    ...performed,
    recentLastSetReps: [...start.recentLastSetReps, lastReps].slice(-VARIANT_TRACKING_WINDOW),
  };
  if (hold) return result(evaluated, "held", hold);
  if (heavier != null && sets.some((set) => set.status === "failed")) {
    return result(evaluated, "held", "heavier");
  }
  const working: VariantState = heavier != null ? { ...evaluated, weight: heavier } : evaluated;
  const heavierReason = heavier != null ? ("heavier" as const) : undefined;

  /** A pass: one dumbbell step, up to the heaviest dumbbell, then the cap policy. */
  const passed = (kind: "passed" | "t3Up"): VariantEvaluation => {
    const earned: VariantState = {
      ...working,
      failCount: 0,
      passesSinceGym: working.passesSinceGym + 1,
    };
    if (working.weight < max) {
      return result({ ...earned, weight: Math.min(working.weight + step, max) }, kind, heavierReason);
    }
    const harder = harderVariantFor(earned, input);
    if (harder) {
      const cap: VariantCapAction = {
        policy: "harderVariant",
        maxDumbbellWeight: max,
        to: { variantId: harder.id, exerciseId: harder.exerciseId, weight: harder.weight },
      };
      return result({ ...earned, current: false }, kind, heavierReason, cap, harder);
    }
    const repsFrom = variantScheme(earned, t3Scheme).reps;
    const next: VariantState = { ...earned, extraReps: earned.extraReps + CAP_REP_STEP[tier] };
    const cap: VariantCapAction = {
      policy: "reps",
      maxDumbbellWeight: max,
      repsFrom,
      repsTo: variantScheme(next, t3Scheme).reps,
    };
    return result(next, tier === "T3" ? "t3Same" : kind, heavierReason ?? (tier === "T3" ? "lastSet" : undefined), cap);
  };

  if (tier === "T3") {
    if (lastReps >= T3_LAST_SET_INCREASE_REPS) return passed("t3Up");
    // Kept at a heavier weight than prescribed, it went up because of it.
    return heavier != null
      ? result(working, "t3Up", "heavier")
      : result(working, "t3Same", "lastSet");
  }

  const targetReps = variantScheme(working).reps;
  const isPass = sets.every((set) => set.status !== "failed" && set.actualReps >= targetReps);
  if (isPass) return passed("passed");

  const stage = working.stage as T1Stage | T2Stage;
  const next = tier === "T1" ? T1_NEXT_STAGE[stage as T1Stage] : T2_NEXT_STAGE[stage as T2Stage];
  if (next === "reset" || next == null) {
    return result(
      {
        ...working,
        weight: roundToStep(working.weight * RESET_FACTOR, step),
        stage: tier === "T1" ? T1_STAGES[0] : T2_STAGES[0],
        failCount: 0,
        extraReps: 0,
        lastResetWeight: working.weight,
      },
      "reset",
      heavierReason
    );
  }
  return result(
    { ...working, stage: next, failCount: working.failCount + 1, extraReps: 0 },
    "stageDown",
    heavierReason
  );
}

/**
 * The harder variant a capped pass moves to, or null when there is none or the heaviest
 * dumbbell cannot give it a total load at least as heavy as the capped one. Its weight is
 * its own (a variant used before) or its seed, raised to the lightest weight that is not
 * lighter in total, never past the heaviest dumbbell. A variant never used starts at the
 * capped variant's stage.
 */
function harderVariantFor(capped: VariantState, input: EvaluateVariantInput): VariantState | null {
  const harderId = HARDER_HOME_VARIANT[capped.exerciseId];
  if (!harderId || !homeOptionsFor(capped.liftId).includes(harderId)) return null;
  const { equipment, liftState, variantStates, strengthSets } = input;
  const max = equipment.maxDumbbellWeight;
  const perHand = isPerHandExercise(harderId);
  const notLighter = ceilToStep(
    totalLoad(capped.perHand, capped.weight) / (perHand ? 2 : 1),
    equipment.dumbbellIncrementLbs
  );
  if (notLighter > max) return null;

  const id = variantKey(capped.liftId, harderId, capped.tier);
  const existing = variantStates.find((v) => v.id === id);
  const base: VariantState = existing ?? {
    ...seedVariantState({
      liftId: capped.liftId,
      exerciseId: harderId,
      tier: capped.tier,
      liftState,
      equipment,
      ...(strengthSets ? { strengthSets } : {}),
    }),
    stage: capped.stage,
    failCount: capped.failCount,
  };
  return {
    ...base,
    weight: Math.min(max, Math.max(base.weight, notLighter)),
    current: true,
    seed: existing
      ? existing.seed
      : { ...base.seed, source: "harderVariant", fromVariantId: capped.id },
  };
}
