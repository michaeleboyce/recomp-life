import type { StrengthSet } from "@/lib/strength";
import { getNextWorkoutId } from "@/lib/workoutTemplates";
import type {
  EquipmentProfile,
  LiftState,
  NextSetPlan,
  SetLog,
  Tier,
  UserSettings,
  VariantState,
  WorkoutLocation,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";
import { buildWorkoutPlan, describeNextWorkout } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
import { createSetLog } from "./logSet";
import { performedSetPlanKey } from "./nextSetPlans";
import { resolveNextWorkout } from "./nextWorkout";
import type { WorkoutPlan } from "./types";

export interface UpcomingEntry {
  exerciseId: string;
  /** The home substitute actually performed, when there is one. */
  substituteExerciseId?: string;
  tier: Tier;
  weight: number;
  sets: number;
  reps: number;
  isAMRAP: boolean;
  /**
   * True when this weight or stage assumes an earlier projected workout was
   * completed as prescribed (that lift's tier was advanced by the projection).
   */
  assumed: boolean;
}

export interface UpcomingWorkout {
  templateId: string;
  template: WorkoutTemplate;
  /** The full plan, warm-ups included when asked for. */
  plan: WorkoutPlan;
  /** Working entries only: no warm-ups, no accessories. */
  entries: UpcomingEntry[];
  /** False for the next workout (today's real plan); true for every later one. */
  projected: boolean;
}

export interface ProjectUpcomingInput {
  completedWorkouts: Pick<WorkoutSession, "templateId" | "startedAt" | "completedAt">[];
  templates: Record<string, WorkoutTemplate>;
  liftStates: LiftState[];
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  includeWarmUps: boolean;
  count: number;
  /** Supplies the training phase for the completion step; `equipment` above wins. */
  settings: UserSettings;
  /** Timestamp given to every simulated workout, so the result is deterministic. */
  now: Date;
  /** The home exercises' states; at home each lift is planned from its own. */
  variantStates?: VariantState[];
  /** Every logged set as strength evidence: seeds home exercises never used (H3). */
  strengthSets?: readonly StrengthSet[];
  /**
   * Resolve the states for a first session back at `location` once, before the first
   * workout (`resolveReentry`, H6), as `describeNextWorkout` does with `reentry`; the
   * projected workouts then follow from those states.
   */
  reentry?: boolean;
  /**
   * Next-session set plans (`UserSettings.nextSetPlans`, E6): each applies to the first
   * coming workout with that exercise performed at that tier, and is used up there.
   */
  nextSetPlans?: Readonly<Record<string, NextSetPlan>>;
}

/** `plans` without those `plan` uses (its working entries' exercise performed and tier). */
function withoutPlansUsedBy(
  plans: Readonly<Record<string, NextSetPlan>> | undefined,
  plan: WorkoutPlan
): Record<string, NextSetPlan> | undefined {
  if (!plans) return undefined;
  const used = new Set(plan.filter((e) => !e.isWarmUp).map(performedSetPlanKey));
  return Object.fromEntries(Object.entries(plans).filter(([key]) => !used.has(key)));
}

export interface SimulateCompletedWorkoutInput {
  template: WorkoutTemplate;
  plan: WorkoutPlan;
  liftStates: LiftState[];
  settings: UserSettings;
  location: WorkoutLocation;
  now: Date;
  /** The home exercises' states going in. */
  variantStates?: VariantState[];
}

/**
 * The full lift-state list after `plan` is performed with every set at exactly its
 * target reps (AMRAP sets too: no extra reps are assumed), run through the same
 * `computeCompletion` that finishing a real workout uses. Unchanged lifts are
 * included. Warm-ups and accessories are not logged: neither changes lift state.
 */
export function simulateCompletedWorkout(input: SimulateCompletedWorkoutInput): LiftState[] {
  return simulateCompletedWorkoutStates(input).liftStates;
}

/**
 * `simulateCompletedWorkout` with the home exercises' states too: at home the plan's
 * home exercises progress, not the lift states.
 */
export function simulateCompletedWorkoutStates(input: SimulateCompletedWorkoutInput): {
  liftStates: LiftState[];
  variantStates: VariantState[];
} {
  const { template, plan, liftStates, settings, location, now } = input;
  const variantStates = input.variantStates ?? [];
  const sets: SetLog[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp || entry.tier === "accessory") continue;
    for (let done = 0; done < entry.targetSets; done++) {
      const id = `simulated-${template.id}-${entry.exerciseId}-${entry.tier}-${done + 1}`;
      sets.push(
        createSetLog({
          exercise: { ...entry, completedSets: done },
          actualReps: entry.targetReps,
          rpe: null,
          location,
          autoRegulated: false,
          now,
          id,
          clientId: id,
        })
      );
    }
  }

  const session: WorkoutSession = {
    id: `simulated-${template.id}`,
    clientId: `simulated-${template.id}`,
    templateId: template.id,
    location,
    startedAt: now,
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };

  const { liftStateUpdates, variantStateUpdates } = computeCompletion({
    session,
    plan,
    sets,
    liftStates,
    settings,
    recentE1RMsByExercise: {},
    currentExerciseIndex: plan.length,
    workoutStartTime: null,
    now,
    variantStates,
  });
  const updated = new Map(liftStateUpdates.map((ls) => [ls.exerciseId, ls]));
  const variants = new Map(variantStates.map((v) => [v.id, v]));
  for (const update of variantStateUpdates) variants.set(update.id, update);
  return {
    liftStates: liftStates.map((ls) => updated.get(ls.exerciseId) ?? ls),
    variantStates: [...variants.values()],
  };
}

