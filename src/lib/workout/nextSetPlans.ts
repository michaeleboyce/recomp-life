// Per-set weights for the next session of an exercise, set on its page (E6).
// Spec: docs/plans/2026-11-17-exercise-page-design.md. Pure: no React, no database.
import type { NextSetPlan, PlanEdit, PlannedSet, Tier, WorkoutSession } from "@/types";
import { applyPlanEdits } from "./planEdits";
import { isWarmUpSet, isWorkingSet } from "./setSelectors";
import type { WorkoutPlan } from "./types";

/** The key of a next-session set plan in `UserSettings.nextSetPlans`. */
export function nextSetPlanKey(exerciseId: string, tier: Tier): string {
  return `${exerciseId}|${tier}`;
}

/**
 * The set-plan key of a plan entry or a logged set: the exercise performed (the home
 * exercise when one stands in, `substituteExerciseId`) and its tier.
 */
export function performedSetPlanKey(
  item: { exerciseId: string; substituteExerciseId?: string; tier: Tier }
): string {
  return nextSetPlanKey(item.substituteExerciseId ?? item.exerciseId, item.tier);
}

/**
 * Sets a plan can take: at least one, at least one of them a working set (the program
 * judges the session on those), each with a weight of 0 or more and at least one rep.
 * Settings travel as JSON, so a weight that was NaN comes back as null; such a set plan
 * is left out rather than giving the entry a weight that is not a number.
 */
function usableSets(sets: readonly PlannedSet[] | undefined): sets is PlannedSet[] {
  return (
    Array.isArray(sets) &&
    sets.some(isWorkingSet) &&
    sets.every((set) => Number.isFinite(set.weight) && set.weight >= 0 && Number.isFinite(set.reps) && set.reps >= 1)
  );
}

/** True when two lists of sets have the same weights, reps and roles, in order. */
export function sameSets(a: readonly PlannedSet[], b: readonly PlannedSet[]): boolean {
  return (
    a.length === b.length &&
    a.every((set, i) => set.weight === b[i].weight && set.reps === b[i].reps && (set.role ?? null) === (b[i].role ?? null))
  );
}

/** An entry's own sets: its per-set plan, or `targetSets` of `targetReps` at `weight`. */
function entrySets(entry: WorkoutPlan[number]): PlannedSet[] {
  return (
    entry.perSet ??
    Array.from({ length: entry.targetSets }, () => ({ weight: entry.weight, reps: entry.targetReps }))
  );
}

/**
 * True while the program still plans what the set plan was made against: the entry's
 * own sets equal the plan's sets stored with it (`planSets`). When the plan has moved
 * since (a weight set by hand, a stage change, re-entry, a deload), the set plan is
 * stale and left out, so old per-set weights never replace a newer plan. A set plan
 * stored without `planSets` is taken as current.
 */
export function isSetPlanCurrent(entry: WorkoutPlan[number], setPlan: NextSetPlan): boolean {
  if (!Array.isArray(setPlan.planSets) || setPlan.planSets.length === 0) return true;
  return sameSets(entrySets(entry), setPlan.planSets);
}

/**
 * The plan with each entry that has a next-session set plan (matched on the exercise
 * performed, `substituteExerciseId ?? exerciseId`, and tier) given those sets, as a
 * `setWeights` edit would. Entries are copied, never changed in place.
 */
export function applyNextSetPlans(
  plan: WorkoutPlan,
  plans: Readonly<Record<string, NextSetPlan>> | undefined
): WorkoutPlan {
  const edits = nextSetPlanEdits(plan, plans);
  return edits.length === 0 ? plan : applyPlanEdits(plan, edits);
}

/**
 * The `setWeights` edits for the set plans `plan` uses, saved in the session's
 * `planEdits` at start. Each names its entry as it stands (the template lift's id and
 * the tier), so `applyPlanEdits` finds it; a plan with no usable sets, or made against
 * a plan that has moved since (`isSetPlanCurrent`), gives none. Put them
 * before the user's own edits so a change made in Edit workout wins.
 */
export function nextSetPlanEdits(
  plan: WorkoutPlan,
  plans: Readonly<Record<string, NextSetPlan>> | undefined
): PlanEdit[] {
  if (!plans) return [];
  const edits: PlanEdit[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp) continue;
    const setPlan = plans[performedSetPlanKey(entry)];
    if (!setPlan || !usableSets(setPlan.sets) || !isSetPlanCurrent(entry, setPlan)) continue;
    edits.push({
      kind: "setWeights",
      exerciseId: entry.exerciseId,
      tier: entry.tier,
      sets: setPlan.sets.map((set) => ({ ...set })),
    });
  }
  return edits;
}

/** The set plans left after `session` is finished: those it logged (exercise and tier) are used up. */
export function consumeNextSetPlans(
  plans: Readonly<Record<string, NextSetPlan>> | undefined,
  session: Pick<WorkoutSession, "sets">
): Record<string, NextSetPlan> {
  const logged = new Set(
    (session.sets ?? []).filter((set) => !isWarmUpSet(set)).map(performedSetPlanKey)
  );
  const left: Record<string, NextSetPlan> = {};
  for (const [key, plan] of Object.entries(plans ?? {})) {
    if (!logged.has(nextSetPlanKey(plan.exerciseId, plan.tier))) left[key] = plan;
  }
  return left;
}

/** `plans` with the plan at `key` set to `plan`, or removed when `plan` is null. */
export function withNextSetPlan(
  plans: Readonly<Record<string, NextSetPlan>> | undefined,
  key: string,
  plan: NextSetPlan | null
): Record<string, NextSetPlan> {
  const next: Record<string, NextSetPlan> = { ...(plans ?? {}) };
  if (plan) next[key] = plan;
  else delete next[key];
  return next;
}
