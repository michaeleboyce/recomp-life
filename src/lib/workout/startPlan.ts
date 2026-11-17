// What a session about to start plans and stores: the plan, the program's prescription
// for it, and the states both are built from, after re-entry. Pure.
import type { PlanEdit, PrescribedEntry } from "@/types";
import { buildWorkoutPlan } from "./buildPlan";
import { nextSetPlanEdits } from "./nextSetPlans";
import { applyPlanEdits, prescribedFor } from "./planEdits";
import { resolveReentry, type ReentryResolution } from "./reentry";
import type { BuildPlanInput, WorkoutPlan } from "./types";

export interface WorkoutStartPlan extends ReentryResolution {
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

/**
 * The plan and prescription of a session about to start, from the current states: the
 * states are resolved for a first session back at a location (`resolveReentry`, H6),
 * home exercises never used are seeded from `strengthSets` (H3), and the prescription
 * is built from the same states and choices as the plan, so the rebuild credits the
 * session against what was planned.
 *
 * @evidence strength-pooling
 * @evidence home-progression
 */
export function planWorkoutStart(input: Omit<BuildPlanInput, "reentries">): WorkoutStartPlan {
  const { template, location, equipment, overrides, strengthSets } = input;
  const resolved = resolveReentry({
    liftStates: input.liftStates,
    variantStates: input.variantStates ?? [],
    location,
    equipment,
    template,
    ...(strengthSets ? { strengthSets } : {}),
    ...(overrides ? { overrides } : {}),
  });
  // The program's plan first, so the set plans are matched on the entries as planned.
  const base = buildWorkoutPlan({
    ...input,
    liftStates: resolved.liftStates,
    variantStates: resolved.variantStates,
    reentries: resolved.reentries,
    edits: undefined,
    nextSetPlans: undefined,
  });
  const setPlanEdits = nextSetPlanEdits(base, input.nextSetPlans);
  const edits = [...setPlanEdits, ...(input.edits ?? [])];
  const plan = edits.length ? applyPlanEdits(base, edits) : base;
  const prescribed = prescribedFor(
    template,
    resolved.liftStates,
    location === "home"
      ? {
          variantStates: resolved.variantStates,
          equipment,
          ...(overrides ? { overrides } : {}),
          ...(strengthSets ? { strengthSets } : {}),
        }
      : undefined
  );
  return { ...resolved, plan, prescribed, nextSetPlanEdits: setPlanEdits };
}