function toEntries(plan: WorkoutPlan, advanced: Set<string>): UpcomingEntry[] {
  return plan
    .filter((e) => !e.isWarmUp && e.tier !== "accessory")
    .map((e) => ({
      exerciseId: e.exerciseId,
      ...(e.substituteExerciseId ? { substituteExerciseId: e.substituteExerciseId } : {}),
      tier: e.tier,
      weight: e.weight,
      sets: e.targetSets,
      reps: e.targetReps,
      isAMRAP: e.isAMRAP,
      assumed: advanced.has(`${e.exerciseId}:${e.tier}`),
    }));
}

/**
 * The next `count` workouts in rotation order. The first is exactly
 * `describeNextWorkout`; each later one assumes every earlier one was completed
 * with every set at its target reps (`simulateCompletedWorkout`). Pure: the given
 * lift states are not changed. A sequence, not a calendar: no dates are forecast.
 */
export function projectUpcomingWorkouts(input: ProjectUpcomingInput): UpcomingWorkout[] {
  const { completedWorkouts, templates, location, equipment, includeWarmUps, count, now } = input;
  if (count <= 0) return [];

  const settings: UserSettings = { ...input.settings, equipment };
  const planOptions = {
    location,
    equipment,
    includeWarmUps,
    selectedAccessories: [],
    ...(input.strengthSets ? { strengthSets: input.strengthSets } : {}),
  };
  // The first is the next workout exactly as every screen resolves it. Re-entry is
  // worked out once, for every lift, from the real states: the simulated sessions after
  // it carry its weights on, and their made-up dates must not trigger it again.
  const first = input.reentry
    ? resolveNextWorkout({
        completedWorkouts,
        templates,
        liftStates: input.liftStates,
        variantStates: input.variantStates ?? [],
        ...(input.strengthSets ? { strengthSets: input.strengthSets } : {}),
        settings: { equipment, showWarmUps: includeWarmUps, nextSetPlans: input.nextSetPlans },
        location,
        reentry: "everyLift",
        accessories: false,
      })
    : describeNextWorkout({
        completedWorkouts,
        templates,
        liftStates: input.liftStates,
        plan: {
          ...planOptions,
          variantStates: input.variantStates,
          ...(input.nextSetPlans ? { nextSetPlans: input.nextSetPlans } : {}),
        },
      });
  let setPlans = withoutPlansUsedBy(input.nextSetPlans, first.plan);

  const advanced = new Set<string>();
  const result: UpcomingWorkout[] = [
    {
      templateId: first.templateId,
      template: first.template,
      plan: first.plan,
      entries: toEntries(first.plan, advanced),
      projected: false,
    },
  ];

  let previous = { templateId: first.templateId, template: first.template, plan: first.plan };
  let liftStates = first.liftStates ?? input.liftStates;
  let variantStates = first.variantStates ?? input.variantStates ?? [];
  while (result.length < count) {
    ({ liftStates, variantStates } = simulateCompletedWorkoutStates({
      template: previous.template,
      plan: previous.plan,
      liftStates,
      settings,
      location,
      now,
      variantStates,
    }));
    for (const e of previous.plan) {
      if (!e.isWarmUp && (e.tier === "T1" || e.tier === "T2")) {
        advanced.add(`${e.exerciseId}:${e.tier}`);
      }
    }
    const templateId = getNextWorkoutId(previous.templateId);
    const template = templates[templateId];
    if (!template) throw new Error(`Workout template not found: ${templateId}`);
    const plan = buildWorkoutPlan({
      ...planOptions,
      template,
      liftStates,
      variantStates,
      ...(setPlans ? { nextSetPlans: setPlans } : {}),
    });
    setPlans = withoutPlansUsedBy(setPlans, plan);
    result.push({ templateId, template, plan, entries: toEntries(plan, advanced), projected: true });
    previous = { templateId, template, plan };
  }
  return result;
}
