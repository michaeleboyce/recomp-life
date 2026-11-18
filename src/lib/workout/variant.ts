// Home exercises with their own weight and progression: the state of one exercise
// performed for a program lift at one tier (a "variant"), how a variant is chosen and
// seeded, and what the GZCLP rules do to it after a session, in dumbbell steps and up to
// the heaviest dumbbell (the cap policy). Pure: no React, no database, no clock.
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { barbellToBothHands, barbellToDumbbell, ceilToStep, roundToStep } from "@/lib/dbConversion";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { asLifted, impliedWeightForReps, priorFor, roundDownToDumbbell, type StrengthSet } from "@/lib/strength";
import {
  RESET_FACTOR,
  T1_NEXT_STAGE,
  T2_NEXT_STAGE,
  getHoldReason,
  outcomeRuleId,
  t3IncreaseThreshold,
} from "@/lib/progression";
import type {
  EquipmentProfile,
  ExerciseAdaptation,
  HomePrescription,
  LiftState,
  ProgressionOutcomeKind,
  ProgressionOutcomeReason,
  SetLog,
  RepsInReserve,
  T1Stage,
  T2Stage,
  VariantCapAction,
  VariantOutcome,
  VariantPoint,
  VariantState,
} from "@/types";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "./prescription";
import { ownHistoryOf, pooledEstimateOf, transferRatioOf } from "./strength";

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
  /** Every set as strength evidence, app and imported (`strengthEvidenceOf`); left out, no estimate is used. */
  strengthSets?: readonly StrengthSet[];
}

/** The exercise's own session a first weight was worked from (source "history"). */
export interface VariantSeedSession {
  /** When its best set was done, epoch ms. */
  at: number;
  sessionId: string;
  /** Its best set, as lifted. */
  weight: number;
  reps: number;
  perHand: boolean;
  repsInReserve: RepsInReserve | null;
  /** The session was imported from another app. */
  imported?: true;
}

export interface VariantSeedWeight {
  /** As lifted: per hand for a per-hand exercise. */
  weight: number;
  /** What the seed asked for when it was more than the heaviest dumbbell. */
  cappedFrom?: number;
  /**
   * "history": the exercise's own recent estimate. "learned": the program lift's pooled
   * estimate through the ratio learned from the lifter's pairs. "estimate": the pooled
   * estimate through the starting ratio. "ratio": the starting ratio times the barbell
   * weight. "conversion": the flat dumbbell conversion.
   */
  source: "history" | "learned" | "estimate" | "ratio" | "conversion";
  /** For "learned", "estimate" and "ratio": the exercise's ratio to the lift. */
  ratio?: number;
  /** For "learned": the lifter's session pairs the ratio was learned from. */
  pairs?: number;
  /** For "learned" and "estimate": the program lift's pooled strength estimate. */
  estimate?: number;
  /** For "history": the exercise's own estimated max (total load). */
  ownEstimate?: number;
  /** For "history": the session that estimate came from. */
  session?: VariantSeedSession;
  /**
   * For "history", when it held the seed down: the heaviest weight, as lifted, the
   * exercise was done at inside the evidence window (OWN_HISTORY_WINDOW_WEEKS). The seed
   * is then that plus one dumbbell step.
   */
  heaviestLifted?: number;
  /** The seed was held down to `heaviestLifted` plus one step. */
  limitedByHeaviest?: true;
  /** When the exercise was last done at all (epoch ms), when it was and the seed is not from its history. */
  lastDone?: number;
}

/**
 * The heaviest weight, as lifted, at which an estimated max (total load) says `reps`
 * reps are possible, rounded down to the dumbbell step: the strength library's rule
 * (`impliedWeightForReps`, `roundDownToDumbbell`), uncapped.
 */
function weightForReps(estimatedMax: number, exerciseId: string, reps: number, step: number): number {
  return roundDownToDumbbell(asLifted(impliedWeightForReps(estimatedMax, reps), exerciseId), step);
}

