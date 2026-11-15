// Why a home workout uses the dumbbell exercise and weight it does. The conversion is
// `adaptExerciseForHome`, called exactly as `buildWorkoutPlan` calls it; this file
// only reads which of its options the plan took.
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { DUMBBELL_LOAD_FACTOR, barbellToBothHands, barbellToDumbbell } from "@/lib/dbConversion";
import { EXERCISES } from "@/lib/exercises";
import { CREDIT_TIERS, classifyEntry } from "@/lib/workout/credit";
import type {
  DecisionTrace,
  ExerciseAdaptation,
  PrescribedEntry,
  TraceAlternative,
  TraceStep,
} from "@/types";
import { applySteps } from "./replay";
import { num, step } from "./text";
import type { PlanEntry, TraceContext } from "./types";

const CONVERSION_RULE = "dumbbell-conversion";
/** Rule for a lift done differently from its prescription. */
export const YOUR_CHANGE_RULE = "off-program-credit";

type HomeContext = Pick<TraceContext, "location" | "equipment">;
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
 * The steps a home workout adds after the program's weight is known: the dumbbell
 * exercise the plan took and its converted weight. Empty at the gym and for a lift
 * that already works at home.
 */
export function homeSteps(
  entry: Pick<PlanEntry, "exerciseId" | "substituteExerciseId">,
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

  const oneDumbbell = chosen.exercise.grip === "both_hands";
  const converted = oneDumbbell
    ? barbellToBothHands(barbellWeight)
    : barbellToDumbbell(barbellWeight);
  const percent = Math.round(DUMBBELL_LOAD_FACTOR * 100);
  const share = oneDumbbell ? "in one dumbbell" : "split between two hands";
  const each = oneDumbbell ? "" : " per hand";
  const capped =
    chosen.weight < converted
      ? ` Your heaviest dumbbell is ${num(context.equipment.maxDumbbellWeight)}, so it stops there.`
      : "";
  // The conversion only offers another exercise when the usual one does not fit.
  const usual = adaptation.originalExercise.dumbbellAlternative
    ? EXERCISES[adaptation.originalExercise.dumbbellAlternative]
    : undefined;
  const lead =
    usual && usual.id !== chosen.exercise.id
      ? `${usual.name} would need more than your heaviest dumbbell, so ${chosen.exercise.name} stands in`
      : chosen.exercise.name;

  return [
    step(
      "dumbbell",
      "At home with dumbbells",
      `${lead}: ${percent}% of ${num(barbellWeight)} ${share}, rounded to 5, is ${num(converted)}${each}.${capped}`,
      "set",
      "lb",
      chosen.weight,
      CONVERSION_RULE
    ),
  ];
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
