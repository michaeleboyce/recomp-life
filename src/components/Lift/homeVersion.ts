// A program lift's home versions: which they are, their next session as Today plans it,
// how the plan reached its weight, and a hand-set change previewed. Pure.
import { historyDay, nameInSentence } from "@/components/Today/todayModel";
import { DUMBBELL_LOAD_FACTOR } from "@/lib/dbConversion";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import type { StrengthSet } from "@/lib/strength";
import { capNextStep } from "@/lib/trace/homeWeight";
import { planWorkoutStart } from "@/lib/workout/startPlan";
import type { NextWorkoutDescription, PlanReentry, WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import {
  isVariantTier,
  liftWeightAt,
  seedVariantState,
  variantKey,
  variantScheme,
  withHandSetWeight,
  withoutGymPasses,
  type VariantTier,
} from "@/lib/workout/variant";
import { WORKOUT_TEMPLATES, getNextWorkoutId } from "@/lib/workoutTemplates";
import type {
  EquipmentProfile,
  LiftState,
  T1Stage,
  T2Stage,
  Tier,
  VariantSeed,
  VariantState,
  WorkoutTemplate,
} from "@/types";

/** The lift's known home substitutes: its dumbbell alternative and its fallback chain. */
export function homeSubstitutesOf(exerciseId: string): string[] {
  const ids = new Set<string>();
  const alternative = EXERCISES[exerciseId]?.dumbbellAlternative;
  if (alternative) ids.add(alternative);
  for (const id of HOME_SUBSTITUTE_CHAINS[exerciseId] ?? []) ids.add(id);
  return [...ids].filter((id) => EXERCISES[id]);
}

/** `as` when it names one of the lift's home substitutes, else undefined. */
export function validHomeSubstitute(
  exerciseId: string,
  as: string | null | undefined
): string | undefined {
  return as && homeSubstitutesOf(exerciseId).includes(as) ? as : undefined;
}

/** The program lift a home substitute counts toward, or undefined when it is not one. */
export function programLiftFor(substituteId: string): string | undefined {
  for (const [lift, chain] of Object.entries(HOME_SUBSTITUTE_CHAINS)) {
    if (chain.includes(substituteId)) return lift;
  }
  return Object.values(EXERCISES).find((e) => e.dumbbellAlternative === substituteId)?.id;
}

/** True when the substitute's weight is per dumbbell. */
export function isPerHand(exerciseId: string): boolean {
  return EXERCISES[exerciseId]?.grip === "per_hand";
}

/** What the home lift page plans from: the same states and next workout Today uses. */
export interface HomePlanContext {
  /**
   * The next workout at home, as Today plans it (`useNextWorkout("home")`). Without its
   * plan (a preview from changed states) the plan is built again from the states here.
   */
  next: (Pick<NextWorkoutDescription, "templateId"> & Partial<Pick<NextWorkoutDescription, "plan">>) | undefined;
  /** The stored lift states (before re-entry: the plan resolves it). */
  liftStates: LiftState[];
  /** The stored home exercises' states (before re-entry). */
  variantStates: VariantState[];
  /** Every set as strength evidence, the app's and the imported (`useStrengthEvidence`). */
  strengthSets?: readonly StrengthSet[];
  equipment: EquipmentProfile;
}

/** The next session of a home version, as Today shows it. */
export interface HomeNextSession {
  tier: Tier;
  /** As lifted: per dumbbell when `perHand`. */
  weight: number;
  perHand: boolean;
  sets: number;
  reps: number;
  isAMRAP: boolean;
  /** The home exercise's stage (T1, T2); null for T3 or with nothing to plan. */
  stage: T1Stage | T2Stage | null;
  /** The barbell weight of the program lift at this tier, which stays as it is at home. */
  barbellWeight: number;
  /** The other home version the next home session of the lift does it as, if it does. */
  plannedAs?: string;
  /** The exercise's stored state, when it has a weight of its own. */
  variant?: VariantState;
  /** For a first time: how the weight was seeded (`seedVariantWeight`). */
  seed?: VariantSeed;
  /** The first session back at home after barbell sessions: which rule decided. */
  reentry?: PlanReentry;
  /** The weight asked for when `weight` is capped at the heaviest dumbbell. */
  cappedFrom?: number;
  /** True when `weight` is the heaviest dumbbell. */
  atCap: boolean;
}

/**
 * The first template from `fromId` on, in the rotation, with the lift at `tier` (any
 * program tier when not given), and its slot.
 */
function templateFor(
  exerciseId: string,
  fromId: string,
  tier?: VariantTier
): { template: WorkoutTemplate; slot: WorkoutTemplate["exercises"][number] } | null {
  let id = WORKOUT_TEMPLATES[fromId] ? fromId : "A1";
  for (let i = 0; i < Object.keys(WORKOUT_TEMPLATES).length; i++) {
    const template = WORKOUT_TEMPLATES[id];
    const slot = template?.exercises.find(
      (e) => e.exerciseId === exerciseId && (tier ? e.tier === tier : isVariantTier(e.tier))
    );
    if (template && slot) return { template, slot };
    id = getNextWorkoutId(id);
  }
  return null;
}

function workingEntry(plan: WorkoutPlan, exerciseId: string, tier: Tier): WorkoutExerciseState | undefined {
  return plan.find((e) => !e.isWarmUp && e.exerciseId === exerciseId && e.tier === tier);
}

function stageAt(state: LiftState | undefined, tier: Tier): T1Stage | T2Stage | null {
  if (tier === "T1") return state?.t1Stage ?? "5x3";
  if (tier === "T2") return state?.t2Stage ?? "3x10";
  return null;
}

/**
 * The next session of `substituteId`, standing in for `exerciseId`, from the plan
 * (`planWorkoutStart`, the same states and re-entry as Today), so its weight is the home
 * exercise's own: the next home workout's entry when that workout has the lift, else the
 * next one in the rotation that does. With `tier`, the lift's next session at that tier.
 *
 * When the plan does the lift as another home exercise, `plannedAs` names it and the
 * weight is the one the plan gives this substitute when it is picked on Configure; when
 * it cannot be picked there, its own stored weight (or its seed), capped at the heaviest
 * dumbbell, as the plan would take it.
 */
export function homeNextSession(
  exerciseId: string,
  substituteId: string,
  ctx: HomePlanContext,
  tier?: VariantTier
): HomeNextSession {
  const perHand = isPerHand(substituteId);
  const found = templateFor(exerciseId, ctx.next?.templateId ?? "A1", tier);
  if (!found) {
    return { tier: tier ?? "T1", weight: 0, perHand, sets: 0, reps: 0, isAMRAP: false, stage: null, barbellWeight: 0, atCap: false };
  }
  const { template, slot } = found;
  const max = ctx.equipment.maxDumbbellWeight;
  const planAt = (overrides?: Record<string, string>) =>
    planWorkoutStart({
      template,
      liftStates: ctx.liftStates,
      location: "home",
      equipment: ctx.equipment,
      includeWarmUps: false,
      selectedAccessories: [],
      variantStates: ctx.variantStates,
      ...(ctx.strengthSets ? { strengthSets: ctx.strengthSets } : {}),
      ...(overrides ? { overrides } : {}),
    });

  const fromEntry = (
    entry: WorkoutExerciseState,
    resolved: { liftStates: LiftState[]; variantStates: VariantState[] },
    plannedAs?: string
  ): HomeNextSession => {
    const state = resolved.variantStates.find((v) => v.id === entry.variantId);
    const stored = ctx.variantStates.find((v) => v.id === entry.variantId);
    const liftState = resolved.liftStates.find((s) => s.exerciseId === exerciseId);
    return {
      tier: entry.tier,
      weight: entry.weight,
      perHand: entry.perHand ?? perHand,
      sets: entry.targetSets,
      reps: entry.targetReps,
      isAMRAP: entry.isAMRAP,
      stage: (state?.stage as T1Stage | T2Stage | null | undefined) ?? stageAt(liftState, entry.tier),
      barbellWeight: entry.originalWeight ?? 0,
      ...(plannedAs ? { plannedAs } : {}),
      ...(stored ? { variant: stored } : {}),
      ...(entry.seed ? { seed: entry.seed } : {}),
      ...(entry.reentry?.location === "home" ? { reentry: entry.reentry } : {}),
      ...(entry.cappedFrom != null ? { cappedFrom: entry.cappedFrom } : {}),
      atCap: entry.weight >= max,
    };
  };

  const nextPlan = ctx.next?.plan && ctx.next.templateId === template.id ? ctx.next.plan : undefined;
  const plain = nextPlan ? null : planAt();
  const base = workingEntry(nextPlan ?? plain!.plan, exerciseId, slot.tier);
  if (base?.substituteExerciseId === substituteId) {
    return fromEntry(base, plain ?? planAt());
  }
  const plannedAs = base?.substituteExerciseId;
  const picked = planAt({ [exerciseId]: substituteId });
  const swapped = workingEntry(picked.plan, exerciseId, slot.tier);
  if (swapped?.substituteExerciseId === substituteId) return fromEntry(swapped, picked, plannedAs);

  // Not one the plan can pick today: its own weight, or its seed, as the plan takes them.
  const variantTier = slot.tier as VariantTier;
  const liftState = picked.liftStates.find((s) => s.exerciseId === exerciseId);
  const stored = ctx.variantStates.find((v) => v.id === variantKey(exerciseId, substituteId, variantTier));
  const state =
    picked.variantStates.find((v) => v.id === variantKey(exerciseId, substituteId, variantTier)) ??
    seedVariantState({
      liftId: exerciseId,
      exerciseId: substituteId,
      tier: variantTier,
      liftState,
      equipment: ctx.equipment,
      ...(ctx.strengthSets ? { strengthSets: ctx.strengthSets } : {}),
    });
  const weight = Math.min(state.weight, max);
  const cappedFrom = state.weight > max ? state.weight : stored ? undefined : state.seed.cappedFrom;
  const scheme = variantScheme(state, { sets: slot.sets, reps: slot.reps });
  return {
    tier: slot.tier,
    weight,
    perHand: state.perHand,
    sets: scheme.sets,
    reps: scheme.reps,
    isAMRAP: slot.isAMRAP,
    stage: (state.stage as T1Stage | T2Stage | null) ?? null,
    barbellWeight: liftWeightAt(liftState, variantTier),
    ...(plannedAs ? { plannedAs } : {}),
    ...(stored ? { variant: stored } : { seed: state.seed }),
    ...(cappedFrom != null ? { cappedFrom } : {}),
    atCap: weight >= max,
  };
}

/** "5×3+" for a last set done for as many as you can, "3×10" otherwise. */
export function schemeText(next: Pick<HomeNextSession, "sets" | "reps" | "isAMRAP">): string {
  return `${next.sets}×${next.reps}${next.isAMRAP ? "+" : ""}`;
}

/** The line under the home weight and the rule it rests on. */
export interface HomeWeightLine {
  text: string;
  ruleId: "home-progression" | "cap-progression" | "transfer-ratio" | "dumbbell-conversion" | "strength-pooling";
}

const lbsText = (weight: number, perHand: boolean) => `${weight} lbs${perHand ? " a hand" : ""}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "80 is your heaviest dumbbell: a pass adds 1 rep a set." */
function capText(exerciseId: string, liftId: string, next: HomeNextSession, equipment: EquipmentProfile): string {
  const policy = capNextStep(
    { liftId, exerciseId, tier: next.tier as VariantTier, weight: next.weight, perHand: next.perHand },
    equipment
  );
  const then =
    policy.policy === "harderVariant"
      ? `a pass moves to ${nameInSentence(policy.exerciseId)}, at a load no lighter`
      : policy.policy === "reps"
        ? `a pass adds ${plural(policy.reps, "rep")} a set`
        : "the last set keeps asking for as many reps as you can";
  return `${next.weight} is your heaviest dumbbell: ${then}.`;
}

/**
 * How the home weight was reached, from the plan entry, never from the flat conversion:
 * back at home after barbell sessions (the re-entry rule), a first time (the seed: the
 * strength estimate or the starting ratio, or the conversion for an exercise without
 * one; led by the exercise's last imported session when it has imported history), or
 * the exercise's own weight from its home sessions; then, at the heaviest
 * dumbbell, what the cap policy does next. Empty with no weight.
 */
export function homeWeightLine(
  exerciseId: string,
  liftShort: string,
  substituteId: string,
  next: HomeNextSession,
  equipment: EquipmentProfile
): HomeWeightLine {
  if (next.weight <= 0) return { text: "", ruleId: "home-progression" };
  const step = equipment.dumbbellIncrementLbs;
  const parts: string[] = [];
  let ruleId: HomeWeightLine["ruleId"] = "home-progression";
  const { reentry, seed } = next;

  if (reentry?.rule === "hand") {
    const at = reentry.setByHandAt ? new Date(reentry.setByHandAt) : null;
    const when = at ? ` on ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "";
    parts.push(
      `You set it by hand${when}, after your last barbell session, so it stays at ${lbsText(next.weight, next.perHand)}.`
    );
  } else if (reentry) {
    ruleId = "strength-pooling";
    const bounds: string[] = [];
    if (reentry.fromSteps !== null) {
      bounds.push(
        `your last ${reentry.lastWeight ?? "weight"} plus ${plural(reentry.stepsEarned, "step")} the barbell passes earned is ${reentry.fromSteps}`
      );
    }
    if (reentry.fromEstimate !== null) {
      bounds.push(`your ${liftShort} strength estimate allows ${reentry.fromEstimate}`);
    }
    parts.push(
      `Back at home after barbell sessions: ${bounds.join(", and ")}. ${
        reentry.rule === "cap" ? "Both are more than your heaviest dumbbell, so it stops there." : "The smaller decides."
      }`
    );
  } else if (seed?.source === "history" && seed.ownEstimate != null && seed.history) {
    // Its own recent sessions set the weight: say which, and the numbers.
    const h = seed.history;
    const held =
      seed.limitedByHeaviest && seed.heaviestLifted != null
        ? ` Held to one step past the heaviest you lifted recently, ${lbsText(seed.heaviestLifted, next.perHand)}.`
        : "";
    parts.push(
      `From your history: last ${lbsText(h.weight, h.perHand)} × ${h.reps} on ${historyDay(h.at)}, an estimated max of ${seed.ownEstimate}. Its first weight here is the heaviest for ${plural(seed.targetReps ?? next.reps, "rep")}, rounded down to ${step} lbs.${held}`
    );
  } else if (
    seed &&
    (seed.source === "learned" || seed.source === "estimate" || seed.source === "ratio") &&
    seed.ratio != null
  ) {
    ruleId = "transfer-ratio";
    const r = seed.ratio.toFixed(2);
    const learned = seed.source === "learned" && seed.pairs ? `, learned from ${plural(seed.pairs, "pair")} of your sessions` : "";
    const fromEstimate = `from your ${liftShort} strength estimate, ${seed.estimate}, at ${r} of it${learned}, the heaviest for ${plural(seed.targetReps ?? next.reps, "rep")}, rounded down to ${step} lbs.`;
    const lead = seed.lastDone != null ? `Last done ${historyDay(seed.lastDone)}, too long ago to set its weight` : "A first time";
    parts.push(
      seed.source !== "ratio" && seed.estimate != null
        ? `${lead}: ${fromEstimate}`
        : `${lead}: ${r} of your ${seed.barbellWeight} lbs barbell ${liftShort}, ${next.perHand ? "split between two dumbbells" : "in one dumbbell"}, rounded to ${step} lbs.`
    );
  } else if (seed) {
    ruleId = "dumbbell-conversion";
    parts.push(
      `${seed.lastDone != null ? `Last done ${historyDay(seed.lastDone)}, too long ago to set its weight` : "A first time"}: ${Math.round(DUMBBELL_LOAD_FACTOR * 100)}% of your ${seed.barbellWeight} lbs barbell ${liftShort}, ${next.perHand ? "split between two dumbbells" : "in one dumbbell"}, rounded to ${step} lbs.`
    );
  } else {
    const passes = next.variant?.passesSinceGym ?? 0;
    parts.push(
      `Its own weight from your home sessions: each pass adds ${lbsText(step, next.perHand)}.${
        passes > 0 ? ` ${plural(passes, "pass", "passes")} at home since the barbell ${liftShort} was last done.` : ""
      }`
    );
  }

  if (next.cappedFrom != null && next.cappedFrom > next.weight) {
    parts.push(`That asks for ${lbsText(next.cappedFrom, next.perHand)}, more than your heaviest dumbbell.`);
  }
  if (next.atCap) {
    parts.push(capText(substituteId, exerciseId, next, equipment));
    if (!reentry || reentry.rule === "hand") ruleId = "cap-progression";
  }
  return { text: parts.join(" "), ruleId };
}

