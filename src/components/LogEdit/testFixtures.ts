// Plain fixtures for the LogEdit tests (no database).
import type { ChangePreview, RebuildInput } from "@/lib/rebuild";
import type { SetLog, UserSettings, WorkoutSession } from "@/types";

export function set(overrides: Partial<SetLog> = {}): SetLog {
  const id = overrides.id ?? "s1";
  return {
    id,
    clientId: id,
    exerciseId: "squat",
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 205,
    isAMRAP: false,
    completedAt: new Date("2026-11-10T10:00:00"),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: true,
    ...overrides,
  };
}

export function workout(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const id = overrides.id ?? "w1";
  return {
    id,
    clientId: id,
    templateId: "A1",
    location: "gym",
    startedAt: new Date("2026-11-10T09:00:00"),
    completedAt: new Date("2026-11-10T10:00:00"),
    totalDurationSeconds: 3120,
    includeWarmUps: true,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: true,
    ...overrides,
  };
}

export function input(workouts: WorkoutSession[] = []): RebuildInput {
  return { workouts, adjustments: [], settings: {} as UserSettings };
}

export const UNAFFECTED: ChangePreview = {
  nextWorkout: [],
  prChanges: [],
  e1rmChanges: 0,
  unaffected: true,
};

export const NEXT_CHANGES: ChangePreview = {
  nextWorkout: [
    {
      exerciseId: "squat",
      tier: "T1",
      before: { weight: 205, stage: "5x3", sets: 5, reps: 3 },
      after: { weight: 200, stage: "6x2", sets: 6, reps: 2 },
    },
  ],
  prChanges: [{ exerciseId: "bench", before: 215, after: 210 }],
  e1rmChanges: 3,
  unaffected: false,
};
