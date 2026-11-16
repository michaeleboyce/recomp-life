// Replays a history through the forecast models: each workout is forecast from what
// was known before it started and scored against what was logged afterwards. The
// same functions write the real ledger, so this is how the models are checked on past
// data. Pure.
import { anchorToPrescription, rebuildDerived } from "@/lib/rebuild";
import { buildWorkoutPlan, overridesFromSession } from "@/lib/workout/buildPlan";
import { anchorHomePrescriptions } from "@/lib/workout/planForSession";
import type { WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  BodyweightLog,
  Forecast,
  ForecastStatus,
  LiftAdjustment,
  LiftState,
  UserSettings,
  VariantState,
  WorkoutSession,
} from "@/types";
import { e1rmResults } from "./horizon";
import { finishedBy, isLive, toMs } from "./log";
import { indexLog } from "./logIndex";
import { makeHorizonForecasts, makeSessionForecasts } from "./make";
import { resolveForecast } from "./resolve";
import { scoreForecasts, sdScales, trackRecord, type TrackRecordSplit } from "./score";
import type { ForecastLog, ForecastSource, ScoredForecast } from "./types";

export interface ReplayInput {
  /** Every workout row; only finished, live ones are replayed. */
  workouts: WorkoutSession[];
  /** Lift adjustments (starting weights, manual changes), as the rebuild takes them. */
  adjustments: LiftAdjustment[];
  bodyweight: BodyweightLog[];
  settings: UserSettings;
  /** Statuses are worked out as of this time; workouts finished later are not replayed. */
  now: Date;
}

export interface ReplayOptions {
  /** Feed each forecast the widening factor the record up to then calls for. Default true. */
  selfCorrect?: boolean;
  /** Also make the forecasts for a date weeks ahead at each workout start. Default true. */
  horizon?: boolean;
}

export interface ReplayResult {
  /** Every forecast made, in the order made (one per slot). */
  forecasts: Forecast[];
  scored: ScoredForecast[];
  record: TrackRecordSplit;
}

/** Best estimated max per lift among the given workouts. */
function bestE1RMs(workouts: WorkoutSession[]): Record<string, number> {
  const best: Record<string, number> = {};
  for (const [exerciseId, points] of e1rmResults(workouts)) {
    best[exerciseId] = Math.max(...points.map((p) => p.v));
  }
  return best;
}

/** The settings in force for a past workout: today's, with the phase it was finished in. */
function settingsFor(settings: UserSettings, workout: WorkoutSession): UserSettings {
  const mode = workout.completionContext?.phaseMode;
  return mode ? { ...settings, trainingPhase: { ...settings.trainingPhase, mode } } : settings;
}

/**
 * Replays `input` and returns the forecasts with their record.
 *
 * For each finished workout, in the order they started:
 * - the source is what was known when it started: workouts finished by then, weigh-ins
 *   logged by then, the best estimated max among those workouts, and the phase the
 *   workout was finished in;
 * - lift states are the rebuild's snapshot after the last workout finished before it,
 *   with the workout's own stored prescription laid on top (a workout stored without
 *   one falls back to a rebuild of the workouts before it), and the plan is built from
 *   them exactly as the rebuild does;
 * - session forecasts are made with their real ids; horizon forecasts get the id
 *   `replay:<slot>` and only the first per slot is kept;
 * - with `selfCorrect`, the widening factors come from the forecasts already made,
 *   scored against the log as it stood at that start.
 * Nothing a forecast is made from is dated after its workout's start, so changing
 * later data cannot change it. Every forecast is then scored against the full log.
 */
