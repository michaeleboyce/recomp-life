// Fixtures for the readiness tests. Not imported by the app.
import type {
  ActivityLog,
  PainSorenessEntry,
  ReadinessLog,
  RunLog,
  SetLog,
  WorkoutSession,
} from "@/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";

/** Friday 13 November 2026, 09:00 local time. */
export const NOW = new Date(2026, 10, 13, 9, 0, 0);

export const hoursBefore = (hours: number, from: Date = NOW) =>
  new Date(from.getTime() - hours * 3_600_000);

/** Local 09:00, `days` calendar days before `from`. */
export const daysBefore = (days: number, from: Date = NOW) =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() - days, 9, 0, 0);

export const templateExerciseIds = (templateId: string) =>
  WORKOUT_TEMPLATES[templateId].exercises.map((e) => e.exerciseId);

function makeSet(workoutId: string, exerciseId: string, index: number, at: Date): SetLog {
  return {
    id: `${workoutId}-set-${index}`,
    clientId: `${workoutId}-set-${index}`,
    exerciseId,
    tier: index === 0 ? "T1" : index === 1 ? "T2" : "T3",
    setNumber: 1,
    targetReps: 5,
    actualReps: 5,
    weight: 100,
    isAMRAP: false,
    completedAt: at,
    restAfterSeconds: 120,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
  };
}

/** A finished workout of one template, an hour long. */
export function makeWorkout(
  id: string,
  startedAt: Date,
  templateId = "A1",
  overrides: Partial<WorkoutSession> = {}
): WorkoutSession {
  return {
    id,
    clientId: id,
    templateId,
    location: "gym",
    startedAt,
    completedAt: new Date(startedAt.getTime() + 3_600_000),
    totalDurationSeconds: 3600,
    includeWarmUps: true,
    selectedAccessories: [],
    sets: templateExerciseIds(templateId).map((exerciseId, i) =>
      makeSet(id, exerciseId, i, startedAt)
    ),
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
    ...overrides,
  };
}

export function makeLog(
  sessionId: string,
  date: Date,
  overrides: Partial<ReadinessLog> = {}
): ReadinessLog {
  return {
    id: `log-${sessionId}`,
    clientId: `log-${sessionId}`,
    sessionId,
    sleepHours: "7+",
    stressLevel: "normal",
    date,
    synced: false,
    ...overrides,
  };
}

export function makeRun(overrides: Partial<RunLog> = {}): RunLog {
  return {
    id: "run-1",
    clientId: "run-1",
    date: hoursBefore(18),
    durationMinutes: 30,
    distanceMiles: 3,
    type: "outdoor",
    category: "tempo",
    notes: "",
    perceivedEffort: 3,
    synced: false,
    ...overrides,
  };
}

export function makeActivity(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: "activity-1",
    clientId: "activity-1",
    date: hoursBefore(14),
    kind: "yoga",
    durationMinutes: 45,
    style: "power",
    distanceMiles: null,
    notes: "",
    perceivedEffort: 4,
    synced: false,
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<PainSorenessEntry> = {}): PainSorenessEntry {
  return {
    id: "entry-1",
    clientId: "entry-1",
    date: hoursBefore(20),
    region: "left_quad",
    sensation: "soreness",
    severity: 2,
    synced: false,
    ...overrides,
  };
}
