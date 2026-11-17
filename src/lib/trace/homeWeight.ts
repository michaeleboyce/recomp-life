// Why a home exercise is planned at the weight it is, in the strength model's terms:
// its own weight and how it got there, the pooled strength estimate and how much of it
// came from home sets, the sets behind each ratio, the heaviest-dumbbell policy and, back
// at the gym, which re-entry rule decided. Built from the strength library's outputs
// (`pooledLiftEstimate`, `learnTransferRatios`, the re-entry helpers) and the plan entry's
// fields; no number is worked out again here.
import { DUMBBELL_LOAD_FACTOR, ceilToStep } from "@/lib/dbConversion";
import { EXERCISES } from "@/lib/exercises";
import { pooledLiftEstimate, sessionEstimates } from "@/lib/strength";
import type { PooledEstimate, ReentryRule, StrengthSet, TransferRatio } from "@/lib/strength";
import {
  CAP_REP_STEP,
  HARDER_HOME_VARIANT,
  homeOptionsFor,
  isPerHandExercise,
  totalLoad,
} from "@/lib/workout/variant";
import type { EquipmentProfile, TraceStep, VariantCapAction, VariantState } from "@/types";
import { joinList, num, step } from "./text";
import type { PlanEntry, TraceContext } from "./types";

export const HOME_PROGRESSION_RULE = "home-progression";
export const CAP_PROGRESSION_RULE = "cap-progression";
export const STRENGTH_POOLING_RULE = "strength-pooling";
export const TRANSFER_RATIO_RULE = "transfer-ratio";

/**
 * Which re-entry rule decided the first weight after a stretch at the other location, as
 * `barbellReentryWeight` or `homeReentryWeight` returned it. The plan entry carries it
 * (`WorkoutExerciseState.reentry`, a `PlanReentry`, which has these fields and more).
 */
export interface ReentryTrace {
  /** `ReentryResult.rule`, or "hand": set by hand since, so re-entry left it. */
  rule: ReentryRule | "hand";
  /** For "hand": when the weight was set by hand. */
  setByHandAt?: Date | string;
  /** `ReentryResult.weight`: the weight the plan took. */
  weight: number;
  /** `ReentryResult.fromSteps`. */
  fromSteps: number | null;
  /** `ReentryResult.fromEstimate`. */
  fromEstimate: number | null;
  /** Steps the other location's passes earned. */
  stepsEarned?: number;
  /** The stage's reps per set the estimate rule was worked for. */
  targetReps?: number;
  /** Where the weight is for: the gym barbell (default) or the home exercise. */
  location?: "gym" | "home";
}

/** What the home-weight steps read beyond the plan entry. Every field is optional. */
export interface HomeTraceInputs {
  /** The variant states going into the session (`rebuildDerived().variantStates`). */
  variantStates?: readonly VariantState[];
  /** Every strength set in the log, for the estimate and the sets behind each ratio. */
  sets?: readonly StrengthSet[];
  /** The ratios the estimate used, when the caller learned them already. */
  ratios?: Readonly<Record<string, TransferRatio>>;
  /** What the cap policy did at the last pass, when it did something. */
  cap?: VariantCapAction;
  /** The re-entry rule that decided this weight. Left out: no "Back at ..." step. */
  reentry?: ReentryTrace;
}

type HomeContext = Pick<TraceContext, "location" | "equipment" | "home">;

const nameOf = (exerciseId: string) => EXERCISES[exerciseId]?.name ?? exerciseId;
/** "Barbell Squat" -> "squat": how the program lift is named in a sentence. */
const liftWord = (liftId: string) => nameOf(liftId).replace(/^barbell /i, "").toLowerCase();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "75", or "75 a hand" for two dumbbells. */
function asLiftedText(weight: number, perHand: boolean): string {
  return perHand ? `${num(weight)} a hand` : num(weight);
}

/**
 * How the variant's first weight was chosen, by the seed's source (`seedVariantWeight`):
 * the pooled estimate through the starting ratio, the ratio times the barbell weight,
 * the flat conversion, or the cap policy moving here from a lighter exercise.
 */
