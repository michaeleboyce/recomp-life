// Shared fixtures for the src/lib/workout tests. Not exported from index.ts.
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import type {
  EquipmentProfile,
  LiftState,
  SetLog,
  Tier,
  UserSettings,
  WorkoutSession,
} from "@/types";
import type { WorkoutExerciseState } from "./types";

export const SETTINGS: UserSettings = DEFAULT_USER_PROFILE.settings;
export const EQUIPMENT: EquipmentProfile = SETTINGS.equipment;

/** Fresh copies of the seeded lift states (arrays included), safe to mutate. */
export function seedLiftStates(): LiftState[] {
  return Object.values(INITIAL_LIFT_STATES).map((ls) => ({
    ...ls,
    recentE1RMs: [...ls.recentE1RMs],
    recentAvgRPEs: [...ls.recentAvgRPEs],
    recentAMRAPReps: [...ls.recentAMRAPReps],
  }));
}

let counter = 0;

export function makeSet(
  exerciseId: string,
  tier: Tier,
  overrides: Partial<SetLog> = {}
): SetLog {
  counter += 1;
  return {
    id: `set-${counter}`,
    clientId: `client-${counter}`,
    exerciseId,
    tier,
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 100,
    isAMRAP: false,
    completedAt: new Date("2026-11-11T10:00:00Z"),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...overrides,
  };
}

/** `count` sets of one exercise, numbered from 1, each hitting `reps`. */
export function makeSets(
  exerciseId: string,
  tier: Tier,
  count: number,
  reps: number,
  overrides: Partial<SetLog> = {}
): SetLog[] {
  return Array.from({ length: count }, (_, i) =>
    makeSet(exerciseId, tier, {
      setNumber: i + 1,
      targetReps: reps,
      actualReps: reps,
      ...overrides,
    })
  );
}

export function makeEntry(
  overrides: Partial<WorkoutExerciseState> = {}
): WorkoutExerciseState {
  return {
    exerciseId: "squat",
    tier: "T1",
    targetSets: 5,
    targetReps: 3,
    weight: 190,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 0,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "session-1",
    clientId: "session-client-1",
    templateId: "A1",
    location: "gym",
    startedAt: new Date("2026-11-11T09:00:00Z"),
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
    ...overrides,
  };
}
