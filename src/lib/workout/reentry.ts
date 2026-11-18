// The first weight after a stretch at the other location (H6, spec decision 3), applied
// to the states a plan is built from. Pure: no React, no database, no clock.
import { getIncrement } from "@/lib/progression";
import {
  barbellReentryWeight,
  homeReentryWeight,
  type ReentryResult,
  type StrengthSet,
} from "@/lib/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { EquipmentProfile, LiftState, VariantState, WorkoutLocation, WorkoutTemplate } from "@/types";
import { progressionLiftType } from "./completeWorkout";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "./prescription";
import { pooledEstimateOf, transferRatioOf } from "./strength";
import type { PlanReentry, WorkoutPlan } from "./types";
import { chooseHomeVariant, homeStepsEarned, variantScheme } from "./variant";

/** The tiers re-entry applies to: the ones with a stage, a fail count and a last date. */
type ReentryTier = "T1" | "T2";

/** The key of a re-entry decision: "squat|T1". */
export function reentryKey(liftId: string, tier: string): string {
  return `${liftId}|${tier}`;
}

export interface ReentryInput {
  liftStates: readonly LiftState[];
  variantStates: readonly VariantState[];
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  /** Every set as strength evidence, app and imported (`strengthEvidenceOf`); without, only the steps rule. */
  strengthSets?: readonly StrengthSet[];
  /** Home substitutes picked on Configure (template exerciseId -> substitute id). */
  overrides?: Record<string, string>;
  /** The date being planned for (`chooseHomeVariant`'s seeds). */
  now?: Date;
  /**
   * The session's template: only its lifts, at its tiers, are resolved. Left out, every
   * program lift is (a projection of several workouts ahead).
   */
  template?: WorkoutTemplate;
}

export interface ReentryResolution {
  /** The lift states with each barbell re-entry weight in place. */
  liftStates: LiftState[];
  /** The variant states with each home re-entry weight in place. */
  variantStates: VariantState[];
  /** What decided each re-entry weight, by `reentryKey(liftId, tier)`. */
  reentries: Map<string, PlanReentry>;
}

/** The lifts that are a T1 or a T2 in the template, or in any template. */
function reentryLifts(only?: WorkoutTemplate): Array<{ liftId: string; tier: ReentryTier }> {
  const seen = new Set<string>();
  const out: Array<{ liftId: string; tier: ReentryTier }> = [];
  for (const template of only ? [only] : Object.values(WORKOUT_TEMPLATES)) {
    for (const ex of template.exercises) {
      if (ex.tier !== "T1" && ex.tier !== "T2") continue;
      const key = reentryKey(ex.exerciseId, ex.tier);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ liftId: ex.exerciseId, tier: ex.tier });
    }
  }
  return out;
}

const timeOf = (date: Date | string | null | undefined): number | null => {
  if (date == null) return null;
  const t = new Date(date).getTime();
  return Number.isFinite(t) ? t : null;
};

function lastBarbellTime(state: LiftState, tier: ReentryTier): number | null {
  return timeOf(tier === "T1" ? state.t1LastWorkoutDate : state.t2LastWorkoutDate);
}

/** The latest home session of any exercise standing in for the lift at this tier. */
function lastHomeTime(variants: readonly VariantState[], liftId: string, tier: ReentryTier): number | null {
  let latest: number | null = null;
  for (const v of variants) {
    if (v.liftId !== liftId || v.tier !== tier) continue;
    const t = timeOf(v.lastSessionDate);
    if (t != null && (latest == null || t > latest)) latest = t;
  }
  return latest;
}

function stageReps(state: LiftState, tier: ReentryTier): number {
  return tier === "T1" ? T1_STAGE_SCHEME[state.t1Stage].reps : T2_STAGE_SCHEME[state.t2Stage].reps;
}

function toPlanReentry(
  result: ReentryResult,
  extra: Omit<PlanReentry, "rule" | "weight" | "fromSteps" | "fromEstimate">
): PlanReentry {
  return {
    rule: result.rule,
    weight: result.weight,
    fromSteps: result.fromSteps,
    fromEstimate: result.fromEstimate,
    ...extra,
  };
}

/** The decision for a weight set by hand since the other location's last session: it stays. */
function handReentry(
  weight: number,
  setByHandAt: Date,
  extra: Omit<PlanReentry, "rule" | "weight" | "fromSteps" | "fromEstimate" | "setByHandAt">
): PlanReentry {
  return { rule: "hand", weight, fromSteps: null, fromEstimate: null, ...extra, setByHandAt };
}

/**
 * The states a plan at `location` is built from, with the first weight after a stretch
 * at the other location in place (spec decision 3). Only T1 and T2 lifts, the tiers
 * with a stage and a last date, and with `template` only that day's.
 *
 * At the gym: a lift whose home exercises were done at this tier after its last barbell
 * session takes `barbellReentryWeight`: the smaller of the last barbell weight plus the
 * steps the home passes earned (`homeStepsEarned`, one barbell increment each) and the
 * heaviest weight at which the pooled estimate says the stage's reps are possible,
 * rounded down to loadable plates.
 *
 * At home: the home exercise the plan will use (`chooseHomeVariant`), when it has a
 * weight of its own and the barbell lift was done at this tier after the last home
 * session, takes `homeReentryWeight`: the smaller of its last weight plus the steps the
 * gym passes earned (`gymPassesSinceHome`, one dumbbell step each) and the weight the
 * estimate allows through the exercise's learned ratio, rounded down to the dumbbell
 * step and capped at the heaviest dumbbell. A home exercise never used is seeded
 * instead (H3), so it is left alone here.
 *
 * A weight set by hand (`t1SetByHandAt`/`t2SetByHandAt` on the lift, `setByHandAt` on
 * the home exercise) at or after the other location's last session is the user's: it
 * stays as set, and the decision says so (rule "hand"). A later session at the other
 * location brings re-entry back.
 *
 * Every other state is returned as given. The estimate is the program lift's
 * `pooledLiftEstimate` over `strengthSets`, which every set feeds (home sets through
 * their ratio, drops discounted).
 *
 * @evidence strength-pooling
 * @evidence home-progression
 */