function seedText(variant: VariantState): string {
  const { seed } = variant;
  const lift = liftWord(variant.liftId);
  const capped =
    seed.cappedFrom != null ? ` That asked for ${num(seed.cappedFrom)}, so it started at your heaviest dumbbell.` : "";
  switch (seed.source) {
    case "harderVariant": {
      const from = seed.fromVariantId?.split("|")[1];
      return `It started here when ${from ? nameOf(from) : "the lighter exercise"} reached the heaviest dumbbell, at a load no lighter.`;
    }
    case "estimate":
      if (seed.estimate != null && seed.ratio != null) {
        const reps = seed.targetReps != null ? `: the heaviest for ${plural(seed.targetReps, "rep")}` : "";
        return `It started from your ${lift} strength estimate, ${num(seed.estimate)}, at ${seed.ratio.toFixed(2)} of it${reps}.${capped}`;
      }
      break;
    case "ratio":
      if (seed.ratio != null) {
        return `It started at ${seed.ratio.toFixed(2)} of the program's ${num(seed.barbellWeight)} barbell weight (the exercise's starting ratio).${capped}`;
      }
      break;
    case "conversion":
      break;
  }
  return `It started from the program's ${num(seed.barbellWeight)} barbell weight, converted to dumbbells (${Math.round(DUMBBELL_LOAD_FACTOR * 100)}%).${capped}`;
}

/** What a pass at the heaviest dumbbell does next (the cap policy), for an exercise there. */
export type CapNext =
  | { policy: "harderVariant"; exerciseId: string }
  | { policy: "reps"; reps: number }
  /** T3: the last set already asks for as many reps as you can. */
  | { policy: "none" };

/**
 * The cap policy's next step for a home exercise at the heaviest dumbbell, as
 * `evaluateVariant` takes it: the harder variant (HARDER_HOME_VARIANT, one of the lift's
 * home options) when the dumbbells give it a total load no lighter, otherwise
 * CAP_REP_STEP more reps a set (none at T3).
 */
export function capNextStep(
  variant: Pick<VariantState, "liftId" | "exerciseId" | "tier" | "weight" | "perHand">,
  equipment: Pick<EquipmentProfile, "maxDumbbellWeight" | "dumbbellIncrementLbs">
): CapNext {
  const harderId = HARDER_HOME_VARIANT[variant.exerciseId];
  if (harderId && homeOptionsFor(variant.liftId).includes(harderId)) {
    const notLighter = ceilToStep(
      totalLoad(variant.perHand, variant.weight) / (isPerHandExercise(harderId) ? 2 : 1),
      equipment.dumbbellIncrementLbs
    );
    if (notLighter <= equipment.maxDumbbellWeight) return { policy: "harderVariant", exerciseId: harderId };
  }
  const reps = CAP_REP_STEP[variant.tier];
  return reps > 0 ? { policy: "reps", reps } : { policy: "none" };
}

/** "Your home weight": the variant's own weight and how it got there. */
function ownWeightStep(entry: PlanEntry, variant: VariantState, context: HomeContext): TraceStep {
  const max = context.equipment.maxDumbbellWeight;
  const parts = [
    `${nameOf(variant.exerciseId)} has its own weight: ${asLiftedText(variant.weight, variant.perHand)}.`,
    seedText(variant),
    variant.passesSinceGym > 0
      ? `Since the barbell lift was last done, ${plural(variant.passesSinceGym, "pass", "passes")} at home added a dumbbell step each (the barbell weight waits for your next gym session).`
      : "No passes at home yet since the barbell lift was last done.",
  ];
  if (entry.cappedFrom != null && entry.cappedFrom > entry.weight) {
    parts.push(
      `The plan asked for ${num(entry.cappedFrom)}, more than your heaviest dumbbell (${num(max)}), so it stops at ${num(entry.weight)}.`
    );
  }
  return step(
    "home-weight",
    "Your home weight",
    parts.join(" "),
    "set",
    "lb",
    entry.weight,
    HOME_PROGRESSION_RULE
  );
}

