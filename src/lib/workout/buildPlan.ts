import { EXERCISES } from "@/lib/exercises";
import type { LiftState, WorkoutModification, WorkoutSession, WorkoutTemplate } from "@/types";
import type { RotationSession } from "./credit";
import { planFromLifts, resolveLifts, withPlanEdits } from "./liftResolution";
import { dueTemplateId } from "./rotation";
import { planWorkoutStart } from "./startPlan";
import type { BuildPlanInput, NextWorkoutDescription, WorkoutPlan } from "./types";

export { WARM_UP_TIERS } from "./liftResolution";

/**
 * The ordered list of everything performed in a workout: for each template exercise
 * its warm-up entries (when enabled and the tier is in WARM_UP_TIERS) followed by the
 * working entry, then the selected accessories. Every entry starts at completedSets 0.
 *
 * The lifts are resolved once (`resolveLifts`): at home, a gym-only program lift is
 * planned as its home exercise (`chooseHomeVariant`), the current variant's own weight
 * and scheme from `variantStates`, or for a lift with no home history a variant seeded
 * (H3); an entry in `overrides` selects one of the conversion's alternatives instead.
 * The barbell weight the exercise stands for is kept as `originalWeight`.
 *
 * Next-session set plans (`nextSetPlans`, E6) become `setWeights` edits for the entries
 * they match (`nextSetPlanEdits`), applied first; then `edits` in order (see
 * `applyPlanEdits`), so the user's own change to an entry wins. A `swap` edit and an
 * `overrides` entry are different things: an override is the program lift on other
 * equipment and still credits that lift, a swap is a different exercise and is only
 * logged. When both name the same exercise the swap wins, and a swapped-in exercise
 * is never adapted for home.
 */
export function buildWorkoutPlan(input: BuildPlanInput): WorkoutPlan {
  const lifts = resolveLifts(input);
  const base = planFromLifts(lifts, input);
  return withPlanEdits(base, input.nextSetPlans, input.edits).plan;
}

// `WorkoutModification` has no field for the substitute's id, so it travels in the
// free-form `reason` as a trailing "[substitute:<exerciseId>]" tag after readable text
// (History renders the reason as-is).
const SUBSTITUTE_TAG = /\[substitute:([^\]\s]+)\]\s*$/;

/**
 * The `session.modifications` entry that records a home substitute chosen on
 * Configure. `overridesFromSession` reads it back.
 */
export function substituteModification(
  templateExerciseId: string,
  substituteExerciseId: string,
  originalWeight: number,
  modifiedWeight: number
): WorkoutModification {
  const name = EXERCISES[substituteExerciseId]?.name ?? substituteExerciseId;
  return {
    exerciseId: templateExerciseId,
    originalWeight,
    modifiedWeight,
    reason: `Home substitute: ${name} [substitute:${substituteExerciseId}]`,
    action: "substitute",
    source: "equipment_limit",
    userAccepted: true,
  };
}

/**
 * Reads the home substitutes saved on a session (`modifications` entries with
 * action "substitute" and source "equipment_limit") back into an overrides map.
 */
export function overridesFromSession(
  session: Pick<WorkoutSession, "modifications">
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const mod of session.modifications ?? []) {
    if (mod.action !== "substitute" || mod.source !== "equipment_limit") continue;
    const substituteId = SUBSTITUTE_TAG.exec(mod.reason ?? "")?.[1];
    if (substituteId) overrides[mod.exerciseId] = substituteId;
  }
  return overrides;
}

/**
 * Which template comes next in the A1 -> B1 -> A2 -> B2 rotation given completed
 * workouts (any order), and its plan, with the plan options spelled out. The hooks and
 * the ledger use `resolveNextWorkout`, which reads them from the settings; both plan
 * through `planWorkoutStart`. Unfinished workouts do not advance the rotation, and
 * neither do sessions `foldRotation` finds did not count (a day pulled out of order, or
 * one whose T1 lift was not done as prescribed).
 *
 * With `reentry`, the states are first resolved for the first session back at a
 * location (`resolveReentry`, H6) and the entries it decided are marked; the returned
 * `liftStates` and `variantStates` are the ones the plan was built from.
 *
 * @evidence off-program-credit
 */
export function describeNextWorkout(input: {
  completedWorkouts: RotationSession[];
  templates: Record<string, WorkoutTemplate>;
  liftStates: LiftState[];
  plan: Omit<BuildPlanInput, "template" | "liftStates">;
  reentry?: boolean;
}): NextWorkoutDescription {
  const templateId = dueTemplateId(input.completedWorkouts);
  const template = input.templates[templateId];
  if (!template) {
    throw new Error(`Workout template not found: ${templateId}`);
  }
  const start = planWorkoutStart({
    ...input.plan,
    template,
    liftStates: input.liftStates,
    reentry: input.reentry ? "day" : "none",
  });
  return {
    templateId,
    template,
    plan: start.plan,
    liftStates: start.liftStates,
    variantStates: start.variantStates,
  };
}
