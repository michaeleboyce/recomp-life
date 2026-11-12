// Fixtures for data-layer and hook tests. Import "fake-indexeddb/auto" before this.
import { db } from "@/db/local";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import type {
  Estimated1RM,
  LiftState,
  SetLog,
  UserProfile,
  WorkoutSession,
} from "@/types";

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
