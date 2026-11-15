// Test-only builders for the forecast tests. Not exported from index.ts.
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { runSession, startSim, stateOf } from "@/lib/rebuild/testHelpers";
import { T1_STAGE_SCHEME } from "@/lib/workout/prescription";
import { makeSession, makeSet } from "@/lib/workout/testFixtures";
import { WORKOUT_ROTATION, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  BodyweightLog,
  Forecast,
  LiftAdjustment,
  SetLog,
  T1Stage,
  TrainingPhase,
  UserSettings,
  WorkoutSession,
} from "@/types";
import type { ReplayInput } from "./replay";
import { repsIndex } from "./reps";
import type { ForecastSource } from "./types";

export const DAY = 24 * 60 * 60 * 1000;
export const WEEK = 7 * DAY;
export const SETTINGS: UserSettings = DEFAULT_USER_PROFILE.settings;

/** Settings with another training phase. */
export function settingsIn(mode: TrainingPhase["mode"]): UserSettings {
  return { ...SETTINGS, trainingPhase: { ...SETTINGS.trainingPhase, mode } };
}

export interface T1SessionSpec {
  id: string;
  exerciseId?: string;
  /** When the workout started; it finishes 40 minutes later. */
  at: Date;
  weight: number;
  /** Reps on the last set. */
  lastReps: number;
  stage?: T1Stage;
  /** Reps of the sets before the last; default the stage's target on each. */
  earlierReps?: number[];
  phase?: TrainingPhase["mode"];
  substituteExerciseId?: string;
  overrides?: Partial<WorkoutSession>;
  setOverrides?: Partial<SetLog>;
}

/** A finished workout holding one T1 lift: its working sets, the last one as-many-as-you-can. */
export function t1Session(spec: T1SessionSpec): WorkoutSession {
  const exerciseId = spec.exerciseId ?? "squat";
  const stage = spec.stage ?? "5x3";
  const scheme = T1_STAGE_SCHEME[stage];
  const startMs = spec.at.getTime();
  const sets: SetLog[] = [];
  for (let n = 1; n <= scheme.sets; n++) {
    const isLast = n === scheme.sets;
    const reps = isLast ? spec.lastReps : (spec.earlierReps?.[n - 1] ?? scheme.reps);
    sets.push(
      makeSet(exerciseId, "T1", {
        id: `${spec.id}-s${n}`,
        clientId: `${spec.id}-s${n}`,
        setNumber: n,
        targetReps: scheme.reps,
        actualReps: reps,
        weight: spec.weight,
        isAMRAP: isLast,
        completedAt: new Date(startMs + n * 4 * 60_000),
        status: reps >= scheme.reps ? "completed" : "failed",
        isSubstituted: !!spec.substituteExerciseId,
        substituteExerciseId: spec.substituteExerciseId,
        ...spec.setOverrides,
      })
    );
  }
  return makeSession({
    id: spec.id,
    clientId: spec.id,
    startedAt: spec.at,
    completedAt: new Date(startMs + 40 * 60_000),
    totalDurationSeconds: 40 * 60,
    sets,
    prescribed: [
      { exerciseId, tier: "T1", weight: spec.weight, sets: scheme.sets, reps: scheme.reps, stage },
    ],
    completionContext: {
      phaseMode: spec.phase ?? SETTINGS.trainingPhase.mode,
      gymBarbellIncrementLbs: SETTINGS.equipment.gymBarbellIncrementLbs,
      dumbbellIncrementLbs: SETTINGS.equipment.dumbbellIncrementLbs,
    },
    ...spec.overrides,
  });
}

/** A source with nothing in it but the given parts. */
export function sourceAt(now: Date, parts: Partial<ForecastSource> = {}): ForecastSource {
  return {
    workouts: [],
    bodyweight: [],
    liftStates: [],
    bestE1RMs: {},
    settings: SETTINGS,
    now,
    ...parts,
  };
}

export function weighIn(id: string, date: Date, weight: number): BodyweightLog {
  return { id, clientId: id, date, weight, timeOfDay: "morning", synced: false };
}

