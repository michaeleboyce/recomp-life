// Test-only: a stand-in for the live app (start workout, log sets, finish) that keeps
// lift states incrementally, the way `useActiveWorkout` does, so tests can compare the
// result with a rebuild from the log. Not exported from index.ts.
import { calculateE1RM, isE1RMEligibleSet, toRecentE1RMSeries } from "@/lib/e1rm";
import { roundToNearest5 } from "@/lib/progression";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { computeCompletion } from "@/lib/workout/completeWorkout";
import { createSetLog } from "@/lib/workout/logSet";
import { getPrescription } from "@/lib/workout/prescription";
import { SETTINGS, makeSession, seedLiftStates } from "@/lib/workout/testFixtures";
import { WORKOUT_ROTATION, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  AdjustableField,
  Estimated1RM,
  LiftAdjustment,
  LiftState,
  PrescribedEntry,
  SetLog,
  UserSettings,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";
import type { RebuildInput } from "./types";

export const SIM_START = new Date("2026-01-01T00:00:00Z");
const FIRST_WORKOUT = new Date("2026-01-05T09:00:00Z").getTime();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** How one tier of a simulated session goes. Everything defaults to "as prescribed". */
export interface TierOutcome {
  /** How many sets are logged; default all of them. */
  sets?: number;
  /** Reps per logged set; a missing entry means the target. */
  reps?: (number | undefined)[];
  /** Reps of the last prescribed set (the AMRAP set for T1 and T3). */
  lastReps?: number;
  rpe?: number | null;
  /** T2 only: accept a load drop after the first set. */
  drop?: boolean;
}

export const PASS: TierOutcome = {};
/** The last set misses its target by one rep. */
export const FAIL: TierOutcome = { lastReps: -1 };
export const PARTIAL: TierOutcome = { sets: 1 };

export interface SessionOptions {
  templateId?: string;
  location?: WorkoutLocation;
  startedAt?: Date;
  t1?: TierOutcome;
  t2?: TierOutcome;
  t3?: TierOutcome;
}

export interface Sim {
  settings: UserSettings;
  /** Lift states kept incrementally, as the live app stores them. */
  states: LiftState[];
  workouts: WorkoutSession[];
  adjustments: LiftAdjustment[];
  /** e1RM rows as the live app writes them while logging. */
  e1rms: Estimated1RM[];
  ids: number;
}

export function makeAdjustment(
  exerciseId: string,
  set: LiftAdjustment["set"],
  at: Date,
  overrides: Partial<LiftAdjustment> = {}
): LiftAdjustment {
  return {
    id: `adj-${exerciseId}-${at.getTime()}`,
    clientId: `adj-${exerciseId}-${at.getTime()}`,
    exerciseId,
    at,
    source: "manual",
    set,
    synced: false,
    ...overrides,
  };
}

/** The seeded starting weights as `start` adjustments. */
export function startAdjustments(at: Date = SIM_START): LiftAdjustment[] {
  return seedLiftStates().map((ls) =>
    makeAdjustment(
      ls.exerciseId,
      { t1Weight: ls.t1Weight, t2Weight: ls.t2Weight, t3Weight: ls.t3Weight },
      at,
      { id: `start-${ls.exerciseId}`, clientId: `start-${ls.exerciseId}`, source: "start" }
    )
  );
}

export function startSim(settings: UserSettings = SETTINGS): Sim {
  return {
    settings,
    states: seedLiftStates(),
    workouts: [],
    adjustments: startAdjustments(),
    e1rms: [],
    ids: 0,
  };
}

export function rebuildInput(sim: Sim, settings: UserSettings = sim.settings): RebuildInput {
  return { workouts: sim.workouts, adjustments: sim.adjustments, settings };
}

/** A manual change outside a workout: updates the live state and records the event. */
export function adjust(
  sim: Sim,
  exerciseId: string,
  set: LiftAdjustment["set"],
  at: Date
): LiftAdjustment {
  sim.states = sim.states.map((ls) => (ls.exerciseId === exerciseId ? { ...ls, ...set } : ls));
  sim.ids += 1;
  const adjustment = makeAdjustment(exerciseId, set, at, {
    id: `adj-${sim.ids}`,
    clientId: `adj-${sim.ids}`,
  });
  sim.adjustments.push(adjustment);
  return adjustment;
}

export function prescribedFor(templateId: string, states: LiftState[]): PrescribedEntry[] {
  const byId = new Map(states.map((ls) => [ls.exerciseId, ls]));
  return WORKOUT_TEMPLATES[templateId].exercises
    .filter((ex) => ex.tier === "T1" || ex.tier === "T2" || ex.tier === "T3")
    .map((ex) => {
      const state = byId.get(ex.exerciseId);
      const stage =
        ex.tier === "T1" ? state?.t1Stage : ex.tier === "T2" ? state?.t2Stage : undefined;
      return {
        exerciseId: ex.exerciseId,
        tier: ex.tier,
        ...getPrescription(ex, state),
        ...(stage ? { stage } : {}),
      };
    });
}

/** When the next simulated workout starts by default: one every two days. */
export function nextStart(sim: Sim): Date {
  return new Date(FIRST_WORKOUT + sim.workouts.length * 2 * DAY);
}

/**
 * Starts, performs and finishes one workout the way the live app does: the plan and the
 * stored prescription come from the current states, every set goes through
 * `createSetLog`, and finishing calls `computeCompletion` directly.
 */
export function runSession(sim: Sim, options: SessionOptions = {}): WorkoutSession {
  const index = sim.workouts.length;
  const templateId = options.templateId ?? WORKOUT_ROTATION[index % WORKOUT_ROTATION.length];
  const template = WORKOUT_TEMPLATES[templateId];
  const location = options.location ?? "gym";
  const startedAt = options.startedAt ?? nextStart(sim);
  const { settings } = sim;

  const session = makeSession({
    id: `w${index + 1}`,
    clientId: `w${index + 1}`,
    templateId,
    location,
    startedAt,
    prescribed: prescribedFor(templateId, sim.states),
  });
  const plan = buildWorkoutPlan({
    template,
    liftStates: sim.states,
    location,
    equipment: settings.equipment,
    includeWarmUps: false,
    selectedAccessories: [],
  });

  const sets: SetLog[] = [];
  let clock = startedAt.getTime();
  for (const entry of plan) {
    const outcome =
      (entry.tier === "T1" ? options.t1 : entry.tier === "T2" ? options.t2 : options.t3) ?? {};
    const count = Math.min(outcome.sets ?? entry.targetSets, entry.targetSets);
    for (let done = 0; done < count; done++) {
      clock += 3 * MINUTE;
      const now = new Date(clock);
      const isLast = done === entry.targetSets - 1;
      let reps = outcome.reps?.[done] ?? entry.targetReps;
      if (isLast && outcome.lastReps !== undefined) {
        reps = outcome.lastReps < 0 ? entry.targetReps + outcome.lastReps : outcome.lastReps;
      }
      reps = Math.max(0, reps);
      const dropped = !!outcome.drop && entry.tier === "T2" && done > 0;
      const exercise = dropped
        ? {
            ...entry,
            weight: roundToNearest5(entry.weight * 0.95),
            originalWeight: entry.originalWeight ?? entry.weight,
            completedSets: done,
          }
        : { ...entry, completedSets: done };
      sim.ids += 1;
      const set = createSetLog({
        exercise,
        actualReps: reps,
        rpe: outcome.rpe ?? null,
        location,
        autoRegulated: dropped,
        now,
        id: `s${sim.ids}`,
        clientId: `s${sim.ids}`,
      });
      sets.push(set);

      // Same rule as `useActiveWorkout.logSet`.
      if (!exercise.substituteExerciseId && isE1RMEligibleSet(entry.tier, set.isAMRAP, reps)) {
        const e1rm = calculateE1RM(exercise.weight, reps, outcome.rpe ?? null);
        if (e1rm) {
          sim.e1rms.push({
            id: `live-${set.id}`,
            clientId: `live-${set.id}`,
            date: now,
            exerciseId: entry.exerciseId,
            workingWeight: exercise.weight,
            repsCompleted: reps,
            estimated1RM: e1rm,
            workoutSessionId: session.id,
            synced: false,
          });
        }
      }
    }
  }

  const recentE1RMsByExercise: Record<string, number[]> = {};
  for (const ex of template.exercises) {
    if (ex.tier !== "T1" && ex.tier !== "T2") continue;
    recentE1RMsByExercise[ex.exerciseId] = toRecentE1RMSeries(
      sim.e1rms.filter((row) => row.exerciseId === ex.exerciseId)
    );
  }
  const result = computeCompletion({
    session,
    plan,
    sets,
    liftStates: sim.states,
    settings,
    recentE1RMsByExercise,
    currentExerciseIndex: plan.length,
    workoutStartTime: startedAt,
    now: new Date(clock + 5 * MINUTE),
  });

  const updated = new Map(result.liftStateUpdates.map((ls) => [ls.exerciseId, ls]));
  sim.states = sim.states.map((ls) => updated.get(ls.exerciseId) ?? ls);

  const finished: WorkoutSession = {
    ...session,
    ...result.sessionPatch,
    completionContext: {
      phaseMode: settings.trainingPhase.mode,
      gymBarbellIncrementLbs: settings.equipment.gymBarbellIncrementLbs,
      dumbbellIncrementLbs: settings.equipment.dumbbellIncrementLbs,
    },
  };
  sim.workouts.push(finished);
  return finished;
}

/** The fields a rebuild must reproduce exactly. */
export const PROGRESSION_FIELDS = [
  "t1Weight",
  "t1Stage",
  "t1FailCount",
  "t1LastResetWeight",
  "t2Weight",
  "t2Stage",
  "t2FailCount",
  "t2LastResetWeight",
  "t3Weight",
  "t1LastWorkoutDate",
  "t2LastWorkoutDate",
  "recentAvgRPEs",
  "recentAMRAPReps",
  "recentE1RMs",
] as const satisfies readonly (AdjustableField | keyof LiftState)[];

export function progressionView(states: LiftState[]): Record<string, Record<string, unknown>> {
  const view: Record<string, Record<string, unknown>> = {};
  for (const ls of [...states].sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1))) {
    view[ls.exerciseId] = Object.fromEntries(PROGRESSION_FIELDS.map((f) => [f, ls[f]]));
  }
  return view;
}

export function stateOf(states: LiftState[], exerciseId: string): LiftState {
  const state = states.find((ls) => ls.exerciseId === exerciseId);
  if (!state) throw new Error(`No lift state for ${exerciseId}`);
  return state;
}
