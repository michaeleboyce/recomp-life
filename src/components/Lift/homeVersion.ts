// The home version of a program lift on the lift page (`?as=<substituteId>`). Pure.
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { barbellToBothHands, barbellToDumbbell } from "@/lib/dbConversion";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import type { EquipmentProfile } from "@/types";

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
  const converted =
    substitute.grip === "both_hands" ? barbellToBothHands(barbellWeight) : barbellToDumbbell(barbellWeight);
  return Math.min(converted, equipment.maxDumbbellWeight);
}

/** True when the substitute's weight is per dumbbell. */
export function isPerHand(exerciseId: string): boolean {
  return EXERCISES[exerciseId]?.grip === "per_hand";
}
