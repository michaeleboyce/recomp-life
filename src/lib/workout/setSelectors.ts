import type { SetLog, Tier } from "@/types";

const NOT_IMPLEMENTED = "not implemented: src/lib/workout contract stub";

/** True for sets logged as warm-ups (tier "warmup"). */
export function isWarmUpSet(set: SetLog): boolean {
  void set;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * The sets logged for one plan entry: same template exerciseId and same tier, in
 * logging order. Matching is on `SetLog.exerciseId` (the template id, which is what is
 * stored even when a substitute was performed) and on tier, so a T1 exercise never
 * picks up its own warm-up sets.
 */
export function workingSetsFor(sets: SetLog[], exerciseId: string, tier: Tier): SetLog[] {
  void sets;
  void exerciseId;
  void tier;
  throw new Error(NOT_IMPLEMENTED);
}

/** All sets except warm-ups. */
export function excludeWarmUps(sets: SetLog[]): SetLog[] {
  void sets;
  throw new Error(NOT_IMPLEMENTED);
}