/**
 * The first weight of a home exercise with no state of its own (H3, F6), for T1, T2 and
 * T3 alike, in this order:
 *
 * 1. Its own history: when `strengthSets` (app and imported) give the exercise an
 *    estimate from its sets in the last OWN_HISTORY_WINDOW_WEEKS (`ownHistoryOf`: its
 *    latest session's, effort credited), the heaviest weight at which that estimate says
 *    the stage's reps are possible, as lifted, rounded down to the dumbbell step
 *    (source "history"), and never more than one dumbbell step above the heaviest
 *    weight the exercise was lifted at inside the window (a first session does not jump
 *    past what was done; `limitedByHeaviest`).
 * 2. Else the program lift's pooled estimate through the exercise's ratio: the ratio
 *    learned from the lifter's own pairs when there are any (`transferRatioOf`, source
 *    "learned"), else the starting ratio (`TRANSFER_PRIORS`, source "estimate"), for the
 *    stage's reps, rounded down.
 * 3. Else, with a starting ratio, the ratio times the barbell working weight, as lifted,
 *    rounded to the step (source "ratio"); with none, the flat conversion, 80% of the
 *    barbell weight (source "conversion").
 *
 * Every one is capped at the heaviest dumbbell (`cappedFrom`). A seed not from the
 * exercise's own history says when it was last done, if ever (`lastDone`).
 * Weights set by hand and not lifted are not the exercise's history; a weight set by
 * hand wins over any seed, since it gives the variant a state of its own.
 *
 * @evidence home-progression
 * @evidence transfer-ratio
 */
export function seedVariantWeight(input: VariantSeedInput): VariantSeedWeight {
  const { liftId, exerciseId, barbellWeight, targetReps, equipment, strengthSets } = input;
  const step = equipment.dumbbellIncrementLbs;
  const own = strengthSets ? ownHistoryOf(strengthSets, exerciseId) : null;
  const bound = own?.heaviest != null ? roundDownToDumbbell(own.heaviest + step, step) : null;
  const finish = (wanted: number, seed: Omit<VariantSeedWeight, "weight" | "cappedFrom">): VariantSeedWeight => {
    // Rule 1's limit. The pooled estimate through a ratio (rules 2 and 3) is not held to
    // it: the lift's own sessions say more about it than a lighter tier's sets of the exercise.
    const limited = seed.source === "history" && bound != null && wanted > bound;
    const asked = limited ? bound : wanted;
    const base = {
      ...seed,
      ...(limited ? { heaviestLifted: own!.heaviest!, limitedByHeaviest: true as const } : {}),
      ...(seed.source !== "history" && own?.lastDone != null ? { lastDone: own.lastDone } : {}),
    };
    return asked > equipment.maxDumbbellWeight
      ? { weight: equipment.maxDumbbellWeight, cappedFrom: asked, ...base }
      : { weight: asked, ...base };
  };

  // 1. The exercise's own recent history.
  const ownEstimate = own?.estimate;
  if (ownEstimate?.own && ownEstimate.value > 0 && strengthSets) {
    const best = ownEstimate.own.bestSet;
    const imported = strengthSets.find((s) => s.id === best.id)?.imported === true;
    return finish(weightForReps(ownEstimate.value, exerciseId, targetReps, step), {
      source: "history",
      ownEstimate: ownEstimate.value,
      session: {
        at: ownEstimate.own.date.getTime(),
        sessionId: ownEstimate.own.sessionId,
        weight: best.weight,
        reps: best.reps,
        perHand: best.perHand,
        repsInReserve: best.repsInReserve,
        ...(imported ? { imported: true as const } : {}),
      },
    });
  }

  // 2. The program lift's estimate through the learned, else the starting, ratio.
  const prior = priorFor(liftId, exerciseId);
  const learned = strengthSets ? transferRatioOf(strengthSets, liftId, exerciseId) : null;
  const ratio =
    learned && learned.basis === "learned" && learned.ratio > 0
      ? { value: learned.ratio, pairs: learned.pairs }
      : prior
        ? { value: prior.ratio, pairs: 0 }
        : null;
  const estimate = strengthSets ? (pooledEstimateOf(strengthSets, liftId)?.value ?? null) : null;
  if (ratio && estimate != null && estimate > 0) {
    return finish(
      weightForReps(estimate * ratio.value, exerciseId, targetReps, step),
      ratio.pairs > 0
        ? { source: "learned", ratio: ratio.value, pairs: ratio.pairs, estimate }
        : { source: "estimate", ratio: ratio.value, estimate }
    );
  }

  // 3. The barbell weight: through the starting ratio, else the flat conversion.
  if (!prior) {
    const wanted =
      EXERCISES[exerciseId]?.grip === "both_hands"
        ? barbellToBothHands(barbellWeight, step)
        : barbellToDumbbell(barbellWeight, step);
    return finish(wanted, { source: "conversion" });
  }
  const total = prior.ratio * barbellWeight;
  const wanted = total > 0 ? roundToStep(asLifted(total, exerciseId), step) : 0;
  return finish(wanted, { source: "ratio", ratio: prior.ratio });
}

