import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES, getExercise } from "@/lib/exercises";
import { generateWarmUpSets } from "@/lib/warmups";
import type {
  LiftState,
  Tier,
  WorkoutModification,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";
import { foldRotation, type RotationSession } from "./credit";
import { applyPlanEdits } from "./planEdits";
import { getPrescription } from "./prescription";
import { markReentries, resolveReentry } from "./reentry";
import type {
  BuildPlanInput,
  NextWorkoutDescription,
  WorkoutExerciseState,
  WorkoutPlan,
} from "./types";
import { chooseHomeVariant, isVariantTier, variantScheme } from "./variant";

/** Tiers that get generated warm-up sets when warm-ups are enabled. */
export const WARM_UP_TIERS: readonly Tier[] = ["T1"];

/**
 * The ordered list of everything performed in a workout: for each template exercise
 * its warm-up entries (when enabled and the tier is in WARM_UP_TIERS) followed by the
 * working entry, then the selected accessories. Every entry starts at completedSets 0.
 *
 * At home, a gym-only program lift is planned as its home exercise (`chooseHomeVariant`):
 * the current variant's own weight and scheme from `variantStates`, or for a lift with
 * no home history a variant seeded from `adaptExerciseForHome`'s conversion; an entry
 * in `overrides` selects one of that adaptation's alternatives instead. The barbell
 * weight the exercise stands for is kept as `originalWeight`.
 *
 * `edits` are then applied in order (see `applyPlanEdits`). A `swap` edit and an
 * `overrides` entry are different things: an override is the program lift on other
 * equipment and still credits that lift, a swap is a different exercise and is only
 * logged. When both name the same exercise the swap wins, and a swapped-in exercise
 * is never adapted for home.
 */
export function buildWorkoutPlan(input: BuildPlanInput): WorkoutPlan {
  const { template, liftStates, location, equipment, includeWarmUps, selectedAccessories, strengthSets } =
    input;
  const overrides = input.overrides ?? {};
  const variantStates = input.variantStates ?? [];

  const liftStateById = new Map(liftStates.map((ls) => [ls.exerciseId, ls]));
  const plan: WorkoutPlan = [];

  for (const templateEx of template.exercises) {
    getExercise(templateEx.exerciseId);
    const liftState = liftStateById.get(templateEx.exerciseId);
    const prescription = getPrescription(templateEx, liftState);

    let substituteExerciseId: string | undefined;
    let weight = prescription.weight;
    let targetSets = prescription.sets;
    let targetReps = prescription.reps;
    let originalWeight: number | undefined;
    let home: Pick<WorkoutExerciseState, "variantId" | "perHand" | "cappedFrom" | "seed"> = {};

    if (location === "home" && isVariantTier(templateEx.tier)) {
      // The lift's home exercise with its own weight and scheme. The exercise is picked
      // with the same conversion and override rule as the Configure screen; a variant
      // never used is seeded (H3) from the lift's strength estimate through the
      // exercise's starting ratio, or from that ratio and the barbell weight.
      const choice = chooseHomeVariant({
        liftId: templateEx.exerciseId,
        tier: templateEx.tier,
        liftState,
        variantStates,
        equipment,
        overrideId: overrides[templateEx.exerciseId],
        ...(strengthSets ? { strengthSets } : {}),
      });
      // Null for "no_substitute" and for exercises that already work at home: nothing
      // is substituted.
      if (choice) {
        const scheme = variantScheme(choice.state, { sets: templateEx.sets, reps: templateEx.reps });
        substituteExerciseId = choice.state.exerciseId;
        weight = choice.weight;
        targetSets = scheme.sets;
        targetReps = scheme.reps;
        originalWeight = prescription.weight;
        home = {
          variantId: choice.state.id,
          perHand: choice.state.perHand,
          ...(choice.cappedFrom != null ? { cappedFrom: choice.cappedFrom } : {}),
          ...(choice.seeded ? { seed: choice.state.seed } : {}),
        };
      }
    }

    if (includeWarmUps && WARM_UP_TIERS.includes(templateEx.tier)) {
      for (const warmUp of generateWarmUpSets(weight, location, equipment)) {
        plan.push({
          exerciseId: templateEx.exerciseId,
          substituteExerciseId,
          tier: "warmup",
          targetSets: 1,
          targetReps: warmUp.reps,
          weight: warmUp.weight,
          originalWeight,
          isAMRAP: false,
          isWarmUp: true,
          completedSets: 0,
        });
      }
    }

    plan.push({
      exerciseId: templateEx.exerciseId,
      substituteExerciseId,
      tier: templateEx.tier,
      targetSets,
      targetReps,
      weight,
      originalWeight,
      isAMRAP: templateEx.isAMRAP,
      isWarmUp: false,
      completedSets: 0,
      ...home,
    });
  }

  for (const accessoryId of selectedAccessories ?? []) {
    if (!EXERCISES[accessoryId]) continue;
    plan.push({
      exerciseId: accessoryId,
      tier: "accessory",
      targetSets: 3,
      targetReps: 15,
      weight: DEFAULT_ACCESSORY_WEIGHTS[accessoryId] ?? 0,
      isAMRAP: true,
      isWarmUp: false,
      completedSets: 0,
    });
  }

  const marked = markReentries(plan, input.reentries);
  return input.edits?.length ? applyPlanEdits(marked, input.edits) : marked;
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
 * workouts (any order), and its plan. Unfinished workouts do not advance the rotation,
 * and neither do sessions `foldRotation` finds did not count (a day pulled out of
 * order, or one whose T1 lift was not done as prescribed).
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
  const { completedWorkouts, templates, plan } = input;

  const templateId = foldRotation(completedWorkouts).dueTemplateId;
  const template = templates[templateId];
  if (!template) {
    throw new Error(`Workout template not found: ${templateId}`);
  }

  let liftStates = input.liftStates;
  let variantStates = plan.variantStates ?? [];
  let reentries = plan.reentries;
  if (input.reentry) {
    const resolved = resolveReentry({
      liftStates,
      variantStates,
      location: plan.location,
      equipment: plan.equipment,
      template,
      ...(plan.strengthSets ? { strengthSets: plan.strengthSets } : {}),
      ...(plan.overrides ? { overrides: plan.overrides } : {}),
    });
    ({ liftStates, variantStates, reentries } = resolved);
  }

  return {
    templateId,
    template,
    plan: buildWorkoutPlan({ ...plan, template, liftStates, variantStates, reentries }),
    liftStates,
    variantStates,
  };
}
