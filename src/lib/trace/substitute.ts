// Why a home workout uses the dumbbell exercise and weight it does. The conversion is
// `adaptExerciseForHome`, called exactly as `buildWorkoutPlan` calls it; this file
// only reads which of its options the plan took.
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { DUMBBELL_LOAD_FACTOR, barbellToBothHands, barbellToDumbbell, roundToStep } from "@/lib/dbConversion";
import { repsInReserveFromRPE } from "@/lib/e1rm";
import { EXERCISES } from "@/lib/exercises";
import { asLifted, impliedWeightForReps, roundDownToDumbbell } from "@/lib/strength";
import { CREDIT_TIERS, classifyEntry } from "@/lib/workout/credit";
import type {
  DecisionTrace,
  ExerciseAdaptation,
  PrescribedEntry,
  TraceAlternative,
  TraceStep,
  VariantSeed,
} from "@/types";
import { applySteps } from "./replay";
import { num, step } from "./text";
import type { PlanEntry, TraceContext } from "./types";

const CONVERSION_RULE = "dumbbell-conversion";
/** Rule for a first home weight seeded from the exercise's starting ratio (H3). */
const TRANSFER_RATIO_RULE = "transfer-ratio";
/** Rule for a home exercise that keeps a weight of its own (H1). */
const HOME_PROGRESSION_RULE = "home-progression";
/** Rule for a lift done differently from its prescription. */
export const YOUR_CHANGE_RULE = "off-program-credit";

type HomeContext = Pick<TraceContext, "location" | "equipment"> & Partial<Pick<TraceContext, "home">>;
type Prescribed = readonly PrescribedEntry[] | undefined;

/** The adaptation for a gym-only lift at home, or null when nothing is adapted. */
function adaptationFor(
  entry: Pick<PlanEntry, "exerciseId">,
  barbellWeight: number,
  context: HomeContext
): ExerciseAdaptation | null {
  if (context.location !== "home") return null;
  const exercise = EXERCISES[entry.exerciseId];
  if (!exercise || !exercise.requiresGym) return null;
  return adaptExerciseForHome(
    exercise,
    barbellWeight,
    context.equipment,
    exercise.dumbbellAlternative ? EXERCISES[exercise.dumbbellAlternative] : undefined
  );
}

/**
 * At home, whether one step heavier than `weight` is more than the heaviest dumbbell
 * (`EquipmentProfile.maxDumbbellWeight`, the same limit `adaptExerciseForHome` caps a
 * converted weight at) for an entry done with dumbbells: its home substitute, or the
 * exercise itself. Null when the step fits, at the gym, or for a lift not done with
 * dumbbells.
 */
export function dumbbellLimitAtHome(
  entry: Pick<PlanEntry, "exerciseId" | "substituteExerciseId">,
  step: number,
  context: HomeContext,
  weight: number
): { needed: number; heaviest: number } | null {
  if (context.location !== "home" || !(step > 0)) return null;
  const performed = EXERCISES[entry.substituteExerciseId ?? entry.exerciseId];
  if (performed?.type !== "dumbbell") return null;
  const heaviest = context.equipment.maxDumbbellWeight;
  const needed = weight + step;
  return needed > heaviest ? { needed, heaviest } : null;
}

/** The sentence that says the heavier choice is held to the heaviest dumbbell, or "". */
export function dumbbellLimitText(limit: { needed: number; heaviest: number } | null, weight: number): string {
  if (!limit) return "";
  const lead = `One step heavier would need ${num(limit.needed)}, more than your heaviest dumbbell (${num(limit.heaviest)})`;
  return limit.heaviest > weight
    ? ` ${lead}, so the heavier choice stops at ${num(limit.heaviest)}.`
    : ` ${lead}, so nothing heavier is offered.`;
}

/**
 * The steps a home workout adds after the program's weight is known: the dumbbell
 * exercise the plan took and its converted weight, and whether a heavier choice is
 * held to the heaviest dumbbell. Empty at the gym and for a lift that already works
 * at home.
 */