/** "Strength estimate": the pooled estimate and how much of it came from home sets. */
function estimateStep(estimate: PooledEstimate): TraceStep {
  const homeWeight = estimate.related.reduce((sum, r) => sum + r.weight, 0);
  const total = estimate.ownWeight + homeWeight;
  const homeShare = total > 0 ? Math.round((homeWeight / total) * 100) : 0;
  const lift = liftWord(estimate.liftId);
  const source =
    estimate.basis === "own"
      ? "all from barbell sessions"
      : estimate.basis === "related"
        ? "all from home sessions"
        : `${homeShare}% from home sets (${plural(estimate.related.length, "session")}), the rest from your latest barbell session`;
  return step(
    "strength-estimate",
    "Strength estimate",
    `Your ${lift} is about ${num(estimate.value)} (give or take ${num(estimate.sd)}): ${source}.`,
    "none",
    "lb",
    undefined,
    STRENGTH_POOLING_RULE
  );
}

/** "From home sets: ...": the latest session of each home exercise behind the estimate. */
function homeSetSteps(estimate: PooledEstimate, sets: readonly StrengthSet[]): TraceStep[] {
  const latest = new Map<string, (typeof estimate.related)[number]>();
  for (const r of estimate.related) latest.set(r.exerciseId, r); // oldest first: the last wins
  const lift = liftWord(estimate.liftId);
  return [...latest.values()].map((r) => {
    const session = sessionEstimates(sets, r.exerciseId).find((s) => s.sessionId === r.sessionId);
    const best = session?.bestSet;
    // A session imported from another app was not necessarily done at home: say where it came from.
    const imported = sets.some((s) => s.sessionId === r.sessionId && s.imported);
    const sample = best ? `${num(best.weight)}×${best.reps}` : `${num(r.strength)} total`;
    const basis =
      r.ratio.pairs > 0
        ? `ratio ${r.ratio.ratio.toFixed(2)} from ${plural(r.ratio.pairs, "pair")}`
        : `starting ratio ${r.ratio.ratio.toFixed(2)}, none of your pairs yet`;
    const both = best?.perHand && best.load !== best.weight ? " (a dumbbell in each hand)" : "";
    return step(
      `home-set-${r.exerciseId.replace(/_/g, "-")}`,
      `From ${imported ? "imported" : "home"} sets: ${nameOf(r.exerciseId)} ${sample} ≈ ${lift} ${num(Math.round(r.liftEquivalent))} (${basis})`,
      `That ${imported ? "imported " : ""}session's estimated max${both} is ${num(Math.round(r.strength))}; divided by the ratio it says ${num(Math.round(r.liftEquivalent))} for the ${lift}. It counts ${Math.round(r.weight * 100) / 100} of a barbell session.`,
      "none",
      "lb",
      undefined,
      TRANSFER_RATIO_RULE
    );
  });
}

/** "At the dumbbell cap": a harder variant or more reps. Null below the cap. */
function capStep(variant: VariantState, context: HomeContext, cap: VariantCapAction | undefined): TraceStep | null {
  const max = context.equipment.maxDumbbellWeight;
  const here = `${nameOf(variant.exerciseId)} is at ${asLiftedText(variant.weight, variant.perHand)}, your heaviest dumbbell (${num(max)})`;
  const title = "At the dumbbell cap";
  if (cap?.policy === "harderVariant") {
    return step("dumbbell-cap", title, `${here}, so a pass moves to ${nameOf(cap.to.exerciseId)} at ${num(cap.to.weight)}.`, "none", "lb", undefined, CAP_PROGRESSION_RULE);
  }
  if (cap?.policy === "reps") {
    return step("dumbbell-cap", title, `${here}, so a pass adds reps instead: ${cap.repsFrom} to ${cap.repsTo} a set.`, "none", "lb", undefined, CAP_PROGRESSION_RULE);
  }
  if (variant.weight < max) return null;
  const policy = capNextStep(variant, context.equipment);
  const next =
    policy.policy === "harderVariant"
      ? `the next pass moves to ${nameOf(policy.exerciseId)}, at a load no lighter`
      : policy.policy === "reps"
        ? `the next pass adds ${plural(policy.reps, "rep")} a set`
        : "the last set keeps asking for as many reps as you can";
  const extra = variant.extraReps > 0 ? ` It has added ${plural(variant.extraReps, "rep")} a set so far.` : "";
  return step("dumbbell-cap", title, `${here}, so ${next}.${extra}`, "none", "lb", undefined, CAP_PROGRESSION_RULE);
}

