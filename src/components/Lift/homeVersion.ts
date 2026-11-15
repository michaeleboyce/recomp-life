// The home version of a program lift on the lift page (`?as=<substituteId>`). Pure.
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { barbellToBothHands, barbellToDumbbell, DUMBBELL_LOAD_FACTOR } from "@/lib/dbConversion";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { EquipmentProfile, Tier } from "@/types";

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

/**
 * The weight the home version is done at for `barbellWeight`, the way the workout
 * plan picks it (`adaptExerciseForHome`): the adaptation's own weight when it chose
 * this substitute, else the alternative's, else the plain conversion capped at the
 * heaviest dumbbell.
 */
export function homeVersionWeight(
  exerciseId: string,
  substituteId: string,
  barbellWeight: number,
  equipment: EquipmentProfile
): number {
  const exercise = EXERCISES[exerciseId];
  const substitute = EXERCISES[substituteId];
  if (!exercise || !substitute || barbellWeight <= 0) return 0;
  const alternative = exercise.dumbbellAlternative ? EXERCISES[exercise.dumbbellAlternative] : undefined;
  const adaptation = adaptExerciseForHome(exercise, barbellWeight, equipment, alternative);
  if (adaptation.adaptedExercise.id === substituteId) return adaptation.adaptedWeight;
  const option = adaptation.alternatives.find((alt) => alt.exercise.id === substituteId);
  if (option) return option.weight;
  return Math.min(convertedWeight(substituteId, barbellWeight), equipment.maxDumbbellWeight);
}

/** The plain conversion of `barbellWeight` for the substitute, before any cap. */
function convertedWeight(substituteId: string, barbellWeight: number): number {
  return EXERCISES[substituteId]?.grip === "both_hands"
    ? barbellToBothHands(barbellWeight)
    : barbellToDumbbell(barbellWeight);
}

/** True when the substitute's weight is per dumbbell. */
export function isPerHand(exerciseId: string): boolean {
  return EXERCISES[exerciseId]?.grip === "per_hand";
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
  /** The barbell weight it stands in for. */
  barbellWeight: number;
  /** The other home version the next workout at home does the lift as, if it does. */
  plannedAs?: string;
}

/**
 * The next session of `substituteId`. When the next workout at home does the lift as
 * this substitute, its plan entry: the weight and scheme Today shows, at whichever
 * tier the lift is that day. Otherwise the lift's next T1, converted the way the plan
 * would (`homeVersionWeight`), noting the substitute the plan picked instead.
 */
export function homeNextSession(
  exerciseId: string,
  substituteId: string,
  homePlan: WorkoutPlan | undefined,
  t1: { weight: number; sets: number; reps: number },
  equipment: EquipmentProfile
): HomeNextSession {
  const perHand = isPerHand(substituteId);
  const entries = (homePlan ?? []).filter((e) => !e.isWarmUp && e.exerciseId === exerciseId);
  const entry = entries.find((e) => e.substituteExerciseId === substituteId);
  const plannedAs = entries.find((e) => e.substituteExerciseId)?.substituteExerciseId;
  if (entry) {
    return {
      tier: entry.tier,
      weight: entry.weight,
      perHand,
      sets: entry.targetSets,
      reps: entry.targetReps,
      isAMRAP: entry.isAMRAP,
      barbellWeight: entry.originalWeight ?? 0,
    };
  }
  return {
    tier: "T1",
    weight: homeVersionWeight(exerciseId, substituteId, t1.weight, equipment),
    perHand,
    sets: t1.sets,
    reps: t1.reps,
    isAMRAP: true,
    barbellWeight: t1.weight,
    ...(plannedAs ? { plannedAs } : {}),
  };
}

/** "5×3+" for a last set done for as many as you can, "3×10" otherwise. */
export function homeScheme(next: Pick<HomeNextSession, "sets" | "reps" | "isAMRAP">): string {
  return `${next.sets}×${next.reps}${next.isAMRAP ? "+" : ""}`;
}

/**
 * How the home weight follows from the barbell weight, e.g. "80% of the 190 lbs barbell
 * squat, split between two dumbbells and rounded to 5 lbs." Says so when the heaviest
 * dumbbell caps it. Empty without a barbell weight.
 */
export function homeConversionText(
  liftShort: string,
  substituteId: string,
  next: Pick<HomeNextSession, "weight" | "barbellWeight">
): string {
  const { weight, barbellWeight } = next;
  if (barbellWeight <= 0 || weight <= 0) return "";
  const perHand = isPerHand(substituteId);
  const share = `${Math.round(DUMBBELL_LOAD_FACTOR * 100)}% of the ${barbellWeight} lbs barbell ${liftShort}`;
  const full = convertedWeight(substituteId, barbellWeight);
  if (weight < full) {
    return `${share} would be ${full} lbs${perHand ? " a hand" : ""}, so it is capped at your heaviest dumbbell.`;
  }
  return perHand
    ? `${share}, split between two dumbbells and rounded to 5 lbs.`
    : `${share}, in one dumbbell, rounded to 5 lbs.`;
}
