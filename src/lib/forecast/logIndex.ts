// A log prepared for scoring many forecasts against it. Pure.
//
// Scoring runs over the whole history on every read and when a workout starts. Looking
// a workout up by scanning the list, or working out every workout's estimated-max
// results again for each forecast, makes that cost grow with the square of the
// history. The index does each of those once.
import { e1rmsForWorkout } from "@/lib/rebuild/e1rm";
import type { Estimated1RM, WorkoutSession } from "@/types";
import { weighIns } from "./horizon";
import { finishedBy, isLive, toMs } from "./log";
import type { ForecastLog, IndexedLog, Measurement } from "./types";

function isIndexed(log: ForecastLog): log is IndexedLog {
  return typeof (log as Partial<IndexedLog>).workoutById === "function";
}

/**
 * The log with its workouts found by id and its measurements worked out once:
 * - `workoutById`: any workout row, deleted or not (the first row wins a repeated id);
 * - `e1rmsOf`: a workout's estimated-max rows (`e1rmsForWorkout`), computed on first
 *   use and kept;
 * - `e1rmResultsOf`: a lift's estimated-max results from live workouts, oldest first;
 * - `weighIns`: live weigh-ins, oldest first.
 * Everything is built on first use, so indexing a log to resolve one forecast costs
 * no more than that forecast needs. Indexing an index returns it as it is.
 *
 * The index reads the log's arrays as they are when a part is first needed: do not
 * change them afterwards.
 */
export function indexLog(log: ForecastLog): IndexedLog {
  if (isIndexed(log)) return log;

  let byId: Map<string, WorkoutSession> | undefined;
  const e1rms = new Map<WorkoutSession, Estimated1RM[]>();
  let resultsByExercise: Map<string, Measurement[]> | undefined;
  let weights: Measurement[] | undefined;
  let t1Sessions: Map<string, WorkoutSession[]> | undefined;

  const e1rmsOf = (workout: WorkoutSession): Estimated1RM[] => {
    let rows = e1rms.get(workout);
    if (!rows) {
      rows = e1rmsForWorkout(workout);
      e1rms.set(workout, rows);
    }
    return rows;
  };

  return {
    workouts: log.workouts,
    bodyweight: log.bodyweight,
    workoutById(id) {
      if (!byId) {
        byId = new Map();
        for (const workout of log.workouts) {
          if (!byId.has(workout.id)) byId.set(workout.id, workout);
        }
      }
      return byId.get(id);
    },
    e1rmsOf,
    e1rmResultsOf(exerciseId) {
      if (!resultsByExercise) {
        resultsByExercise = new Map();
        for (const workout of log.workouts) {
          if (!isLive(workout)) continue;
          for (const row of e1rmsOf(workout)) {
            const point = { t: toMs(row.date), v: row.estimated1RM };
            // A result with no usable time is in no window.
            if (!Number.isFinite(point.t)) continue;
            const list = resultsByExercise.get(row.exerciseId);
            if (list) list.push(point);
            else resultsByExercise.set(row.exerciseId, [point]);
          }
        }
        for (const list of resultsByExercise.values()) list.sort((a, b) => a.t - b.t);
      }
      return resultsByExercise.get(exerciseId) ?? [];
    },
    weighIns() {
      weights ??= weighIns(log.bodyweight).map(({ t, v }) => ({ t, v }));
      return weights;
    },
    t1SessionsOf(exerciseId) {
      if (!t1Sessions) {
        t1Sessions = new Map();
        for (const workout of finishedBy(log.workouts, Infinity)) {
          const lifts = new Set<string>();
          for (const set of workout.sets ?? []) {
            if (set.tier === "T1") lifts.add(set.exerciseId);
          }
          for (const lift of lifts) {
            const list = t1Sessions.get(lift);
            if (list) list.push(workout);
            else t1Sessions.set(lift, [workout]);
          }
        }
      }
      return t1Sessions.get(exerciseId) ?? [];
    },
  };
}

/**
 * The workouts of a list sorted by finish time (`t1SessionsOf`) finished after
 * `afterMs` and by `untilMs`, both found by bisection.
 */
export function finishedBetween(
  sorted: readonly WorkoutSession[],
  afterMs: number,
  untilMs: number
): WorkoutSession[] {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (toMs(sorted[mid].completedAt) <= afterMs) low = mid + 1;
    else high = mid;
  }
  const out: WorkoutSession[] = [];
  for (let i = low; i < sorted.length && toMs(sorted[i].completedAt) <= untilMs; i++) {
    out.push(sorted[i]);
  }
  return out;
}

/**
 * The values of the measurements (sorted by time, oldest first) whose time is within
 * `halfWidthMs` of `centreMs`, both ends included. Found by bisection, so the cost
 * does not depend on how long the series is.
 */
export function valuesAround(
  sorted: readonly Measurement[],
  centreMs: number,
  halfWidthMs: number
): number[] {
  const from = centreMs - halfWidthMs;
  const to = centreMs + halfWidthMs;
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid].t < from) low = mid + 1;
    else high = mid;
  }
  const values: number[] = [];
  for (let i = low; i < sorted.length && sorted[i].t <= to; i++) values.push(sorted[i].v);
  return values;
}