/**
 * A variant the first time it is used: its weight from `seedVariantWeight` (for the
 * stage the lift is at), its stage and fail count from the program lift's. Not current
 * and not stored until a session uses it. A seed from the exercise's own history names
 * the session it came from (`seed.history`); any other says when the exercise was last
 * done, when it was (`seed.lastDone`).
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
  const session = seed.source === "history" ? seed.session : undefined;
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
      ...(seed.pairs != null ? { pairs: seed.pairs } : {}),
      ...(seed.estimate != null ? { estimate: seed.estimate, targetReps } : {}),
      ...(seed.ownEstimate != null ? { ownEstimate: seed.ownEstimate, targetReps } : {}),
      ...(session
        ? {
            history: {
              at: session.at,
              weight: session.weight,
              reps: session.reps,
              perHand: session.perHand,
              sessionId: session.sessionId,
              ...(session.repsInReserve != null ? { repsInReserve: session.repsInReserve } : {}),
              ...(session.imported ? { imported: true as const } : {}),
            },
          }
        : {}),
      ...(seed.heaviestLifted != null ? { heaviestLifted: seed.heaviestLifted } : {}),
      ...(seed.limitedByHeaviest ? { limitedByHeaviest: true as const } : {}),
      ...(seed.lastDone != null ? { lastDone: seed.lastDone } : {}),
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
 * as before, or any home option of the lift, from the swap sheet), else the lift's current variant at this tier, else today's conversion
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

  // A substitute picked on Configure or in the swap sheet: one of the conversion's
  // alternatives, or any home option of the lift (the swap sheet offers them all).
  const overridden = overrideId
    ? (adaptation.alternatives.find((alt) => alt.exercise.id === overrideId)?.exercise.id ??
      (homeOptionsFor(liftId).includes(overrideId) && EXERCISES[overrideId] ? overrideId : undefined))
    : undefined;
  // A current variant left from an older catalogue (its exercise gone, or no longer a
  // home option for the lift) is passed over: the plan never names an unknown exercise.
  const options = new Set([
    ...homeOptionsFor(liftId),
    adaptation.adaptedExercise.id,
    ...adaptation.alternatives.map((alt) => alt.exercise.id),
  ]);
  const current = variantStates.find(
    (v) =>
      v.liftId === liftId && v.tier === tier && v.current && EXERCISES[v.exerciseId] && options.has(v.exerciseId)
  );
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

/**
 * The home weights set by hand and not lifted yet, each as one provisional set: the
 * weight as set, at the scheme's reps, taken as far as it goes on T1 (so it reads as
 * those reps at the most the lifter could do: a cautious reading of a target), dated
 * when it was set. Only states with `plannedWeight` (an override not lifted since) and
 * a date give one. The pooled estimate counts each at TARGET_EVIDENCE.weight of a
 * logged session until the exercise is logged after it.
 *
 * @evidence target-evidence
 */
