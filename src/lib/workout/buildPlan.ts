import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES, getExercise } from "@/lib/exercises";
import { generateWarmUpSets } from "@/lib/warmups";
import { getNextWorkoutId } from "@/lib/workoutTemplates";
import type {
  LiftState,
  Tier,
  WorkoutModification,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";
import { getPrescription } from "./prescription";
import type { BuildPlanInput, NextWorkoutDescription, WorkoutPlan } from "./types";

/** Tiers that get generated warm-up sets when warm-ups are enabled. */
export const WARM_UP_TIERS: readonly Tier[] = ["T1"];

/**
 * The ordered list of everything performed in a workout: for each template exercise
 * its warm-up entries (when enabled and the tier is in WARM_UP_TIERS) followed by the
 * working entry, then the selected accessories. Every entry starts at completedSets 0.
 *
 * At home, gym-only exercises are adapted with `adaptExerciseForHome`; an entry in
 * `overrides` selects one of that adaptation's alternatives instead of the default.
 */
export function buildWorkoutPlan(input: BuildPlanInput): WorkoutPlan {
  const { template, liftStates, location, equipment, includeWarmUps, selectedAccessories } = input;
  const overrides = input.overrides ?? {};

  const liftStateById = new Map(liftStates.map((ls) => [ls.exerciseId, ls]));
  const plan: WorkoutPlan = [];

  for (const templateEx of template.exercises) {
    const exercise = getExercise(templateEx.exerciseId);
    const prescription = getPrescription(templateEx, liftStateById.get(templateEx.exerciseId));

    let substituteExerciseId: string | undefined;
    let weight = prescription.weight;
    let originalWeight: number | undefined;

    if (location === "home") {
      // Same call and same override rule as the Configure screen, so what was
      // previewed there is what gets performed.
      const adaptation = adaptExerciseForHome(
        exercise,
        prescription.weight,
        equipment,
        exercise.dumbbellAlternative ? EXERCISES[exercise.dumbbellAlternative] : undefined
      );
      const overrideId = overrides[templateEx.exerciseId];
      const chosen = overrideId
        ? adaptation.alternatives.find((alt) => alt.exercise.id === overrideId)
        : undefined;
      const adaptedExercise = chosen?.exercise ?? adaptation.adaptedExercise;
      const adaptedWeight = chosen?.weight ?? adaptation.adaptedWeight;

      // "no_substitute" and exercises that already work at home come back as the
      // template exercise itself: nothing is substituted.
      if (adaptedExercise.id !== exercise.id) {
        substituteExerciseId = adaptedExercise.id;
        weight = adaptedWeight;
        originalWeight = prescription.weight;
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
      targetSets: prescription.sets,
      targetReps: prescription.reps,
      weight,
      originalWeight,
      isAMRAP: templateEx.isAMRAP,
      isWarmUp: false,
      completedSets: 0,
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

  return plan;
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
 * workouts (any order), and its plan. Unfinished workouts do not advance the rotation.
 */
export function describeNextWorkout(input: {
  completedWorkouts: Pick<WorkoutSession, "templateId" | "startedAt" | "completedAt">[];
  templates: Record<string, WorkoutTemplate>;
  liftStates: LiftState[];
  plan: Omit<BuildPlanInput, "template" | "liftStates">;
}): NextWorkoutDescription {
  const { completedWorkouts, templates, liftStates, plan } = input;

  let last: (typeof completedWorkouts)[number] | undefined;
  for (const workout of completedWorkouts) {
    if (workout.completedAt == null) continue;
    if (!last || timeOf(workout.startedAt) > timeOf(last.startedAt)) last = workout;
  }

  const templateId = last ? getNextWorkoutId(last.templateId) : "A1";
  const template = templates[templateId];
  if (!template) {
    throw new Error(`Workout template not found: ${templateId}`);
  }

  return {
    templateId,
    template,
    plan: buildWorkoutPlan({ ...plan, template, liftStates }),
  };
}

function timeOf(date: Date): number {
  return new Date(date).getTime();
}