export function homeSteps(
  entry: Pick<PlanEntry, "exerciseId" | "substituteExerciseId"> &
    Partial<Pick<PlanEntry, "seed" | "variantId" | "weight" | "reentry">>,
  barbellWeight: number,
  context: HomeContext
): TraceStep[] {
  const adaptation = adaptationFor(entry, barbellWeight, context);
  if (!adaptation) return [];

  if (!entry.substituteExerciseId) {
    return adaptation.adaptationStatus === "no_substitute"
      ? [
          step(
            "dumbbell",
            "At home",
            "No dumbbell version of this lift is set up, so the weight is unchanged.",
            "none",
            "lb"
          ),
        ]
      : [];
  }

  const first = adaptation.adaptedExercise;
  const chosen = [
    { exercise: first, weight: adaptation.adaptedWeight },
    ...adaptation.alternatives,
  ].find((option) => option.exercise.id === entry.substituteExerciseId);
  // A substitute the conversion does not offer was chosen some other way.
  if (!chosen) return [];

  // A first session of this exercise seeded from its own history (F6) or through its
  // ratio to the lift (H3).
  const seed = entry.seed;
  if (seed && isRatioOrHistorySeed(seed)) {
    return [seedStep(entry, chosen.exercise, adaptation, seed, context)];
  }
  // An exercise done here before keeps a weight of its own (H1), not a conversion.
  if (entry.variantId && !seed) {
    const own = ownWeightOf(entry, context);
    if (own != null) return [ownWeightStep(entry, chosen.exercise, adaptation, own, context)];
  }

  const oneDumbbell = chosen.exercise.grip === "both_hands";
  const converted = oneDumbbell
    ? barbellToBothHands(barbellWeight)
    : barbellToDumbbell(barbellWeight);
  const percent = Math.round(DUMBBELL_LOAD_FACTOR * 100);
  const share = oneDumbbell ? "in one dumbbell" : "split between two hands";
  const each = oneDumbbell ? "" : " per hand";
  const atLimit = dumbbellLimitAtHome(
    entry,
    context.equipment.dumbbellIncrementLbs,
    context,
    chosen.weight
  );
  const capped =
    chosen.weight < converted
      ? ` Your heaviest dumbbell is ${num(context.equipment.maxDumbbellWeight)}, so it stops there${atLimit ? " and nothing heavier is offered" : ""}.`
      : "";
  // The conversion only offers another exercise when the usual one does not fit.
  const usual = adaptation.originalExercise.dumbbellAlternative
    ? EXERCISES[adaptation.originalExercise.dumbbellAlternative]
    : undefined;
  const lead =
    usual && usual.id !== chosen.exercise.id
      ? `${usual.name} would need more than your heaviest dumbbell, so ${chosen.exercise.name} stands in`
      : chosen.exercise.name;
  // A capped weight has said so already.
  const limit = capped ? "" : dumbbellLimitText(atLimit, chosen.weight);

  return [
    step(
      "dumbbell",
      "At home with dumbbells",
      `${lead}: ${percent}% of ${num(barbellWeight)} ${share}, rounded to 5, is ${num(converted)}${each}.${capped}${limit}`,
      "set",
      "lb",
      chosen.weight,
      CONVERSION_RULE
    ),
  ];
}

/** A seed from the exercise's own history, or through its ratio to the lift, with the numbers it needs. */
function isRatioOrHistorySeed(seed: VariantSeed): boolean {
  if (seed.source === "history") return seed.ownEstimate != null;
  return (seed.source === "ratio" || seed.source === "estimate" || seed.source === "learned") && seed.ratio != null;
}

/** " with 1 rep left" for a logged effort short of the limit (the estimate credits it); "" otherwise. */
function repsLeftText(rpe: number | null | undefined): string {
  const left = rpe != null ? repsInReserveFromRPE(rpe) : 0;
  return left > 0 ? ` with ${num(left)} ${left === 1 ? "rep" : "reps"} left` : "";
}

/** "Nov 3, 2026". */
const dayText = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * The weight a seed gave (`seedVariantWeight`), from what the seed records: what the
 * exercise's own estimate allows for the stage's reps, rounded down and held to one
 * step above the heaviest weight it was lifted at when that decided; what the lift's
 * estimate allows through the ratio, rounded down; or the ratio times the barbell
 * weight, rounded to the dumbbell step. Capped at the heaviest dumbbell.
 */
