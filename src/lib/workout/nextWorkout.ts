// The next workout, resolved once from one input record: the due day of the rotation,
// the states after re-entry, each lift and the plan. Every screen that shows the next
// workout (Today's rows and forecast, the ledger, the coming workouts) reads this. Pure.
import { sessionPaceCorrection, type PaceSession } from "@/lib/forecast/sessionLength";
import type { StrengthSet } from "@/lib/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, UserSettings, VariantState, WorkoutLocation, WorkoutTemplate } from "@/types";
import type { AccessorySettings } from "./accessoryPlan";
import type { RotationSession } from "./credit";
import { dueTemplateId } from "./rotation";
import { planWorkoutStart, type WorkoutStartPlan } from "./startPlan";
import type { NextWorkoutDescription } from "./types";

/** Everything the next workout is worked out from. */
export interface NextWorkoutInput {
  /**
   * The finished workouts (any order): the rotation is folded from them, and the
   * session length the accessories are kept to is corrected by the lifter's pace in them
   * (`sessionPaceCorrection`, the factor the session-length forecast applies).
   */
  completedWorkouts: readonly (RotationSession & Partial<PaceSession>)[];
  liftStates: LiftState[];
  /** The home exercises' own states. */
  variantStates: VariantState[];
  /**
   * Every set as strength evidence, app and imported, with the hand-set home weights not
   * lifted yet (`useStrengthEvidence` / `strengthSetsFrom`): seeds (H3) and re-entry (H6).
   * Left out (a projection given none), seeds use the starting ratio and re-entry the steps.
   */
  strengthSets?: readonly StrengthSet[];
  /**
   * Equipment, warm-ups, the saved default location and the next-session set plans (E6),
   * and what the accessories are chosen from (phase, preferences, the accessory mode,
   * pins and hand-set weights; absent ones read as their defaults).
   */
  settings: Pick<UserSettings, "equipment" | "showWarmUps" | "defaultLocation" | "nextSetPlans"> &
    Partial<Omit<AccessorySettings, "equipment">>;
  /** Where it is done; left out, the saved default, else the gym. */
  location?: WorkoutLocation;
  /**
   * Re-entry for the day's lifts ("day", the default), or for every program lift
   * ("everyLift": a projection of several workouts carries the states on).
   */
  reentry?: "day" | "everyLift";
  /** The templates; left out, the program's. */
  templates?: Record<string, WorkoutTemplate>;
  /**
   * Plan the accessories (A6; the default): chosen and prescribed as the start will
   * (`planAccessories`). False for a projection of the program alone (Coming up).
   */
  accessories?: boolean;
  /** When it is planned for: the accessories are worked out for this calendar day. Left out, now. */
  now?: Date;
}

/** The next workout as every screen reads it. */
export interface ResolvedNextWorkout extends NextWorkoutDescription, WorkoutStartPlan {
  location: WorkoutLocation;
  /** The states after re-entry, the ones the plan was built from. */
  liftStates: LiftState[];
  variantStates: VariantState[];
}

/**
 * The next workout in the A1 -> B1 -> A2 -> B2 rotation, resolved once: the due day
 * (`dueTemplateId`), then exactly what starting it now with no change on Configure would
 * plan and store (`planWorkoutStart`: re-entry, each lift resolved, the prescription,
 * the next-session set plans, the accessories). Warm-ups follow the settings; the
 * accessories follow the accessory mode ("auto" by default) and are the same on every
 * path for the same day.
 */
export function resolveNextWorkout(input: NextWorkoutInput): ResolvedNextWorkout {
  const { settings } = input;
  const templates = input.templates ?? WORKOUT_TEMPLATES;
  const templateId = dueTemplateId(input.completedWorkouts);
  const template = templates[templateId];
  if (!template) throw new Error(`Workout template not found: ${templateId}`);
  const location = input.location ?? settings.defaultLocation ?? "gym";
  const now = input.now ?? new Date();
  const start = planWorkoutStart({
    template,
    liftStates: input.liftStates,
    variantStates: input.variantStates,
    location,
    equipment: settings.equipment,
    includeWarmUps: settings.showWarmUps,
    selectedAccessories: [],
    ...(input.strengthSets ? { strengthSets: input.strengthSets } : {}),
    ...(settings.nextSetPlans ? { nextSetPlans: settings.nextSetPlans } : {}),
    reentry: input.reentry ?? "day",
    ...(input.accessories === false
      ? {}
      : {
          accessories: {
            settings: { ...settings, trainingPhase: settings.trainingPhase ?? { mode: "maintaining" } },
            strengthSets: input.strengthSets ?? [],
            now,
            pace: sessionPaceCorrection(input.completedWorkouts, now, settings.trainingPhase),
          },
        }),
  });
  return { templateId, template, location, ...start };
}
