import { getExercise } from "@/lib/exercises";
import { evaluateT1Progression, evaluateT2Progression } from "@/lib/progression";
import { getNextWorkoutId } from "@/lib/workoutTemplates";
import type {
  EquipmentProfile,
  LiftState,
  SetLog,
  Tier,
  WorkoutLocation,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";
import { buildWorkoutPlan, describeNextWorkout } from "./buildPlan";
import type { WorkoutExerciseState, WorkoutPlan } from "./types";

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
}

const EVALUATE = { T1: evaluateT1Progression, T2: evaluateT2Progression } as const;

/** Every target set hit exactly, as `computeCompletion` would receive them. */
function syntheticSets(entry: WorkoutExerciseState, location: WorkoutLocation): SetLog[] {
  return Array.from({ length: entry.targetSets }, (_, i) => ({
    id: `projected-${entry.exerciseId}-${entry.tier}-${i}`,
    clientId: `projected-${entry.exerciseId}-${entry.tier}-${i}`,
    exerciseId: entry.exerciseId,
    substituteExerciseId: entry.substituteExerciseId,
    tier: entry.tier,
    setNumber: i + 1,
    targetReps: entry.targetReps,
    actualReps: entry.targetReps,
    weight: entry.weight,
    isAMRAP: entry.isAMRAP && i === entry.targetSets - 1,
    completedAt: new Date(0),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: Boolean(entry.substituteExerciseId),
    location,
    synced: false,
  }));
}

/**
 * Lift states after completing `plan` as prescribed. T1 and T2 go through the same
 * progression functions `computeCompletion` uses. T3 is left alone: at the minimum
 * target reps the T3 rule (last AMRAP set of 25+, or 50 total when not cutting)
 * never fires.
 */
function advance(
  plan: WorkoutPlan,
  liftStates: Map<string, LiftState>,
  location: WorkoutLocation,
  equipment: EquipmentProfile,
  advanced: Set<string>
): void {
  for (const entry of plan) {
    if (entry.isWarmUp || (entry.tier !== "T1" && entry.tier !== "T2")) continue;
    const state = liftStates.get(entry.exerciseId);
    if (!state) continue;
    const liftType = getExercise(entry.exerciseId).muscleGroup === "legs" ? "lower" : "upper";
    const next = EVALUATE[entry.tier](
      state,
      syntheticSets(entry, location),
      location,
      equipment,
      liftType
    );
    liftStates.set(entry.exerciseId, next);
    advanced.add(`${entry.exerciseId}:${entry.tier}`);
  }
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
 * with every set at its target reps. Pure: the given lift states are not changed.
 */
export function projectUpcomingWorkouts(input: ProjectUpcomingInput): UpcomingWorkout[] {
  const { completedWorkouts, templates, location, equipment, includeWarmUps, count } = input;
  if (count <= 0) return [];

  const planOptions = { location, equipment, includeWarmUps, selectedAccessories: [] };
  const first = describeNextWorkout({
    completedWorkouts,
    templates,
    liftStates: input.liftStates,
    plan: planOptions,
  });

  const states = new Map(input.liftStates.map((ls) => [ls.exerciseId, ls]));
  const advanced = new Set<string>();
  const result: UpcomingWorkout[] = [
    { ...first, entries: toEntries(first.plan, advanced), projected: false },
  ];

  let previous = first;
  while (result.length < count) {
    advance(previous.plan, states, location, equipment, advanced);
    const templateId = getNextWorkoutId(previous.templateId);
    const template = templates[templateId];
    if (!template) throw new Error(`Workout template not found: ${templateId}`);
    const plan = buildWorkoutPlan({
      ...planOptions,
      template,
      liftStates: [...states.values()],
    });
    result.push({ templateId, template, plan, entries: toEntries(plan, advanced), projected: true });
    previous = { templateId, template, plan };
  }
  return result;
}