function seededWeight(seed: VariantSeed, exerciseId: string, context: HomeContext): number {
  const step = context.equipment.dumbbellIncrementLbs;
  const max = context.equipment.maxDumbbellWeight;
  const ratio = seed.ratio ?? 0;
  const forReps = (estimatedMax: number) =>
    roundDownToDumbbell(asLifted(impliedWeightForReps(estimatedMax, seed.targetReps ?? 1), exerciseId), step);
  let wanted: number;
  if (seed.source === "history" && seed.ownEstimate != null) {
    wanted =
      seed.limitedByHeaviest && seed.heaviestLifted != null
        ? roundDownToDumbbell(seed.heaviestLifted + step, step)
        : forReps(seed.ownEstimate);
  } else if ((seed.source === "estimate" || seed.source === "learned") && seed.estimate != null) {
    wanted = forReps(seed.estimate * ratio);
  } else {
    wanted = ratio * seed.barbellWeight > 0 ? roundToStep(asLifted(ratio * seed.barbellWeight, exerciseId), step) : 0;
  }
  return Math.min(wanted, max);
}

/** "At home with dumbbells" for an exercise seeded from its starting ratio (H3). */
function seedStep(
  entry: Pick<PlanEntry, "exerciseId" | "substituteExerciseId">,
  exercise: { id: string; name: string; grip?: string },
  adaptation: ExerciseAdaptation,
  seed: VariantSeed,
  context: HomeContext
): TraceStep {
  const weight = seededWeight(seed, exercise.id, context);
  const ratio = seed.ratio ?? 0;
  const perHand = exercise.grip === "per_hand";
  const each = perHand ? " per hand" : "";
  const lift = (EXERCISES[entry.exerciseId]?.name ?? entry.exerciseId).replace(/^barbell /i, "").toLowerCase();
  const usual = adaptation.originalExercise.dumbbellAlternative
    ? EXERCISES[adaptation.originalExercise.dumbbellAlternative]
    : undefined;
  const lead =
    usual && usual.id !== exercise.id
      ? `${usual.name} would need more than your heaviest dumbbell, so ${exercise.name} stands in`
      : exercise.name;
  const increment = context.equipment.dumbbellIncrementLbs;
  const atLimit = dumbbellLimitAtHome(entry, increment, context, weight);
  const capped =
    seed.cappedFrom != null
      ? ` Your heaviest dumbbell is ${num(context.equipment.maxDumbbellWeight)}, so it stops there${atLimit ? " and nothing heavier is offered" : ""}.`
      : "";
  const limit = capped ? "" : dumbbellLimitText(atLimit, weight);
  const asked = seed.cappedFrom ?? weight;
  const share = perHand ? " in all, split between two hands" : " in one dumbbell";
  const r = ratio.toFixed(2);
  const reps = seed.targetReps ?? 1;
  // Not done here yet: a first time, or when it was last done (older than the window).
  const first =
    seed.lastDone != null
      ? `last done ${dayText(seed.lastDone)}, too long ago to set its weight, so it starts`
      : "a first time here, so it starts";

  if (seed.source === "history" && seed.ownEstimate != null) {
    const h = seed.history;
    const session = h
      ? `${num(h.weight)}${h.perHand ? " per hand" : ""} × ${h.reps}${repsLeftText(h.rpe)} on ${dayText(h.at)}${h.imported ? " (imported)" : ""}`
      : "your latest session";
    const fromEstimate = `${lead}: from your own history: ${session} gives an estimated max of ${num(seed.ownEstimate)} in all; the heaviest weight for ${reps} reps, rounded down to ${num(increment)}`;
    const held =
      seed.limitedByHeaviest && seed.heaviestLifted != null
        ? ` would be more, but a first session goes at most one step past the heaviest you lifted recently, ${num(seed.heaviestLifted)}${each}, so it is ${num(asked)}${each}.`
        : `, is ${num(asked)}${each}.`;
    return step("dumbbell", "At home with dumbbells", `${fromEstimate}${held}${capped}${limit}`, "set", "lb", weight, HOME_PROGRESSION_RULE);
  }

  const learned = seed.source === "learned" && seed.pairs != null && seed.pairs > 0;
  const ratioText = learned
    ? `${r} of it (learned from ${seed.pairs} ${seed.pairs === 1 ? "pair" : "pairs"} of your sessions)`
    : `${r} of it (the exercise's starting ratio)`;
  const detail =
    (seed.source === "estimate" || seed.source === "learned") && seed.estimate != null
      ? `${lead}: ${first} from your ${lift} strength estimate, ${num(seed.estimate)}, at ${ratioText}: the heaviest weight for ${reps} reps, rounded down to ${num(increment)}, is ${num(asked)}${each}.${capped}${limit}`
      : `${lead}: ${first} at ${r} of your ${lift}: ${r} × ${num(seed.barbellWeight)} is ${num(Math.round((ratio * seed.barbellWeight + 1e-9) * 10) / 10)}${share}, rounded to ${num(increment)}, is ${num(asked)}${each}.${capped}${limit}`;
  return step("dumbbell", "At home with dumbbells", detail, "set", "lb", weight, TRANSFER_RATIO_RULE);
}