export function resolveReentry(input: ReentryInput): ReentryResolution {
  const { location, equipment, strengthSets } = input;
  const liftById = new Map(input.liftStates.map((state) => [state.exerciseId, state]));
  const variantById = new Map(input.variantStates.map((state) => [state.id, state]));
  const reentries = new Map<string, PlanReentry>();
  const estimateOf = (liftId: string) =>
    strengthSets ? (pooledEstimateOf(strengthSets, liftId)?.value ?? null) : null;

  for (const { liftId, tier } of reentryLifts(input.template)) {
    const liftState = liftById.get(liftId);
    if (!liftState) continue;
    const barbellAt = lastBarbellTime(liftState, tier);

    if (location === "gym") {
      const homeAt = lastHomeTime(input.variantStates, liftId, tier);
      if (homeAt == null || (barbellAt != null && homeAt <= barbellAt)) continue;
      const lastWeight = tier === "T1" ? liftState.t1Weight : liftState.t2Weight;
      const targetReps = stageReps(liftState, tier);
      const stepsEarned = homeStepsEarned(input.variantStates, liftId, tier);
      const handAt = timeOf(tier === "T1" ? liftState.t1SetByHandAt : liftState.t2SetByHandAt);
      if (handAt != null && handAt >= homeAt) {
        // Set by hand since the last home session: the user's weight stands.
        reentries.set(
          reentryKey(liftId, tier),
          handReentry(lastWeight, new Date(handAt), {
            stepsEarned,
            targetReps,
            location: "gym",
            lastWeight: lastWeight > 0 ? lastWeight : null,
            estimate: null,
          })
        );
        continue;
      }
      const estimate = estimateOf(liftId);
      const result = barbellReentryWeight({
        lastWeight: lastWeight > 0 ? lastWeight : null,
        stepsEarned,
        stepLbs: getIncrement(progressionLiftType(liftId), "gym", equipment),
        estimate,
        targetReps,
        equipment,
      });
      if (!result) continue;
      liftById.set(liftId, {
        ...liftState,
        ...(tier === "T1" ? { t1Weight: result.weight } : { t2Weight: result.weight }),
      });
      reentries.set(
        reentryKey(liftId, tier),
        toPlanReentry(result, {
          stepsEarned,
          targetReps,
          location: "gym",
          lastWeight: lastWeight > 0 ? lastWeight : null,
          estimate,
        })
      );
      continue;
    }

    // At home: only after the barbell lift was done since the last home session.
    if (barbellAt == null) continue;
    const choice = chooseHomeVariant({
      liftId,
      tier,
      liftState,
      variantStates: [...variantById.values()],
      equipment,
      overrideId: input.overrides?.[liftId],
      ...(input.now ? { now: input.now } : {}),
    });
    if (!choice || choice.seeded) continue;
    const variant = choice.state;
    const homeAt = timeOf(variant.lastSessionDate) ?? lastHomeTime(input.variantStates, liftId, tier);
    if (homeAt == null || barbellAt <= homeAt) continue;
    const stepsEarned = variant.gymPassesSinceHome ?? 0;
    const targetReps = variantScheme(variant).reps;
    const handAt = timeOf(variant.setByHandAt);
    if (handAt != null && handAt >= barbellAt) {
      // Set by hand since the barbell lift's last session: the user's weight stands.
      reentries.set(
        reentryKey(liftId, tier),
        handReentry(choice.weight, new Date(handAt), {
          stepsEarned,
          targetReps,
          location: "home",
          lastWeight: variant.weight,
          estimate: null,
          exerciseId: variant.exerciseId,
        })
      );
      continue;
    }
    const estimate = estimateOf(liftId);
    const ratio = strengthSets
      ? (transferRatioOf(strengthSets, liftId, variant.exerciseId)?.ratio ?? null)
      : null;
    const result = homeReentryWeight({
      lastWeight: variant.weight,
      stepsEarned,
      estimate,
      ratio,
      exerciseId: variant.exerciseId,
      targetReps,
      equipment,
    });
    if (!result) continue;
    variantById.set(variant.id, { ...variant, weight: result.weight });
    reentries.set(
      reentryKey(liftId, tier),
      toPlanReentry(result, {
        stepsEarned,
        targetReps,
        location: "home",
        lastWeight: variant.weight,
        estimate,
        ratio,
        exerciseId: variant.exerciseId,
      })
    );
  }

  return {
    liftStates: [...liftById.values()],
    variantStates: [...variantById.values()],
    reentries,
  };
}

/**
 * The plan with each entry a re-entry decided marked with its decision: the working
 * entry of that lift and tier, done as itself at the gym or as the decision's home
 * exercise at home. Entries are copied, never changed in place.
 */
export function markReentries(
  plan: WorkoutPlan,
  reentries: ReadonlyMap<string, PlanReentry> | undefined
): WorkoutPlan {
  if (!reentries || reentries.size === 0) return plan;
  return plan.map((entry) => {
    if (entry.isWarmUp) return entry;
    const reentry = reentries.get(reentryKey(entry.exerciseId, entry.tier));
    if (!reentry) return entry;
    const performed = entry.substituteExerciseId;
    const matches =
      reentry.location === "gym" ? !performed : performed != null && performed === reentry.exerciseId;
    return matches ? { ...entry, reentry } : entry;
  });
}