/**
 * The weight the plan would give `substituteId` next if its weight had not been set by
 * hand: the session planned from the states with the override taken back (its
 * `plannedWeight` as its weight, no hand-set date) and the evidence without the
 * provisional sets (`targetStrengthSets`), so the app's own number stays live as the
 * log changes. Null when its weight is not set by hand, or when the plan's is the same.
 *
 * @evidence target-evidence
 */
export function homePlanWeight(
  exerciseId: string,
  substituteId: string,
  ctx: HomePlanContext,
  next: HomeNextSession
): number | null {
  const tier = next.tier as VariantTier;
  if (!isVariantTier(tier)) return null;
  const id = variantKey(exerciseId, substituteId, tier);
  const overridden = ctx.variantStates.find((v) => v.id === id && v.plannedWeight !== undefined);
  if (!overridden) return null;
  const restored: VariantState = { ...overridden, weight: overridden.plannedWeight! };
  delete restored.plannedWeight;
  delete restored.setByHandAt;
  const plan = homeNextSession(
    exerciseId,
    substituteId,
    {
      ...ctx,
      // Built again from the restored states: the stored next plan has the override in it.
      next: ctx.next ? { templateId: ctx.next.templateId } : undefined,
      variantStates: ctx.variantStates.map((v) => (v.id === id ? restored : v)),
      ...(ctx.strengthSets ? { strengthSets: ctx.strengthSets.filter((s) => !s.provisional) } : {}),
    },
    tier
  );
  return plan.weight > 0 && plan.weight !== next.weight ? plan.weight : null;
}