/**
 * The program's weight for a home exercise with a weight of its own: the re-entry
 * weight when re-entry decided it, else the exercise's own (from the home exercises'
 * states in the context, capped at the heaviest dumbbell), else the planned weight.
 */
function ownWeightOf(
  entry: Partial<Pick<PlanEntry, "variantId" | "weight" | "reentry">>,
  context: HomeContext
): number | null {
  if (entry.reentry?.location === "home") return entry.reentry.weight;
  const variant = context.home?.variantStates?.find((v) => v.id === entry.variantId);
  if (variant) return Math.min(variant.weight, context.equipment.maxDumbbellWeight);
  return entry.weight ?? null;
}

/** "At home with dumbbells" for a home exercise done here before: its own weight. */
function ownWeightStep(
  entry: Pick<PlanEntry, "exerciseId" | "substituteExerciseId">,
  exercise: { id: string; name: string; grip?: string },
  adaptation: ExerciseAdaptation,
  weight: number,
  context: HomeContext
): TraceStep {
  const each = exercise.grip === "per_hand" ? " per hand" : "";
  const usual = adaptation.originalExercise.dumbbellAlternative
    ? EXERCISES[adaptation.originalExercise.dumbbellAlternative]
    : undefined;
  const lead =
    usual && usual.id !== exercise.id
      ? `${usual.name} would need more than your heaviest dumbbell, so ${exercise.name} stands in`
      : exercise.name;
  const limit = dumbbellLimitText(
    dumbbellLimitAtHome(entry, context.equipment.dumbbellIncrementLbs, context, weight),
    weight
  );
  return step(
    "dumbbell",
    "At home with dumbbells",
    `${lead}: it has a weight of its own from your sessions at home, ${num(weight)}${each}.${limit}`,
    "set",
    "lb",
    weight,
    HOME_PROGRESSION_RULE
  );
}

