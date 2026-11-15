// What became of a stored forecast, worked out from the log on every read. Pure.
//
// A forecast row holds the prediction and the event it is about; nothing here is ever
// written back. Editing, deleting or restoring a workout therefore changes the status
// the next time it is read, and no device can overwrite another's outcome.
//
// Each resolver reads the log through its index (`indexLog`): a workout is found by id
// and estimated-max results are worked out once per log, so scoring every stored
// forecast costs about as much as reading the history once.
import { isNewPR } from "@/lib/e1rm";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type { Forecast, ForecastKind, ForecastStatus, SetLog, WorkoutSession } from "@/types";
import { BODYWEIGHT_MODEL, E1RM_HORIZON_MODEL } from "./coefficients";
import { DAY_MS, hasFreeze, hasLoadDrop, isLive, lastSetOf, toMs } from "./log";
import { indexLog, valuesAround } from "./logIndex";
import { mean } from "./math";
import type { ForecastLog, ForecastResolver, IndexedLog, Measurement } from "./types";

/** Why a forecast is not scored. The key is what `ForecastStatus.reason` holds. */
export const VOID_REASONS = {
  "workout-missing": "The workout is not in the log.",
  "workout-deleted": "The workout was deleted or discarded.",
  "not-reached": "The last set of the lift was not reached.",
  freeze: "A set of the lift was skipped or lightened for pain, a run or equipment.",
  "load-drop": "The weight was dropped during the lift.",
  "weight-changed": "The weight lifted was not the weight the forecast was made for.",
  "ended-early": "The workout was ended before the plan was finished.",
  "no-duration": "The workout has no recorded length.",
  "too-few-measurements": "Too few measurements were logged around the date.",
  "not-scorable": "The forecast does not say what to measure.",
} as const;

export type VoidReason = keyof typeof VOID_REASONS;

/** Weights within this many lbs count as the same weight (stored numbers, not arithmetic). */
const WEIGHT_TOLERANCE_LBS = 0.01;

const open: ForecastStatus = { state: "open" };
const voided = (reason: VoidReason): ForecastStatus => ({ state: "void", reason });

function isStatus(value: unknown): value is ForecastStatus {
  return typeof value === "object" && value !== null && "state" in value;
}

/** The finished workout a session forecast belongs to, or the status that stands in for it. */
function finishedWorkout(forecast: Forecast, log: IndexedLog): WorkoutSession | ForecastStatus {
  const workout = forecast.workoutId ? log.workoutById(forecast.workoutId) : undefined;
  if (!workout) return voided("workout-missing");
  if (!isLive(workout)) return voided("workout-deleted");
  if (workout.completedAt == null) return open;
  return workout;
}

/**
 * The last set of the forecast's lift in its finished workout, with the lift's other
 * sets of that tier, or the status that stands in: void when the last set was not
 * reached, when a set of the lift carries a freeze status or a load drop, or when
 * any of its sets was lifted at a weight other than the forecast's.
 */
function lastSetResult(
  forecast: Forecast,
  log: IndexedLog
): { workout: WorkoutSession; last: SetLog; sets: SetLog[] } | ForecastStatus {
  const workout = finishedWorkout(forecast, log);
  if (isStatus(workout)) return workout;
  if (!forecast.exerciseId) return voided("not-scorable");

  const sets = workingSetsFor(workout.sets ?? [], forecast.exerciseId, forecast.tier ?? "T1");
  if (hasFreeze(sets)) return voided("freeze");
  if (hasLoadDrop(sets)) return voided("load-drop");
  const last = lastSetOf(sets);
  if (!last) return voided("not-reached");
  const weight = forecast.event.weight;
  if (
    typeof weight === "number" &&
    sets.some((set) => Math.abs(set.weight - weight) > WEIGHT_TOLERANCE_LBS)
  ) {
    return voided("weight-changed");
  }
  return { workout, last, sets };
}

/** Whether `value` is inside the stored range; undefined when the row has no range. */
function insideRange(forecast: Forecast, value: number, openTop = false): boolean | undefined {
  const { low, high } = forecast.prediction;
  if (typeof low !== "number" || typeof high !== "number") return undefined;
  return value >= low && (value <= high || openTop);
}

/** Reps logged on the last set. A range ending at the pmf's last bucket has no upper end. */
const resolveAmrapReps: ForecastResolver = (forecast, log) => {
  const result = lastSetResult(forecast, indexLog(log));
  if (isStatus(result)) return result;
  const value = result.last.actualReps;
  const { pmf, high } = forecast.prediction;
  const openTop = pmf !== undefined && high === pmf.length - 1;
  return { state: "resolved", value, inside: insideRange(forecast, value, openTop) };
};

/**
 * Whether the workout set a new best estimated max for the lift, as the app itself
 * shows one: the best of the rows the app keeps for the workout (`e1rmsForWorkout`:
 * a last set of 2 to 10 reps of the lift itself, with the credit for a logged effort)
 * is a new best (`isNewPR`) against `event.level`, the best that stood when the
 * forecast was made. The value is the workout's estimated max, or 0 when its last set
 * gave none (too long or too short), which is a miss: the app shows no new best.
 */
