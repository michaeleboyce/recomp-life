// The draft of the next set: what is about to be logged beyond the plan. Pure: no React,
// no storage. `useSetDraft` holds it.
import type { WorkoutPlan } from "@/lib/workout";
import type { SpotWeightsByKey } from "./setPlan";

/** A choice made for one set, by `spotKey` ("entry:set"); it does not carry to another set. */
export interface SetChoice<T> {
  key: string;
  value: T;
}

/** A T2 load drop the user accepted that no logged set reflects yet. */
export interface PendingDrop {
  entryIndex: number;
  weight: number;
}

/** The value chosen for the set `key`, or undefined when that set has none. */
export function choiceFor<T>(choice: SetChoice<T> | null, key: string): T | undefined {
  return choice && choice.key === key ? choice.value : undefined;
}

/**
 * The weights changed on the spot with the set `key` at `value`; null, or the plan's
 * own weight, puts that set back on the plan (its key removed). A new object.
 */
export function withSpotWeight(
  weights: SpotWeightsByKey,
  key: string,
  value: number | null,
  planned: number | undefined
): Record<string, number> {
  const next: Record<string, number> = { ...weights };
  if (value == null || value === planned) delete next[key];
  else next[key] = value;
  return next;
}

/** The weights changed on the spot without any of the entry at `index` (it was replaced). */
export function withoutEntrySpotWeights(weights: SpotWeightsByKey, index: number): Record<string, number> {
  return Object.fromEntries(Object.entries(weights).filter(([key]) => !key.startsWith(`${index}:`)));
}

/** The plan with an accepted drop's weight on its entry while that entry has sets left. */
export function withPendingDrop(plan: WorkoutPlan, pendingDrop: PendingDrop | null): WorkoutPlan {
  if (!pendingDrop) return plan;
  return plan.map((entry, i) =>
    i === pendingDrop.entryIndex && entry.completedSets < entry.targetSets
      ? { ...entry, weight: pendingDrop.weight }
      : entry
  );
}