export function replayForecasts(input: ReplayInput, options: ReplayOptions = {}): ReplayResult {
  const selfCorrect = options.selfCorrect ?? true;
  const horizon = options.horizon ?? true;
  const nowMs = input.now.getTime();
  const log: ForecastLog = { workouts: input.workouts, bodyweight: input.bodyweight };

  const finished = finishedBy(input.workouts, nowMs).filter((w) =>
    Number.isFinite(toMs(w.startedAt))
  );
  const byStart = [...finished].sort(
    (a, b) => toMs(a.startedAt) - toMs(b.startedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const liveAdjustments = input.adjustments.filter(isLive);
  const { snapshots, variantSnapshots } = rebuildDerived({
    workouts: finished,
    adjustments: liveAdjustments,
    settings: input.settings,
  });

  const forecasts: Forecast[] = [];
  const slots = new Set<string>();
  /** Statuses of session forecasts whose workout had finished by the current start. */
  const settled = new Map<string, ForecastStatus>();

  for (const workout of byStart) {
    const startMs = toMs(workout.startedAt);
    const start = new Date(startMs);
    const before = finishedBy(finished, startMs);
    const adjustments = liveAdjustments.filter((a) => toMs(a.at) <= startMs);
    const settings = settingsFor(input.settings, workout);
    const logBefore: ForecastLog = indexLog({
      workouts: before,
      bodyweight: input.bodyweight.filter((b) => toMs(b.date) <= startMs),
    });

    let liftStates: LiftState[];
    let variantStates: VariantState[];
    if (workout.prescribed && before.length > 0) {
      const lastId = before[before.length - 1].id;
      liftStates = snapshots.get(lastId) ?? [];
      variantStates = variantSnapshots.get(lastId) ?? [];
    } else {
      ({ liftStates, variantStates } = rebuildDerived({ workouts: before, adjustments, settings }));
    }
    for (const entry of workout.prescribed ?? []) {
      liftStates = liftStates.map((state) =>
        state.exerciseId === entry.exerciseId ? anchorToPrescription(state, entry) : state
      );
    }

    let sdScale: ForecastSource["sdScale"];
    if (selfCorrect) {
      const beforeIds = new Set(before.map((w) => w.id));
      const known: ScoredForecast[] = forecasts.map((forecast) => {
        let status = settled.get(forecast.id);
        if (!status) {
          const ready = forecast.workoutId ? beforeIds.has(forecast.workoutId) : true;
          status = ready ? resolveForecast(forecast, logBefore, start) : { state: "open" };
          if (forecast.workoutId && ready) settled.set(forecast.id, status);
        }
        return { forecast, status };
      });
      sdScale = sdScales(known);
    }

    const source: ForecastSource = {
      workouts: before,
      bodyweight: logBefore.bodyweight,
      liftStates,
      bestE1RMs: bestE1RMs(before),
      settings,
      sdScale,
      now: start,
    };

    const template = WORKOUT_TEMPLATES[workout.templateId];
    if (template) {
      // At home each lift is planned as its home exercise from the variant states, with
      // the session's stored home prescription laid on top, as the rebuild plans it.
      const plan: WorkoutPlan = buildWorkoutPlan({
        template,
        liftStates,
        location: workout.location,
        equipment: settings.equipment,
        includeWarmUps: workout.includeWarmUps,
        selectedAccessories: workout.selectedAccessories ?? [],
        overrides: overridesFromSession(workout),
        variantStates: anchorHomePrescriptions({
          variantStates,
          session: workout,
          template,
          liftStates,
          equipment: settings.equipment,
        }).variantStates,
      });
      forecasts.push(...makeSessionForecasts(workout, plan, source));
    }

    if (horizon) {
      let made = 0;
      const rows = makeHorizonForecasts(source, () => `replay:${made++}`, {
        skipSlot: (slot) => slots.has(slot),
      });
      for (const row of rows) {
        if (slots.has(row.slot)) continue;
        slots.add(row.slot);
        const id = `replay:${row.slot}`;
        forecasts.push({ ...row, id, clientId: id });
      }
    }
  }

  const scored = scoreForecasts(forecasts, log, input.now);
  return { forecasts, scored, record: trackRecord(scored) };
}