export function targetStrengthSets(variantStates: readonly VariantState[]): StrengthSet[] {
  const out: StrengthSet[] = [];
  for (const state of variantStates) {
    if (state.plannedWeight === undefined || !state.setByHandAt || !(state.weight > 0)) continue;
    const date = new Date(state.setByHandAt);
    if (Number.isNaN(date.getTime())) continue;
    out.push({
      id: `target:${state.id}`,
      sessionId: `target:${state.id}`,
      exerciseId: state.exerciseId,
      weight: state.weight,
      perHand: state.perHand,
      reps: variantScheme(state).reps,
      repsInReserve: null,
      role: "working",
      tier: state.tier,
      isAMRAP: state.tier === "T1",
      date,
      provisional: true,
    });
  }
  return out;
}

/** The note on a manual change that puts a home exercise or a barbell tier back on the plan's weight. */
export const BACK_TO_PLAN_NOTE = "Back to the plan's weight";

/**
 * The plan's weight to keep beside a weight set by hand (E7): the weight before the
 * first change since it was last logged (`plannedWeight` when one is already kept,
 * else the weight as it stood). `undefined` when the change ends the override: going
 * back to the plan (`backToPlan`) or setting the plan's weight itself. Shared by home
 * exercises (`withHandSetWeight`) and the barbell tiers (`t1PlannedWeight` etc.).
 */
export function plannedWeightAfterHandSet(
  before: { weight: number; plannedWeight?: number },
  weight: number,
  backToPlan: boolean
): number | undefined {
  const planned = before.plannedWeight ?? before.weight;
  return backToPlan || weight === planned ? undefined : planned;
}

/**
 * `next` (the state with a weight set by hand at `at`) with the override recorded
 * against `before`, the state as the plan had it: `plannedWeight` keeps the plan's
 * weight (`plannedWeightAfterHandSet`) and `setByHandAt` says when. Going back to the
 * plan (`backToPlan`, or a weight equal to the plan's) ends the override: both are
 * cleared and the plan decides again.
 */
export function withHandSetWeight(
  before: VariantState,
  next: VariantState,
  at: Date,
  backToPlan = false
): VariantState {
  const planned = plannedWeightAfterHandSet(before, next.weight, backToPlan);
  const out: VariantState = { ...next };
  if (planned === undefined) {
    delete out.plannedWeight;
    delete out.setByHandAt;
    return out;
  }
  return { ...out, plannedWeight: planned, setByHandAt: at };
}

/** `state` as logged: a weight set by hand has been lifted, so it is the plan's now. */
export function withoutHandOverride(state: VariantState): VariantState {
  if (state.plannedWeight === undefined) return state;
  const rest: VariantState = { ...state };
  delete rest.plannedWeight;
  return rest;
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

/**
 * A home exercise's next weight after a pass, as lifted: one dumbbell step, up to the
 * heaviest dumbbell; null at the heaviest dumbbell, where the cap policy takes over.
 * The same step `evaluateVariant` takes.
 */
export function homeNextWeight(
  weight: number,
  equipment: Pick<EquipmentProfile, "dumbbellIncrementLbs" | "maxDumbbellWeight">
): number | null {
  const max = equipment.maxDumbbellWeight;
  return weight < max ? Math.min(weight + equipment.dumbbellIncrementLbs, max) : null;
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
 * A T3 goes up when its last set reaches the threshold for its next dumbbell step
 * (`t3IncreaseThreshold`); at the heaviest dumbbell there is none, so the maximum.
 *
 * @evidence home-progression
 * @evidence cap-progression
 * @evidence t3-progression
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
  const performed: VariantState = {
    ...withoutHandOverride(withoutGymPasses(start)),
    current: true,
    lastSessionDate: now,
  };
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
    const threshold = t3IncreaseThreshold({
      weight: working.weight,
      nextWeight: homeNextWeight(working.weight, equipment),
      targetReps: variantScheme(working, t3Scheme).reps,
    });
    if (lastReps >= threshold) return passed("t3Up");
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