/** A manual change to a home exercise's own weight (and stage) at a tier. */
export interface HomeAdjustment {
  liftId: string;
  exerciseId: string;
  tier: VariantTier;
  weight: number;
  stage?: T1Stage | T2Stage | null;
  /** When it is set; defaults to now. */
  at?: Date;
  /** Back to the plan's weight: ends the override (`BACK_TO_PLAN_NOTE`). */
  backToPlan?: boolean;
}

/**
 * The home exercises' states with a manual change applied as the rebuild applies a
 * `LiftAdjustment` with `variant` (`applyAdjustment` in src/lib/rebuild/fold.ts): the
 * exercise's state (seeded when it has none) takes the weight and stage, the steps gym
 * passes had earned for it are dropped, and it records when it was set by hand (so
 * re-entry leaves it). The lift states are not touched. Used to preview the next home
 * session before saving.
 */
export function withHomeAdjustment(
  variantStates: readonly VariantState[],
  liftStates: readonly LiftState[],
  equipment: EquipmentProfile,
  change: HomeAdjustment
): VariantState[] {
  const id = variantKey(change.liftId, change.exerciseId, change.tier);
  const current =
    variantStates.find((v) => v.id === id) ??
    seedVariantState({
      liftId: change.liftId,
      exerciseId: change.exerciseId,
      tier: change.tier,
      liftState: liftStates.find((s) => s.exerciseId === change.liftId),
      equipment,
    });
  const next = withHandSetWeight(
    current,
    withoutGymPasses({
      ...current,
      weight: change.weight,
      ...(change.stage && change.tier !== "T3" ? { stage: change.stage } : {}),
    }),
    change.at ?? new Date(),
    change.backToPlan
  );
  const others = variantStates.filter((v) => v.id !== id);
  return [...others, next].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