const resolveNewBest: ForecastResolver = (forecast, log) => {
  const index = indexLog(log);
  const result = lastSetResult(forecast, index);
  if (isStatus(result)) return result;
  const level = forecast.event.level;
  if (typeof level !== "number") return voided("not-scorable");
  const estimates = index
    .e1rmsOf(result.workout)
    .filter((row) => row.exerciseId === forecast.exerciseId)
    .map((row) => row.estimated1RM);
  if (estimates.length === 0) return { state: "resolved", value: 0, hit: false };
  const value = Math.max(...estimates);
  return { state: "resolved", value, hit: isNewPR(value, [level]) };
};

/**
 * Whether the lift passed by the program's rule: every set of the lift reached the
 * target reps and none is marked failed. The value is the reps on the last set.
 */
const resolveLiftPass: ForecastResolver = (forecast, log) => {
  const result = lastSetResult(forecast, indexLog(log));
  if (isStatus(result)) return result;
  const target = forecast.event.reps;
  if (typeof target !== "number") return voided("not-scorable");
  const hit = result.sets.every((set) => set.status !== "failed" && set.actualReps >= target);
  return { state: "resolved", value: result.last.actualReps, hit };
};

/** The finished workout's recorded length. Void when it was ended before the plan was done. */
const resolveSessionLength: ForecastResolver = (forecast, log) => {
  const workout = finishedWorkout(forecast, indexLog(log));
  if (isStatus(workout)) return workout;
  if (workout.endedEarly) return voided("ended-early");
  const value = workout.totalDurationSeconds;
  if (!(value > 0)) return voided("no-duration");
  return { state: "resolved", value, inside: insideRange(forecast, value) };
};

/**
 * A forecast for a date: open until the measurement window around `dueAt` has closed,
 * then the mean of the measurements in it, or void when there are fewer than `min`.
 * `measurements` are oldest first and are only read once the window has closed.
 */
function resolveWindow(
  forecast: Forecast,
  now: Date,
  defaultWindowDays: number,
  defaultMin: number,
  measurements: () => readonly Measurement[]
): ForecastStatus {
  const dueAt = toMs(forecast.dueAt);
  const windowMs = (forecast.event.windowDays ?? defaultWindowDays) * DAY_MS;
  if (!Number.isFinite(dueAt)) return voided("not-scorable");
  if (now.getTime() < dueAt + windowMs) return open;
  const values = valuesAround(measurements(), dueAt, windowMs);
  // The minimum stored on the row, so a later change to the constant cannot void past rows.
  const min = forecast.event.minResults ?? defaultMin;
  if (values.length < min) return voided("too-few-measurements");
  const value = mean(values);
  return { state: "resolved", value, inside: insideRange(forecast, value) };
}

/** Mean of the lift's estimated-max results logged within the window around the due date. */
const resolveE1RM: ForecastResolver = (forecast, log, now) =>
  resolveWindow(
    forecast,
    now,
    E1RM_HORIZON_MODEL.outcomeWindowDays,
    E1RM_HORIZON_MODEL.minOutcomeResults,
    () => (forecast.exerciseId ? indexLog(log).e1rmResultsOf(forecast.exerciseId) : [])
  );

/** Mean of the weigh-ins logged within the window around the due date. */
const resolveBodyweight: ForecastResolver = (forecast, log, now) =>
  resolveWindow(
    forecast,
    now,
    BODYWEIGHT_MODEL.outcomeWindowDays,
    BODYWEIGHT_MODEL.minOutcomeEntries,
    () => indexLog(log).weighIns()
  );

/** The resolver of each kind. The registry reads these; nothing else should. */
export const RESOLVERS: Record<ForecastKind, ForecastResolver> = {
  amrapReps: resolveAmrapReps,
  newBest: resolveNewBest,
  liftPass: resolveLiftPass,
  sessionLength: resolveSessionLength,
  e1rm4w: resolveE1RM,
  bodyweight4w: resolveBodyweight,
};

/**
 * The status of a stored forecast against the log as it stands at `now`.
 *
 * Open: the workout is not finished, or the date has not come. Void (never scored):
 * the workout is missing, deleted or discarded; the lift's last set was not reached;
 * a set of the lift carries a freeze status or a load drop; the weight lifted is not
 * `event.weight` (an override); the workout was ended early (session length); too few
 * measurements around a horizon date. Otherwise resolved, with the measured value and
 * whether it fell inside the range or met the event.
 *
 * To resolve many forecasts against one log, index it once (`indexLog`) and pass the
 * index: `scoreForecasts` does.
 *
 * @evidence forecast-calibration
 */
export function resolveForecast(forecast: Forecast, log: ForecastLog, now: Date): ForecastStatus {
  const resolver = RESOLVERS[forecast.kind];
  return resolver ? resolver(forecast, log, now) : voided("not-scorable");
}

/**
 * The row to score for each slot: the earliest made (ties by id), oldest first.
 * Several devices can write a horizon forecast for the same week; only the first
 * counts, so a later prediction can never replace an earlier one. Deleted rows are
 * ignored.
 */
export function earliestPerSlot(forecasts: Forecast[]): Forecast[] {
  const bySlot = new Map<string, Forecast>();
  for (const forecast of forecasts) {
    if (!isLive(forecast)) continue;
    const held = bySlot.get(forecast.slot);
    if (!held || isEarlier(forecast, held)) bySlot.set(forecast.slot, forecast);
  }
  return [...bySlot.values()].sort((a, b) => (isEarlier(a, b) ? -1 : isEarlier(b, a) ? 1 : 0));
}

function isEarlier(a: Forecast, b: Forecast): boolean {
  const ta = toMs(a.madeAt);
  const tb = toMs(b.madeAt);
  return ta < tb || (ta === tb && a.id < b.id);
}