/** What the session's prescription says for a planned entry, when it names it. */
export function prescribedTarget(
  entry: Pick<PlanEntry, "exerciseId" | "tier">,
  prescribed: Prescribed
): PrescribedEntry | undefined {
  return prescribed?.find((p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier);
}

/**
 * What finishing the workout does with an entry whose planned weight is not the one
 * the steps before it reach:
 * - "heavier": a program lift above its prescribed weight. Done that heavy in every
 *   set, it progresses from what was lifted; a missed rep there changes nothing.
 * - "as-programmed": a program lift that still stands for its prescribed weight.
 * - "lighter", "other-scheme": a program lift done lighter, or at other sets or reps.
 *   It is only logged and the program weight stays.
 * - "not-prescribed": a lift swapped in or added at a program tier. Only logged.
 * - "accessory", "warm-up": never part of progression.
 */
export type WeightChangeEffect =
  | "heavier"
  | "as-programmed"
  | "lighter"
  | "other-scheme"
  | "not-prescribed"
  | "accessory"
  | "warm-up";

/**
 * The effect of a planned weight on progression, from the same classification
 * `computeCompletion` uses (`classifyEntry`, judged from the entry as planned) and the
 * same comparison as `heavierWeightPerformed`: `originalWeight ?? weight` against the
 * prescribed weight, so a home substitute reads as the program lift it stands for.
 *
 * @evidence off-program-credit
 */
export function weightChangeEffect(entry: PlanEntry, prescribed: Prescribed): WeightChangeEffect {
  if (entry.isWarmUp) return "warm-up";
  if (!CREDIT_TIERS.includes(entry.tier)) return "accessory";
  const target = prescribedTarget(entry, prescribed);
  if (!target) return "not-prescribed";

  if (classifyEntry(entry, [...(prescribed ?? [])]) === "logged-only") {
    const sameScheme = entry.targetSets === target.sets && entry.targetReps === target.reps;
    return sameScheme ? "lighter" : "other-scheme";
  }
  return (entry.originalWeight ?? entry.weight) > target.weight ? "heavier" : "as-programmed";
}

/** What a weight the user set does to the lift, in a sentence or two. */
function changeDetail(entry: PlanEntry, prescribed: Prescribed): string {
  const set = `You set ${num(entry.weight)} for today`;
  const stays = `the program weight stays at ${num(prescribedTarget(entry, prescribed)?.weight ?? 0)}`;
  switch (weightChangeEffect(entry, prescribed)) {
    case "heavier":
      return `${set}, heavier than the program asks for. If every set is done that heavy, progression carries on from what you lift. A missed rep at the heavier weight changes nothing: ${stays}.`;
    case "as-programmed":
      return `${set}. It still counts as the weight the program asks for, so progression carries on as usual.`;
    case "lighter":
      return `${set}, lighter than the program asks for. The lift is only logged: ${stays}.`;
    case "other-scheme":
      return `${set}. With the sets or reps changed as well, the lift is only logged: ${stays}.`;
    case "not-prescribed":
      return `${set}. It is not one of the program's lifts today, so it is only logged.`;
    case "accessory":
      return `${set}. Accessories are only logged: the program does not move their weight.`;
    case "warm-up":
      return `A lighter set on the way up, at ${num(entry.weight)}. Warm-ups never count toward progression.`;
  }
}

/**
 * The step for an entry's own weight when the steps so far do not reach it: a weight
 * the user set for the day, worded by what finishing the workout will do with it
 * (`weightChangeEffect`). `prescribed` is the session's prescription. This text is
 * saved with the workout, so it must describe the completion code as it is.
 */
export function yourChangeStep(
  steps: readonly TraceStep[],
  entry: PlanEntry,
  prescribed: Prescribed
): TraceStep[] {
  if (applySteps(steps).lb === entry.weight) return [];
  const detail = changeDetail(entry, prescribed);
  return [
    entry.isWarmUp
      ? step("warm-up", "Warm-up", detail, "set", "lb", entry.weight)
      : step("your-change", "Your change", detail, "set", "lb", entry.weight, YOUR_CHANGE_RULE),
  ];
}

/**
 * The home substitute for one planned lift: the barbell weight the program asks for,
 * then the dumbbell exercise and weight the plan took. At the gym it says no
 * substitute is needed. The result is the entry's weight.
 *
 * With `context.prescribed` (the session's prescription) the program weight is read
 * from it, so a substitute whose weight the user changed still starts from what the
 * program asked for, and a lift swapped in for the day is not called the program's.
 */
export function explainSubstitute(
  entry: PlanEntry,
  context: HomeContext & Pick<TraceContext, "prescribed">
): DecisionTrace {
  const target = entry.isWarmUp ? undefined : prescribedTarget(entry, context.prescribed);
  const barbellWeight = target?.weight ?? entry.originalWeight ?? entry.weight;
  const name = EXERCISES[entry.exerciseId]?.name ?? entry.exerciseId;
  const swappedIn =
    context.prescribed !== undefined &&
    weightChangeEffect(entry, context.prescribed) === "not-prescribed";

  const steps: TraceStep[] = [
    step(
      "program-weight",
      name,
      swappedIn
        ? `Your choice for today, at ${num(barbellWeight)}: the program sets no weight for it.`
        : `The program asks for ${num(barbellWeight)} on this lift.`,
      "start",
      "lb",
      barbellWeight
    ),
  ];
  const home = homeSteps(entry, barbellWeight, context);
  steps.push(...home);
  if (home.length === 0) {
    steps.push(
      step(
        "dumbbell",
        context.location === "home" ? "At home" : "At the gym",
        context.location === "home"
          ? "This lift works at home as it is: no substitute is needed."
          : "The lift is done as programmed: no substitute is needed.",
        "none",
        "lb"
      )
    );
  }
  // Without the session's prescription, the weight the entry stands for is the program's.
  const prescribed = context.prescribed ?? [
    {
      exerciseId: entry.exerciseId,
      tier: entry.tier,
      weight: barbellWeight,
      sets: entry.targetSets,
      reps: entry.targetReps,
    },
  ];
  steps.push(...yourChangeStep(steps, entry, prescribed));

  const adaptation = adaptationFor(entry, barbellWeight, context);
  const alternatives: TraceAlternative[] = (adaptation?.alternatives ?? [])
    .filter((option) => option.exercise.id !== entry.substituteExerciseId)
    .map((option) => ({ label: option.exercise.name, value: option.weight }));

  return {
    subject: { kind: "substitute", exerciseId: entry.exerciseId, tier: entry.tier },
    result: entry.weight,
    unit: "lb",
    steps,
    ...(alternatives.length > 0 ? { alternatives } : {}),
  };
}