/** "Back at the gym" / "Back at home": which re-entry rule decided the weight. */
function reentryStep(reentry: ReentryTrace, entry: PlanEntry): TraceStep {
  const gym = (reentry.location ?? "gym") === "gym";
  const applied = reentry.weight === entry.weight;
  if (reentry.rule === "hand") {
    const at = reentry.setByHandAt != null ? new Date(reentry.setByHandAt) : null;
    const when =
      at && Number.isFinite(at.getTime())
        ? ` on ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "";
    return step(
      "reentry",
      gym ? "Back at the gym" : "Back at home",
      `You set this weight by hand${when}, after your last ${gym ? "home" : "barbell"} session, so re-entry leaves it as it is.`,
      applied ? "set" : "none",
      "lb",
      applied ? reentry.weight : undefined,
      STRENGTH_POOLING_RULE
    );
  }
  const bounds: string[] = [];
  if (reentry.fromSteps !== null) {
    const earned = reentry.stepsEarned;
    bounds.push(
      `${earned != null ? `the last weight plus the ${plural(earned, "step")} ${gym ? "home" : "gym"} passes earned` : "the last weight plus the steps earned"} is ${num(reentry.fromSteps)}`
    );
  }
  if (reentry.fromEstimate !== null) {
    const reps = reentry.targetReps != null ? ` for ${plural(reentry.targetReps, "rep")}` : "";
    bounds.push(`your strength estimate allows ${num(reentry.fromEstimate)}${reps}`);
  }
  const decided =
    reentry.rule === "steps"
      ? "The steps rule is the smaller, so it decides."
      : reentry.rule === "estimate"
        ? "The estimate is the smaller, so it decides."
        : "Both are more than your heaviest dumbbell, so it stops at the cap.";
  return step(
    "reentry",
    gym ? "Back at the gym" : "Back at home",
    `The weight is the smaller of two rules: ${joinList(bounds)}. ${decided}`,
    // Only a weight the plan actually took is set; another one is shown, not applied.
    applied ? "set" : "none",
    "lb",
    applied ? reentry.weight : undefined,
    STRENGTH_POOLING_RULE
  );
}

/**
 * The home-weight steps for one planned lift. Empty unless `context.home` is given.
 * At home, an entry with a variant gets "Your home weight", then the estimate, the sets
 * behind it and the cap; a re-entry rule (when the caller has one) gets "Back at the
 * gym" or "Back at home". Each step cites its rule.
 *
 * @evidence home-progression
 * @evidence cap-progression
 * @evidence strength-pooling
 * @evidence transfer-ratio
 */
export function homeWeightSteps(entry: PlanEntry, context: HomeContext): TraceStep[] {
  const home = context.home;
  // The plan entry says which re-entry rule decided it (`resolveReentry`); the context's
  // is for a caller that worked one out itself.
  const reentry = entry.reentry ?? home?.reentry;
  if (!home) return reentry ? [reentryStep(reentry, entry)] : [];
  const out: TraceStep[] = [];

  if (context.location === "home" && entry.variantId) {
    const variant = home.variantStates?.find((v) => v.id === entry.variantId);
    if (variant) {
      out.push(ownWeightStep(entry, variant, context));
      if (home.sets && home.sets.length > 0) {
        const estimate = pooledLiftEstimate(variant.liftId, home.sets, home.ratios ? { ratios: home.ratios } : {});
        if (estimate) {
          out.push(estimateStep(estimate));
          out.push(...homeSetSteps(estimate, home.sets));
        }
      }
      const cap = capStep(variant, context, home.cap);
      if (cap) out.push(cap);
    }
  }

  if (reentry) out.push(reentryStep(reentry, entry));
  return out;
}
