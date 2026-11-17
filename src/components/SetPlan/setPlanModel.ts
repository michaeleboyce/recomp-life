// The set plan editor's arithmetic. Pure: no React, no database.
import type { PlannedSet } from "@/types";

/** True when a set's weight or reps differ from the plan's set at the same place. */
export function setDiffers(set: PlannedSet, plan: PlannedSet | undefined): boolean {
  if (!plan) return false;
  return set.weight !== plan.weight || set.reps !== plan.reps;
}

/** True when the sets are not the plan's: a set changed, added or removed. */
export function differsFromPlan(sets: readonly PlannedSet[], planSets: readonly PlannedSet[]): boolean {
  return sets.length !== planSets.length || sets.some((set, i) => setDiffers(set, planSets[i]));
}

/** A weight kept within its limits. */
export function clampWeight(weight: number, minWeight: number, maxWeight?: number): number {
  const floor = Math.max(minWeight, weight);
  return maxWeight != null ? Math.min(maxWeight, floor) : floor;
}

/** The sets with one of them changed; the others are the same objects. */
export function withSet(
  sets: readonly PlannedSet[],
  index: number,
  change: Partial<PlannedSet>
): PlannedSet[] {
  return sets.map((set, i) => (i === index ? { ...set, ...change } : set));
}

/** The unit a weight is shown in: "lbs a hand" for each dumbbell of a pair, else "lbs". */
export function weightUnit(perHand: boolean): "lbs" | "lbs a hand" {
  return perHand ? "lbs a hand" : "lbs";
}
