// What a session about to start plans and stores: the plan, the program's prescription
// for it, and the states both are built from, after re-entry. Pure.
import type { PlanEdit, PrescribedEntry } from "@/types";
import {
  planFromLifts,
  prescriptionOf,
  resolveLifts,
  withPlanEdits,
  type LiftResolution,
} from "./liftResolution";
import { resolveReentry, type ReentryResolution } from "./reentry";
import type { BuildPlanInput, WorkoutPlan } from "./types";

export interface WorkoutStartPlan extends ReentryResolution {
  /**
   * Each program lift resolved once (`resolveLifts`): the exercise performed, its weight
   * as lifted, its scheme, the program's barbell prescription and any re-entry decision.
   * `prescribed` and the plan before edits are both read from these.
   */
  lifts: LiftResolution[];
  /** Exactly what the active workout will perform. */
  plan: WorkoutPlan;
  /**
   * What the program prescribes for each program lift, before edits, to store on the
   * session: the barbell weights after re-entry and, at home, each home exercise's own
   * prescription (seeded or re-entered as the plan has it).
   */
  prescribed: PrescribedEntry[];
  /**
   * The `setWeights` edits the next-session set plans gave (E6), in the order applied
   * (before the user's edits). Saved in the session's `planEdits` ahead of the user's,
   * so the active workout and the rebuild plan the same sets. Empty without set plans.
   */
  nextSetPlanEdits: PlanEdit[];
}

export interface StartPlanInput extends BuildPlanInput {
  /**
   * Which lifts re-entry (H6) is worked out for: "day" (the default) the template's,
   * "everyLift" every program lift (a projection of several workouts ahead carries the
   * states on), "none" the states are used as given, with `reentries` if any.
   */
  reentry?: "day" | "everyLift" | "none";
}

/**
 * The plan and prescription of a session about to start, from the current states, in
 * three steps that every planning path shares:
 *
 * 1. Resolve the lifts: the states for a first session back at a location
 *    (`resolveReentry`, H6), then each program lift once (`resolveLifts`): the exercise
 *    performed, a home exercise never used seeded from `strengthSets` (H3).
 * 2. Record the prescription from those lifts (`prescriptionOf`), so the rebuild credits
 *    the session against exactly what was planned.
 * 3. Apply the edits to the program's plan (`planFromLifts`): next-session set plans
 *    first, then the user's own (`withPlanEdits`).
 *
 * @evidence strength-pooling
 * @evidence home-progression
 */
export function planWorkoutStart(input: StartPlanInput): WorkoutStartPlan {
  const { template, location, equipment, overrides, strengthSets } = input;
  const scope = input.reentry ?? "day";

  // 1. Resolve the lifts.
  const resolved: ReentryResolution =
    scope === "none"
      ? {
          liftStates: input.liftStates,
          variantStates: input.variantStates ?? [],
          reentries: new Map(input.reentries ?? []),
        }
      : resolveReentry({
          liftStates: input.liftStates,
          variantStates: input.variantStates ?? [],
          location,
          equipment,
          ...(scope === "day" ? { template } : {}),
          ...(strengthSets ? { strengthSets } : {}),
          ...(overrides ? { overrides } : {}),
        });
  const lifts = resolveLifts({
    template,
    liftStates: resolved.liftStates,
    location,
    equipment,
    variantStates: resolved.variantStates,
    reentries: resolved.reentries,
    ...(strengthSets ? { strengthSets } : {}),
    ...(overrides ? { overrides } : {}),
  });

  // 2. Record the prescription.
  const prescribed = prescriptionOf(lifts);

  // 3. Apply the edits: set plans are matched on the entries as the program plans them.
  const base = planFromLifts(lifts, input);
  const { plan, nextSetPlanEdits } = withPlanEdits(base, input.nextSetPlans, input.edits);
  return { ...resolved, lifts, plan, prescribed, nextSetPlanEdits };
}
