import type { SetLog, Tier } from "@/types";

/** True for sets logged as warm-ups (tier "warmup"). */
export function isWarmUpSet(set: SetLog): boolean {
  return set.tier === "warmup";
}

/**
 * The sets logged for one plan entry: same template exerciseId and same tier, in
 * logging order. Matching is on `SetLog.exerciseId` (the template id, which is what is
 * stored even when a substitute was performed) and on tier, so a T1 exercise never
 * picks up its own warm-up sets.
 */
export function workingSetsFor(sets: SetLog[], exerciseId: string, tier: Tier): SetLog[] {
  return sets.filter((set) => set.exerciseId === exerciseId && set.tier === tier);
}

/** All sets except warm-ups. */
export function excludeWarmUps(sets: SetLog[]): SetLog[] {
  return sets.filter((set) => !isWarmUpSet(set));
}
