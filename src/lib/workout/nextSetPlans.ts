// Per-set weights for the next session of an exercise, set on its page (E6).
// Spec: docs/plans/2026-11-17-exercise-page-design.md. Pure: no React, no database.
// CONTRACT STUBS: package P1 implements these.
import type { NextSetPlan, PlanEdit, Tier, WorkoutSession } from "@/types";
import type { WorkoutPlan } from "./types";

/** The key of a next-session set plan in `UserSettings.nextSetPlans`. */
export function nextSetPlanKey(exerciseId: string, tier: Tier): string {
  return `${exerciseId}|${tier}`;
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
  void plans;
  return plan;
}

/** The `setWeights` edits for the set plans `plan` uses, saved in the session's `planEdits` at start. */
export function nextSetPlanEdits(
  plan: WorkoutPlan,
  plans: Readonly<Record<string, NextSetPlan>> | undefined
): PlanEdit[] {
  void plan;
  void plans;
  return [];
}

/** The set plans left after `session` is finished: those it logged (exercise and tier) are used up. */
export function consumeNextSetPlans(
  plans: Readonly<Record<string, NextSetPlan>> | undefined,
  session: Pick<WorkoutSession, "sets">
): Record<string, NextSetPlan> {
  void session;
  return { ...(plans ?? {}) };
}
