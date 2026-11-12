import { getNextWorkoutId } from "@/lib/workoutTemplates";
import type {
  EquipmentProfile,
  LiftState,
  SetLog,
  Tier,
  UserSettings,
  WorkoutLocation,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";
import { buildWorkoutPlan, describeNextWorkout } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
import { createSetLog } from "./logSet";
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
}

export interface SimulateCompletedWorkoutInput {
  template: WorkoutTemplate;
  plan: WorkoutPlan;
  liftStates: LiftState[];
  settings: UserSettings;
  location: WorkoutLocation;
  now: Date;
}

/**
 * The full lift-state list after `plan` is performed with every set at exactly its
 * target reps (AMRAP sets too: no extra reps are assumed), run through the same
 * `computeCompletion` that finishing a real workout uses. Unchanged lifts are
 * included. Warm-ups and accessories are not logged: neither changes lift state.
 */
export function simulateCompletedWorkout(input: SimulateCompletedWorkoutInput): LiftState[] {
  const { template, plan, liftStates, settings, location, now } = input;
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

  const { liftStateUpdates } = computeCompletion({
    session,
    plan,
    sets,
    liftStates,
    settings,
    recentE1RMsByExercise: {},
    currentExerciseIndex: plan.length,
    workoutStartTime: null,
    now,
  });
  const updated = new Map(liftStateUpdates.map((ls) => [ls.exerciseId, ls]));
  return liftStates.map((ls) => updated.get(ls.exerciseId) ?? ls);
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
  const planOptions = { location, equipment, includeWarmUps, selectedAccessories: [] };
  const first = describeNextWorkout({
    completedWorkouts,
    templates,
    liftStates: input.liftStates,
    plan: planOptions,
  });

  const advanced = new Set<string>();
  const result: UpcomingWorkout[] = [
    { ...first, entries: toEntries(first.plan, advanced), projected: false },
  ];

  let previous = first;
  let liftStates = input.liftStates;
  while (result.length < count) {
    liftStates = simulateCompletedWorkout({
      template: previous.template,
      plan: previous.plan,
      liftStates,
      settings,
      location,
      now,
    });
    for (const e of previous.plan) {
      if (!e.isWarmUp && (e.tier === "T1" || e.tier === "T2")) {
        advanced.add(`${e.exerciseId}:${e.tier}`);
      }
    }
    const templateId = getNextWorkoutId(previous.templateId);
    const template = templates[templateId];
    if (!template) throw new Error(`Workout template not found: ${templateId}`);
    const plan = buildWorkoutPlan({ ...planOptions, template, liftStates });
    result.push({ templateId, template, plan, entries: toEntries(plan, advanced), projected: true });
    previous = { templateId, template, plan };
  }
  return result;
}
