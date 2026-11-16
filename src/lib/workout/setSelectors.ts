import type { SetLog, SetRole, Tier } from "@/types";

/** True for sets logged as warm-ups (tier "warmup"). */
export function isWarmUpSet(set: SetLog): boolean {
  return set.tier === "warmup";
}

/** Roles that are extra to the program's working sets: never part of a pass or a fail. */
export const EXTRA_SET_ROLES: readonly SetRole[] = ["ramp", "backoff", "drop"];

/**
 * True for a working set of the program: no role (every row logged before roles) or
 * "work". Ramp, back-off and drop sets are extra volume.
 */
export function isWorkingSet(set: Pick<SetLog, "role">): boolean {
  return set.role == null || set.role === "work";
}

/**
 * Every set logged for one plan entry, working or not (ramp, back-off and drop sets
 * included), in logging order. Same matching as `workingSetsFor`.
 */
export function entrySetsFor(sets: SetLog[], exerciseId: string, tier: Tier): SetLog[] {
  return sets.filter((set) => set.exerciseId === exerciseId && set.tier === tier);
}

/**
 * The working sets logged for one plan entry: same template exerciseId and same tier, in
 * logging order, without ramp, back-off and drop sets (`isWorkingSet`). Matching is on
 * `SetLog.exerciseId` (the template id, which is what is stored even when a substitute
 * was performed) and on tier, so a T1 exercise never picks up its own warm-up sets.
 * Pass or fail is judged on these alone. Rows logged before set roles existed have no
 * role and are all working sets, exactly as before.
 */
export function workingSetsFor(sets: SetLog[], exerciseId: string, tier: Tier): SetLog[] {
  return entrySetsFor(sets, exerciseId, tier).filter(isWorkingSet);
}

/** All sets except warm-ups. */
export function excludeWarmUps(sets: SetLog[]): SetLog[] {
  return sets.filter((set) => !isWarmUpSet(set));
}