/** A forecast row with plain defaults, for resolver and scoring tests. */
export function forecastRow(overrides: Partial<Forecast> = {}): Forecast {
  return {
    id: "fc:w1:amrapReps:squat:T1",
    clientId: "fc:w1:amrapReps:squat:T1",
    slot: "fc:w1:amrapReps:squat:T1",
    kind: "amrapReps",
    workoutId: "w1",
    exerciseId: "squat",
    tier: "T1",
    madeAt: new Date("2026-11-02T17:00:00Z"),
    dueAt: new Date("2026-11-02T17:40:00Z"),
    event: { type: "amrapReps", weight: 200 },
    prediction: { point: 5, low: 3, high: 6, unit: "reps" },
    basis: "trend",
    inputs: { sdScale: 1 },
    modelVersion: "reps-1",
    synced: false,
    ...overrides,
  };
}

/** The demo log as replay input. */
export function demoReplayInput(now: Date): ReplayInput {
  const demo = generateDemoData(now);
  return {
    workouts: demo.workouts,
    adjustments: demo.liftAdjustments,
    bodyweight: demo.bodyweight,
    settings: SETTINGS,
    now,
  };
}

/** A repeatable pseudo-random number in [0, 1) for an integer seed (mulberry32 step). */
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A repeatable standard normal draw (Box-Muller) for an integer seed. */
function randNormal(seed: number): number {
  const u = Math.max(rand(seed * 2 + 1), 1e-12);
  const v = rand(seed * 2 + 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SimulatedLifter {
  seed: number;
  sessions: number;
  /** Day-to-day scatter of strength, as a fraction of the level. */
  noise: number;
  /** Growth of the strength level per week, as a fraction. */
  weeklyGain: number;
  /** Reps above the target the lifter starts with at the starting weights. */
  headroomReps: number;
}

const GAP_DAYS = [2, 3, 2];
const FIRST_START = new Date("2026-01-05T17:30:00Z").getTime();

/**
 * A log produced by a lifter whose strength behaves as the reps model assumes: a
 * level per lift that grows steadily, with bell-shaped day-to-day scatter, turned
 * into whole reps at whatever weight the program prescribes. The program itself is
 * the real one (`runSession` goes through the plan, the set logger and progression),
 * so weights rise after a pass and the lift changes stage or resets after a miss.
 */
export function simulateLifter(lifter: SimulatedLifter): ReplayInput {
  const sim = startSim(SETTINGS);
  const startLevel = new Map<string, number>();
  let start = FIRST_START;

  for (let i = 0; i < lifter.sessions; i++) {
    const template = WORKOUT_TEMPLATES[WORKOUT_ROTATION[i % WORKOUT_ROTATION.length]];
    const t1 = template.exercises.find((ex) => ex.tier === "T1")!;
    const state = stateOf(sim.states, t1.exerciseId);
    const scheme = T1_STAGE_SCHEME[state.t1Stage];

    if (!startLevel.has(t1.exerciseId)) {
      startLevel.set(
        t1.exerciseId,
        repsIndex(state.t1Weight, scheme.reps + lifter.headroomReps + 0.5)
      );
    }
    const weeks = (start - FIRST_START) / WEEK;
    const level = startLevel.get(t1.exerciseId)! * (1 + lifter.weeklyGain * weeks);
    const today = level * (1 + lifter.noise * randNormal(lifter.seed * 1000 + i));
    // Whole reps the lifter has in them at this weight on the last set.
    const capacity = Math.max(0, Math.floor(30 * (today / state.t1Weight - 1)));
    // The sets before the last are a rep easier than the last one.
    const earlier = Math.min(scheme.reps, capacity + 1);

    runSession(sim, {
      startedAt: new Date(start),
      t1: { reps: Array.from({ length: scheme.sets - 1 }, () => earlier), lastReps: capacity },
    });
    start += GAP_DAYS[i % GAP_DAYS.length] * DAY;
  }

  return {
    workouts: sim.workouts,
    adjustments: sim.adjustments as LiftAdjustment[],
    bodyweight: [],
    settings: SETTINGS,
    now: new Date(start),
  };
}
