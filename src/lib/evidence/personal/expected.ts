// What each T1 last set was expected to be, so a comparison of sessions is not fooled
// by the lift getting heavier (or the lifter stronger) over time. Pure.
import {
  earliestPerSlot,
  estimateRepsLevel,
  lastT1Sets,
  repsPmf,
  typicalReps,
} from "@/lib/forecast";
import { finishedBy, lastSetOf, toMs } from "@/lib/forecast/log";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type { Forecast, SetLog, WorkoutSession } from "@/types";
import type { PersonalLog } from "./types";

/** One T1 last set measured against what was expected for it. */
export interface LastSetResidual {
  workoutId: string;
  exerciseId: string;
  /** When the workout started, epoch milliseconds. */
  startedAt: number;
  weight: number;
  /** Reps logged on the last set. */
  actual: number;
  /** Reps expected on it (the middle of the reps forecast). */
  expected: number;
  /** actual − expected. */
  residual: number;
  /** "forecast": the stored forecast of that workout; "model": worked out now from earlier sessions. */
  source: "forecast" | "model";
}

function numberOr(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The middle of a stored reps forecast with any readiness shift taken back out. The
 * readiness score reads the sleep answer and recent runs, so a forecast made after a
 * short night already expects fewer reps; left in, it would hide the very difference
 * being measured. A row without the base level it was shifted from keeps its point.
 */
function neutralPoint(forecast: Forecast): number {
  const inputs = forecast.inputs ?? {};
  const shift = numberOr(inputs.readinessShift) ?? 0;
  if (shift === 0) return forecast.prediction.point;
  const base = numberOr(inputs.baseLevel);
  const scatter = numberOr(inputs.scatter);
  const cutting = numberOr(inputs.cuttingShift) ?? 0;
  const weight = numberOr(forecast.event.weight);
  if (!base || !scatter || !weight || base <= 0 || scatter <= 0 || weight <= 0) {
    return forecast.prediction.point;
  }
  return typicalReps(repsPmf(weight, { level: base * (1 + cutting), scatter }));
}

/** The weight the program planned for the lift that day, in the terms of the exercise performed. */
function plannedWeightOf(workout: WorkoutSession, last: SetLog, exerciseId: string): number {
  if (last.isSubstituted || last.substituteExerciseId) return last.weight;
  const prescribed = workout.prescribed?.find((p) => p.exerciseId === exerciseId && p.tier === "T1");
  return prescribed && prescribed.weight > 0 ? prescribed.weight : last.weight;
}

/**
 * Every T1 last set ("as many as you can") of finished, live workouts up to `now`, with
 * the reps expected for it:
 *
 * - the stored reps forecast of that workout when there is one for the weight lifted
 *   (the earliest per slot), with any readiness shift taken back out (`neutralPoint`);
 * - otherwise the same reps model run now on the lift's sessions before that workout
 *   (`estimateRepsLevel`, its trend when there are enough), read at its middle.
 *
 * Left out: sessions the model would skip (`lastT1Sets`: the last set not reached,
 * or a set skipped or lightened for a reason, or a load drop), and any session with no
 * earlier history of the exercise performed, whose expectation would only be a guess.
 * `include` limits the lifts read.
 */
export function lastSetResiduals(
  log: Pick<PersonalLog, "workouts" | "forecasts">,
  now: Date,
  include?: (exerciseId: string) => boolean
): LastSetResidual[] {
  const finished = finishedBy(log.workouts, now.getTime());
  const byId = new Map(finished.map((w) => [w.id, w]));

  const stored = new Map<string, Forecast>();
  for (const forecast of earliestPerSlot(log.forecasts)) {
    if (forecast.kind !== "amrapReps" || !forecast.workoutId || !forecast.exerciseId) continue;
    if ((forecast.tier ?? "T1") !== "T1") continue;
    stored.set(`${forecast.workoutId}|${forecast.exerciseId}`, forecast);
  }

  const exerciseIds = new Set<string>();
  for (const workout of finished) {
    for (const set of workout.sets ?? []) if (set.tier === "T1") exerciseIds.add(set.exerciseId);
  }

  const out: LastSetResidual[] = [];
  for (const exerciseId of [...exerciseIds].sort()) {
    if (include && !include(exerciseId)) continue;
    const points = lastT1Sets(log.workouts, exerciseId, now);
    for (const point of points) {
      const workout = byId.get(point.workoutId);
      const last = workout ? lastSetOf(workingSetsFor(workout.sets ?? [], exerciseId, "T1")) : null;
      if (!workout || !last) continue;
      const startedAt = toMs(workout.startedAt);

      let expected: number | null = null;
      let source: LastSetResidual["source"] = "model";
      const forecast = stored.get(`${workout.id}|${exerciseId}`);
      if (forecast && forecast.event.weight === point.weight && forecast.basis !== "prior") {
        expected = neutralPoint(forecast);
        source = "forecast";
      } else {
        const level = estimateRepsLevel({
          history: points.filter((p) => p.workoutId !== point.workoutId && p.t < startedAt),
          performedExerciseId: point.performedExerciseId,
          weight: point.weight,
          plannedWeight: plannedWeightOf(workout, last, exerciseId),
          targetReps: last.targetReps,
          phase: point.phase,
          now: new Date(startedAt),
        });
        if (level.basis !== "prior") expected = typicalReps(repsPmf(point.weight, level));
      }
      if (expected === null || !Number.isFinite(expected)) continue;

      out.push({
        workoutId: workout.id,
        exerciseId,
        startedAt,
        weight: point.weight,
        actual: point.reps,
        expected,
        residual: point.reps - expected,
        source,
      });
    }
  }
  return out.sort((a, b) => a.startedAt - b.startedAt || (a.exerciseId < b.exerciseId ? -1 : 1));
}
