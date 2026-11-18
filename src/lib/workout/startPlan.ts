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
import { planAccessories, type AccessoryPlan, type AccessorySource } from "./accessoryPlan";
import { applyPlanEdits } from "./planEdits";
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
  /**
   * The accessories planned (A6), with the scored list they came from; null when no
   * `accessories` source was given (the plan then has only `selectedAccessories`, at
   * their defaults, as before).
   */
  accessories: AccessoryPlan | null;
  /**
   * The planned accessories as `add` edits, applied before the set plans and saved first
   * in the session's `planEdits` (then `nextSetPlanEdits`, then the user's), so resume
   * and the rebuild plan exactly these weights and schemes. Empty without accessories.
   */
  accessoryEdits: PlanEdit[];
}

export interface StartPlanInput extends BuildPlanInput {
  /**
   * Which lifts re-entry (H6) is worked out for: "day" (the default) the template's,
   * "everyLift" every program lift (a projection of several workouts ahead carries the
   * states on), "none" the states are used as given, with `reentries` if any.
   */
  reentry?: "day" | "everyLift" | "none";
  /**
   * Where the accessories are chosen and prescribed from (A6). Given, the mode in the
   * settings decides ("auto": the app's picks; "ask", "none": none), and a non-empty
   * `selectedAccessories` (a favourite's) is planned instead, each at its prescription.
   */
  accessories?: AccessorySource;
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
 * 3. With an `accessories` source, choose and prescribe the accessories
 *    (`planAccessories`), as `add` edits after the lifts.
 * 4. Apply the edits to the program's plan (`planFromLifts`): next-session set plans
 *    first, then the user's own (`withPlanEdits`), so the user's always win.
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

  // 3. The accessories, chosen once from the lifts as resolved (never from the user's
  //    edits to them, so an edit does not reshuffle them), appended after the lifts and
  //    kept to the session length measured on the program's own plan.
  const program = planFromLifts(lifts, input.accessories ? { ...input, selectedAccessories: [] } : input);
  const accessories = input.accessories
    ? planAccessories({
        templateId: template.id,
        mainLifts: lifts.map((lift) => ({ exerciseId: lift.exerciseId, sets: lift.sets })),
        location,
        source: input.accessories,
        selected: input.selectedAccessories,
        programPlan: program,
      })
    : null;
  const accessoryEdits = accessories?.edits ?? [];

  // 4. Apply the edits: set plans are matched on the entries as the program plans them.
  const base = accessoryEdits.length ? applyPlanEdits(program, accessoryEdits) : program;
  const { plan, nextSetPlanEdits } = withPlanEdits(base, input.nextSetPlans, input.edits);
  return { ...resolved, lifts, plan, prescribed, nextSetPlanEdits, accessories, accessoryEdits };
}
