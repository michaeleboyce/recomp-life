// Test-only builders for "Your own numbers". Not exported from index.ts.
import { sessionForecastId } from "@/lib/forecast/make";
import { makeSession, makeSet } from "@/lib/workout/testFixtures";
import type {
  ActivityLog,
  Forecast,
  ReadinessLog,
  RunLog,
  SleepHours,
  WorkoutSession,
} from "@/types";
import type { PersonalLog } from "./types";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export function emptyLog(): PersonalLog {
  return { workouts: [], forecasts: [], readinessLogs: [], runs: [], activities: [] };
}

export interface T1Spec {
  id: string;
  exerciseId?: string;
  at: Date;
  weight: number;
  /** Reps on the last set ("as many as you can"). */
  lastReps: number;
  /** The reps a stored forecast expected on the last set; no forecast when left out. */
  expected?: number;
}

/**
 * A finished workout with one T1 lift at 5x3: four sets of 3 three and a half minutes
 * apart, then the last set. A stored reps forecast is returned with it when `expected`
 * is given.
 */
export function t1Workout(spec: T1Spec): { workout: WorkoutSession; forecast: Forecast | null } {
  const exerciseId = spec.exerciseId ?? "squat";
  const start = spec.at.getTime();
  const sets = Array.from({ length: 5 }, (_, i) => {
    const last = i === 4;
    const reps = last ? spec.lastReps : 3;
    return makeSet(exerciseId, "T1", {
      id: `${spec.id}-s${i + 1}`,
      clientId: `${spec.id}-s${i + 1}`,
      setNumber: i + 1,
      targetReps: 3,
      actualReps: reps,
      weight: spec.weight,
      isAMRAP: last,
      completedAt: new Date(start + (i + 1) * 210_000),
      status: reps >= 3 ? "completed" : "failed",
    });
  });
  const workout = makeSession({
    id: spec.id,
    clientId: spec.id,
    startedAt: spec.at,
    completedAt: new Date(start + 40 * 60_000),
    totalDurationSeconds: 40 * 60,
    sets,
    prescribed: [{ exerciseId, tier: "T1", weight: spec.weight, sets: 5, reps: 3, stage: "5x3" }],
    completionContext: { phaseMode: "maintaining", gymBarbellIncrementLbs: 5, dumbbellIncrementLbs: 5 },
  });
  if (spec.expected === undefined) return { workout, forecast: null };
  const id = sessionForecastId(spec.id, "amrapReps", exerciseId, "T1");
  const forecast: Forecast = {
    id,
    clientId: id,
    slot: id,
    kind: "amrapReps",
    workoutId: spec.id,
    exerciseId,
    tier: "T1",
    madeAt: spec.at,
    dueAt: new Date(start + 40 * 60_000),
    event: { type: "amrapReps", weight: spec.weight },
    prediction: { point: spec.expected, unit: "reps" },
    basis: "trend",
    inputs: { readinessShift: 0 },
    modelVersion: "test",
    synced: false,
  };
  return { workout, forecast };
}

export function run(id: string, date: Date, effort: RunLog["perceivedEffort"]): RunLog {
  return {
    id,
    clientId: id,
    date,
    durationMinutes: 30,
    distanceMiles: 3,
    type: "outdoor",
    category: "tempo",
    notes: "",
    perceivedEffort: effort,
    synced: false,
  };
}

export function activity(
  id: string,
  date: Date,
  effort: ActivityLog["perceivedEffort"],
  kind: ActivityLog["kind"] = "cycling"
): ActivityLog {
  return {
    id,
    clientId: id,
    date,
    kind,
    durationMinutes: 45,
    style: null,
    distanceMiles: null,
    notes: "",
    perceivedEffort: effort,
    synced: false,
  };
}

export function checkIn(id: string, sessionId: string, date: Date, sleepHours: SleepHours): ReadinessLog {
  return {
    id,
    clientId: id,
    sessionId,
    sleepHours,
    stressLevel: "normal",
    date,
    synced: false,
  };
}

/**
 * A constructed history that passes every minimum: 24 squat and 24 bench sessions a
 * day apart, each with a stored forecast. Sessions after a hard run or after short
 * sleep fall two reps under their forecast, the rest land on it, and every second
 * squat session rested short before its third set and lost a rep on it.
 */
export function constructedHistory(now: Date): PersonalLog {
  const log = emptyLog();
  const first = now.getTime() - 50 * DAY;
  for (let i = 0; i < 24; i++) {
    for (const [k, exerciseId] of (["squat", "bench"] as const).entries()) {
      const at = new Date(first + (2 * i + k) * DAY);
      const id = `${exerciseId}-${i}`;
      const hardRun = exerciseId === "squat" && i % 3 === 0;
      const shortSleep = i % 4 === 1;
      const expected = 6;
      const lastReps = expected - (hardRun ? 2 : 0) - (shortSleep ? 2 : 0);
      const { workout, forecast } = t1Workout({
        id,
        exerciseId,
        at,
        weight: exerciseId === "squat" ? 225 + i * 5 : 155 + i * 2.5,
        lastReps,
        expected,
      });
      if (exerciseId === "squat" && i % 2 === 0) {
        // A short rest before the third set (90 seconds), which came up a rep short.
        const [, second, third] = workout.sets;
        third.completedAt = new Date(new Date(second.completedAt).getTime() + 120_000);
        third.actualReps = 2;
        third.status = "failed";
      }
      log.workouts.push(workout);
      if (forecast) log.forecasts.push(forecast);
      if (hardRun) log.runs.push(run(`run-${i}`, new Date(at.getTime() - 10 * HOUR), 4));
      log.readinessLogs.push(checkIn(`ready-${id}`, id, at, shortSleep ? "5-7" : "7+"));
    }
  }
  return log;
}
