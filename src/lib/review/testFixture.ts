// Shared hand-built fixture for the weekly review tests (not a test file itself).
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { WEEKLY_SESSION_TARGET } from "@/components/Today/GlanceTiles";
import type {
  ActivityLog,
  BodyweightLog,
  Estimated1RM,
  ReadinessLog,
  RunLog,
  SetLog,
  Tier,
  UserSettings,
  WorkoutSession,
} from "@/types";
import type { ReviewSource } from "./types";

// Review week: Monday 2 Nov 2026 to Sunday 8 Nov 2026 (local time).
export const WEEK = new Date(2026, 10, 2);
export const AFTER = new Date(2026, 10, 13, 12); // the following Friday
export const LATER = new Date(2026, 11, 20, 12); // weeks later: insights no longer describe it
export const OPTS = { sessionTarget: WEEKLY_SESSION_TARGET };

let n = 0;
function sets(exerciseId: string, tier: Tier, weight: number, reps: number[], rpes: number[] = []): SetLog[] {
  return reps.map((actualReps, i) => ({
    id: `s${++n}`,
    clientId: `cs${n}`,
    exerciseId,
    tier,
    setNumber: i + 1,
    targetReps: actualReps,
    actualReps,
    weight,
    isAMRAP: i === reps.length - 1,
    completedAt: new Date(2026, 10, 2),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    rpe: rpes[i],
    location: "gym",
    synced: false,
  }));
}

function workout(id: string, startedAt: Date, s: SetLog[]): WorkoutSession {
  return {
    id,
    clientId: `c${id}`,
    templateId: "A1",
    location: "gym",
    startedAt,
    completedAt: startedAt,
    totalDurationSeconds: 3600,
    includeWarmUps: true,
    selectedAccessories: [],
    sets: s,
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };
}

const e1rm = (id: string, exerciseId: string, date: Date, value: number, workoutId: string): Estimated1RM => ({
  id,
  clientId: `c${id}`,
  date,
  exerciseId,
  workingWeight: value - 20,
  repsCompleted: 3,
  estimated1RM: value,
  workoutSessionId: workoutId,
  synced: false,
});

function settings(mode: "cutting" | "maintaining"): UserSettings {
  return { ...DEFAULT_USER_PROFILE.settings, trainingPhase: { mode } };
}

// Weigh-ins every morning from 12 Oct (i = 0) to 8 Nov (i = 27), down 0.2 lb a day.
export const weighIns: BodyweightLog[] = Array.from({ length: 28 }, (_, i) => ({
  id: `bw${i}`,
  clientId: `cbw${i}`,
  date: new Date(2026, 9, 12 + i, 7),
  weight: 200 - 0.2 * i,
  timeOfDay: "morning",
  synced: false,
})) as BodyweightLog[];

export const W1 = sets("squat", "T1", 200, [3, 3, 5]).concat(sets("bench", "T2", 100, [10, 10, 10]));
export const W2 = sets("bench", "T1", 150, [3, 3], [8, 9]).concat(sets("deadlift", "T2", 180, [10]));
export const W3 = sets("ohp", "T1", 100, [3], [7]);
export const W0 = sets("squat", "T1", 195, [3], [8]);
export const W4 = sets("squat", "T1", 210, [3]);
export const warm = sets("squat", "warmup", 45, [5]);

export function fixture(mode: "cutting" | "maintaining" = "cutting"): ReviewSource {
  return {
    workouts: [
      workout("w0", new Date(2026, 9, 29, 18), W0),
      workout("w1", new Date(2026, 10, 2, 18), [...warm, ...W1]),
      workout("w2", new Date(2026, 10, 4, 18), W2),
      workout("w3", new Date(2026, 10, 8, 23, 59), W3), // Sunday 23:59: in the week
      workout("w4", new Date(2026, 10, 9, 0, 0), W4), // Monday 00:00: the next week
    ],
    e1rms: [
      e1rm("e1", "squat", new Date(2026, 9, 1), 210, "old"), // more than four weeks before
      e1rm("e2", "squat", new Date(2026, 9, 29), 215, "w0"),
      e1rm("e3", "squat", new Date(2026, 10, 2), 225, "w1"),
      e1rm("e4", "bench", new Date(2026, 9, 28), 180, "wx"),
      e1rm("e5", "bench", new Date(2026, 10, 4), 175, "w2"),
      e1rm("e6", "ohp", new Date(2026, 10, 8, 23, 59), 120, "w3"), // first ever
      e1rm("e7", "squat", new Date(2026, 10, 9, 0, 0), 240, "w4"),
    ],
    bodyweight: weighIns,
    runs: [
      { id: "r1", clientId: "cr1", date: new Date(2026, 10, 5), durationMinutes: 30, distanceMiles: 3, type: "outdoor", category: "easy", notes: "", perceivedEffort: 2, synced: false },
      { id: "r0", clientId: "cr0", date: new Date(2026, 9, 27), durationMinutes: 20, distanceMiles: 2, type: "outdoor", category: "easy", notes: "", perceivedEffort: 2, synced: false },
    ] as RunLog[],
    activities: [
      { id: "a1", clientId: "ca1", date: new Date(2026, 10, 7), kind: "yoga", durationMinutes: 60, style: "flow", distanceMiles: null, notes: "", perceivedEffort: 2, synced: false },
    ] as ActivityLog[],
    readiness: [
      { id: "q1", clientId: "cq1", sessionId: "w1", sleepHours: "<5", stressLevel: "normal", date: new Date(2026, 10, 2), synced: false },
      { id: "q2", clientId: "cq2", sessionId: "w2", sleepHours: "7+", stressLevel: "low", date: new Date(2026, 10, 4), synced: false },
      { id: "q0", clientId: "cq0", sessionId: "w0", sleepHours: "<5", stressLevel: "low", date: new Date(2026, 9, 29), synced: false },
    ] as ReadinessLog[],
    pain: [],
    liftStates: [],
    settings: settings(mode),
  };
}

// lossRate is the sign-flipped rateOfLoss over the 14 days to the week's last weigh-in.
