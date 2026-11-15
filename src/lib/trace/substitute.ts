// Why a home workout uses the dumbbell exercise and weight it does. The conversion is
// `adaptExerciseForHome`, called exactly as `buildWorkoutPlan` calls it; this file
// only reads which of its options the plan took.
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { DUMBBELL_LOAD_FACTOR, barbellToBothHands, barbellToDumbbell } from "@/lib/dbConversion";
import { EXERCISES } from "@/lib/exercises";
import type { DecisionTrace, ExerciseAdaptation, TraceAlternative, TraceStep } from "@/types";
import { applySteps } from "./replay";
import { num, step } from "./text";
import type { PlanEntry, TraceContext } from "./types";

const CONVERSION_RULE = "dumbbell-conversion";
/** Rule for a lift done differently from its prescription. */
export const YOUR_CHANGE_RULE = "off-program-credit";

type HomeContext = Pick<TraceContext, "location" | "equipment">;

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

/** The step for a weight the user set themselves, when the steps so far do not reach it. */
export function yourChangeStep(steps: readonly TraceStep[], weight: number): TraceStep[] {
  if (applySteps(steps).lb === weight) return [];
  return [
    step(
      "your-change",
      "Your change",
      `You set ${num(weight)} for today. Progression carries on from what you lift.`,
      "set",
      "lb",
      weight,
      YOUR_CHANGE_RULE
    ),
  ];
}

/**
 * The home substitute for one planned lift: the barbell weight the program asks for,
 * then the dumbbell exercise and weight the plan took. At the gym it says no
 * substitute is needed. The result is the entry's weight.
 */
export function explainSubstitute(entry: PlanEntry, context: HomeContext): DecisionTrace {
  const barbellWeight = entry.originalWeight ?? entry.weight;
  const name = EXERCISES[entry.exerciseId]?.name ?? entry.exerciseId;

  const steps: TraceStep[] = [
    step(
      "program-weight",
      name,
      `The program asks for ${num(barbellWeight)} on this lift.`,
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
  steps.push(...yourChangeStep(steps, entry.weight));

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
