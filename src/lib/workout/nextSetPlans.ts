// Per-set weights for the next session of an exercise, set on its page (E6).
// Spec: docs/plans/2026-11-17-exercise-page-design.md. Pure: no React, no database.
import type { NextSetPlan, PlanEdit, Tier, WorkoutSession } from "@/types";
import { applyPlanEdits } from "./planEdits";
import { isWarmUpSet } from "./setSelectors";
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
 * the tier), so `applyPlanEdits` finds it; a plan with no sets gives none. Put them
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
    if (!setPlan || setPlan.sets.length === 0) continue;
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
