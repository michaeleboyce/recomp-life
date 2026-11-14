// Fixtures for data-layer and hook tests. Import "fake-indexeddb/auto" before this.
import { db } from "@/db/local";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { createSetLog } from "@/lib/workout/logSet";
import type { WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  Estimated1RM,
  LiftState,
  SetLog,
  Tier,
  UserProfile,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";
import { readSettings } from "./derived";
import { appendSet, finishWorkout, startWorkout } from "./workouts";

export async function clearDb(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function makeSet(overrides: Partial<SetLog> = {}): SetLog {
  const id = overrides.id ?? nextId("set");
  return {
    id,
    clientId: `c-${id}`,
    exerciseId: "squat",
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 190,
    isAMRAP: false,
    completedAt: new Date("2026-11-10T10:00:00Z"),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...overrides,
  };
}

export function makeWorkout(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const id = overrides.id ?? nextId("workout");
  return {
    id,
    clientId: `c-${id}`,
    templateId: "A1",
    location: "gym",
    startedAt: new Date("2026-11-10T09:00:00Z"),
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: true,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
    ...overrides,
  };
}

export function makeE1RM(overrides: Partial<Estimated1RM> = {}): Estimated1RM {
  const id = overrides.id ?? nextId("e1rm");
  return {
    id,
    clientId: `c-${id}`,
    date: new Date("2026-11-10T10:00:00Z"),
    exerciseId: "squat",
    workingWeight: 190,
    repsCompleted: 5,
    estimated1RM: 220,
    workoutSessionId: "none",
    synced: false,
    ...overrides,
  };
}

export function makeLiftState(overrides: Partial<LiftState> = {}): LiftState {
  return { ...INITIAL_LIFT_STATES.squat, synced: true, ...overrides };
}

export function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    ...DEFAULT_USER_PROFILE,
    settings: { ...DEFAULT_USER_PROFILE.settings },
    id: "profile-1",
    clientId: "c-profile-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    synced: true,
    ...overrides,
  };
}

const MINUTE_MS = 60_000;

export interface ScriptedSession {
  templateId: string;
  location?: WorkoutLocation;
  /** When the session starts; one set is logged per minute after that. */
  startedAt: Date;
  /** Reps of the last set of a tier; every other set hits its target. */
  lastReps?: Partial<Record<Tier, number>>;
  /** How many sets of a tier are logged; default all of them. */
  setsLogged?: Partial<Record<Tier, number>>;
  rpe?: number;
  /** Leave the workout unfinished. */
  skipFinish?: boolean;
}

export interface ScriptedResult {
  workoutId: string;
  /** The plan the sets were logged against (no warm-ups, no accessories). */
  plan: WorkoutPlan;
  completedAt: Date;
}

/**
 * Drives one session through the data layer the way the active-workout screen does:
 * startWorkout, one appendSet per set, finishWorkout. `setNow` moves the clock (pass
 * `vi.setSystemTime` with only `Date` faked) so the rows carry the scripted times.
 */
export async function runSession(
  script: ScriptedSession,
  setNow: (date: Date) => void
): Promise<ScriptedResult> {
  const location = script.location ?? "gym";
  setNow(script.startedAt);
  const workoutId = await startWorkout({
    templateId: script.templateId,
    location,
    includeWarmUps: false,
    selectedAccessories: [],
  });

  const plan = buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[script.templateId],
    liftStates: await db.liftStates.toArray(),
    location,
    equipment: (await readSettings()).equipment,
    includeWarmUps: false,
    selectedAccessories: [],
  });

  let time = script.startedAt.getTime();
  let count = 0;
  for (const entry of plan) {
    const logged = script.setsLogged?.[entry.tier] ?? entry.targetSets;
    for (let i = 0; i < logged; i += 1) {
      time += MINUTE_MS;
      count += 1;
      setNow(new Date(time));
      const isLast = i === entry.targetSets - 1;
      await appendSet(
        workoutId,
        createSetLog({
          exercise: { ...entry, completedSets: i },
          actualReps: (isLast ? script.lastReps?.[entry.tier] : undefined) ?? entry.targetReps,
          rpe: script.rpe ?? null,
          location,
          autoRegulated: false,
          now: new Date(time),
          id: `${workoutId}:set-${count}`,
          clientId: `${workoutId}:set-${count}`,
        })
      );
    }
  }

  const completedAt = new Date(time + MINUTE_MS);
  setNow(completedAt);
  if (!script.skipFinish) {
    await finishWorkout(workoutId, {
      completedAt,
      totalDurationSeconds: Math.floor((completedAt.getTime() - script.startedAt.getTime()) / 1000),
      endedEarly: false,
    });
  }
  return { workoutId, plan, completedAt };
}
