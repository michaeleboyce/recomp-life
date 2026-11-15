// Builds the forecast rows to store. Pure: returns rows, writes nothing, reads no clock.
//
// A row is written once, before the outcome exists, and holds only the prediction and
// the event it is about. What became of it is worked out on read (resolve.ts).
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import type { Forecast, ForecastKind, PrescribedEntry, Tier, WorkoutSession } from "@/types";
import { BODYWEIGHT_MODEL, CALIBRATION, E1RM_HORIZON_MODEL, STALL_MODEL } from "./coefficients";
import { e1rmResults, forecastBodyweight, forecastE1RM, type HorizonForecast } from "./horizon";
import { DAY_MS, finishedBy } from "./log";
import { forecastMilestone, forecastStall, T1_LIFTS } from "./outlook";
import { FORECAST_KINDS } from "./registry";
import { forecastReps, lastT1Sets, type RepsForecast } from "./reps";
import { forecastSessionLength } from "./sessionLength";
import type { ForecastSource } from "./types";

/** `fc:<workoutId>:<kind>` for the session, `fc:<workoutId>:<kind>:<exerciseId>:<tier>` for a lift. */
export function sessionForecastId(
  workoutId: string,
  kind: ForecastKind,
  exerciseId?: string,
  tier?: Tier
): string {
  const base = `fc:${workoutId}:${kind}`;
  return exerciseId ? `${base}:${exerciseId}:${tier ?? "T1"}` : base;
}

/** The ISO week of a date in UTC, e.g. "2026-W46". */
export function isoWeekUtc(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weeks belong to the year of their Thursday.
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** `kind|subject|ISO week (UTC)`: one scored horizon forecast per subject per week. */
export function horizonSlot(kind: ForecastKind, subject: string, madeAt: Date): string {
  return `${kind}|${subject}|${isoWeekUtc(madeAt)}`;
}

/** Subject of the bodyweight slot. */
export const BODYWEIGHT_SUBJECT = "bodyweight";

/** Whether a plan entry gets a reps forecast: a T1 lift ending in an as-many-as-you-can set. */
function hasRepsForecast(entry: WorkoutExerciseState): boolean {
  return entry.tier === "T1" && !entry.isWarmUp && entry.isAMRAP && entry.weight > 0;
}

/**
 * The weight the program planned for an entry, in the terms of the exercise performed.
 * For the lift itself that is the prescribed weight. A home substitute is planned in
 * dumbbell terms: its own weight, scaled back by the ratio a weight edit applied to
 * the barbell weight it stands for (`applyPlanEdits`), so an unedited one is its own.
 */
function plannedWeightOf(entry: WorkoutExerciseState, prescribed: PrescribedEntry): number {
  if (entry.originalWeight == null) return prescribed.weight;
  return entry.originalWeight > 0
    ? (entry.weight * prescribed.weight) / entry.originalWeight
    : entry.weight;
}

/** What the reps model saw, in the keys every row carries plus the model's own. */
function repsInputs(
  forecast: RepsForecast,
  entry: WorkoutExerciseState,
  plannedWeight: number,
  phase: string | null
): Forecast["inputs"] {
  return {
    level: forecast.level,
    scatter: forecast.scatter,
    sampleSize: forecast.sampleSize,
    sdScale: forecast.sdScale,
    readinessShift: forecast.readinessShift,
    phase,
    baseLevel: forecast.baseLevel,
    baseScatter: forecast.baseScatter,
    regimeChange: forecast.regimeChange,
    regimeMultiplier: forecast.regimeMultiplier,
    cuttingShift: forecast.cuttingShift,
    fittedPhase: forecast.fittedPhase,
    weight: forecast.weight,
    plannedWeight,
    targetReps: forecast.targetReps,
    stage: forecast.stage,
    performedExerciseId: entry.substituteExerciseId ?? entry.exerciseId,
  };
}

/**
 * The forecasts for a workout that is about to start: for each T1 lift the reps on
 * its last set (a spread), the chance it passes and, when the lift has a best that
 * some rep count at today's weight would beat, the chance that the workout sets a new
 * best estimated max (with the lifter's usual effort credit); and the session's length. Ids are `fc:<workoutId>:<kind>[:<exerciseId>:<tier>]`, also used
 * as `clientId` and `slot`, so starting the same workout twice cannot make a second row.
 *
 * `source` is what was known before the workout: finished workouts only. A home
 * substitute is forecast from its own past sets and gets no new-best row, because a
 * substitute's sets never count toward the lift's estimated max.
 *
 * `session.prescribed` is what the program planned. A lift it does not name was
 * swapped in or added for the day and gets no rows: there is no program lift for the
 * result to be scored against, and rows built on nothing would feed the widening
 * rule. A lift whose weight the user changed is forecast at the weight on the bar
 * with the strength level worked out for the prescribed weight, so a heavier bar
 * means fewer reps, not a stronger lifter. A session stored without a prescription
 * forecasts every T1 lift at its own weight.
 */
export function makeSessionForecasts(
  session: Pick<WorkoutSession, "id" | "prescribed">,
  plan: WorkoutPlan,
  source: ForecastSource
): Forecast[] {
  const madeAt = source.now;
  const phase = source.settings?.trainingPhase;
  const phaseMode = phase?.mode ?? null;

  const length = forecastSessionLength({
    plan,
    workouts: source.workouts,
    phase,
    sdScale: source.sdScale?.sessionLength,
    now: madeAt,
  });
  const dueAt = new Date(madeAt.getTime() + Math.round(length.seconds) * 1000);

  const rows = new Map<string, Forecast>();
  const add = (
    kind: ForecastKind,
    fields: Pick<Forecast, "event" | "prediction" | "basis" | "inputs">,
    lift?: { exerciseId: string; tier: Tier }
  ) => {
    const id = sessionForecastId(session.id, kind, lift?.exerciseId, lift?.tier);
    if (rows.has(id)) return;
    rows.set(id, {
      id,
      clientId: id,
      slot: id,
      kind,
      workoutId: session.id,
      ...(lift ?? {}),
      madeAt,
      dueAt,
      ...fields,
      modelVersion: FORECAST_KINDS[kind].modelVersion,
      synced: false,
    });
  };

  for (const entry of plan) {
    if (!hasRepsForecast(entry)) continue;
    const prescribed = session.prescribed?.find(
      (p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier
    );
    if (session.prescribed && !prescribed) continue;
    const plannedWeight = prescribed ? plannedWeightOf(entry, prescribed) : entry.weight;
    const lift = { exerciseId: entry.exerciseId, tier: entry.tier };
    const substituted = !!entry.substituteExerciseId;
    const forecast = forecastReps({
      history: lastT1Sets(source.workouts, entry.exerciseId, madeAt),
      performedExerciseId: entry.substituteExerciseId ?? entry.exerciseId,
      weight: entry.weight,
      plannedWeight,
      targetReps: entry.targetReps,
      phase: phaseMode,
      readinessShift: source.readinessShift,
      // The three reps kinds are one model, widened by the record of its ranges.
      sdScale: source.sdScale?.amrapReps,
      bestE1RM: substituted ? null : source.bestE1RMs[entry.exerciseId],
      now: madeAt,
    });
    const inputs = repsInputs(forecast, entry, plannedWeight, phaseMode);

    add(
      "amrapReps",
      {
        event: { type: "amrapReps", weight: entry.weight },
        prediction: {
          point: forecast.typical,
          low: forecast.range.low,
          high: forecast.range.high,
          pmf: forecast.pmf,
          unit: "reps",
        },
        basis: forecast.basis,
        inputs: { ...inputs, rangeChance: forecast.range.chance },
      },
      lift
    );
    add(
      "liftPass",
      {
        event: { type: "repsAtLeast", weight: entry.weight, reps: entry.targetReps },
        prediction: {
          point: forecast.passChance,
          probability: forecast.passChance,
          unit: "chance",
        },
        basis: forecast.basis,
        inputs,
      },
      lift
    );
    if (forecast.newBest) {
      add(
        "newBest",
        {
          // The best that stood when the forecast was made is part of the event, so
          // only an edit to this workout's own sets can move the outcome.
          event: { type: "e1rmAbove", weight: entry.weight, level: forecast.newBest.bestE1RM },
          prediction: {
            point: forecast.newBest.chance,
            probability: forecast.newBest.chance,
            unit: "chance",
          },
          basis: forecast.basis,
          inputs: {
            ...inputs,
            bestE1RM: forecast.newBest.bestE1RM,
            repsNeeded: forecast.newBest.repsNeeded,
            effortCredit: forecast.newBest.effortCredit,
            effortSample: forecast.newBest.effortSample,
          },
        },
        lift
      );
    }
  }

  add("sessionLength", {
    event: { type: "durationSeconds" },
    prediction: { point: length.seconds, low: length.low, high: length.high, unit: "s" },
    basis: length.basis,
    inputs: {
      level: length.seconds,
      scatter: length.relativeSd * length.seconds,
      sampleSize: length.sampleSize,
      sdScale: length.sdScale,
      readinessShift: null,
      phase: phaseMode,
      plannedSeconds: length.plannedSeconds,
      correction: length.correction,
    },
  });

  return [...rows.values()];
}

/**
 * The forecasts for a date some weeks ahead, as things stand at `source.now`: the
 * estimated max of every lift whose results can be projected, bodyweight, and for
 * each program T1 lift the chance of a stall in its next two sessions and the date
 * of its next round-number weight. Each row gets an id from `newId` and the slot
 * `kind|subject|ISO week (UTC)`; readers score the earliest row per slot
 * (`earliestPerSlot`), so calling this again in the same week adds nothing that
 * counts. A subject with too little history gets no row. `skipSlot` leaves out a
 * slot without working its model out (one already stored, say).
 */
export function makeHorizonForecasts(
  source: ForecastSource,
  newId: () => string,
  options: { skipSlot?: (slot: string) => boolean } = {}
): Forecast[] {
  const madeAt = source.now;
  const rows: Forecast[] = [];
  const skip = options.skipSlot ?? (() => false);
  const add = (
    kind: ForecastKind,
    subject: string,
    forecast: HorizonForecast,
    fields: Pick<Forecast, "event"> & { exerciseId?: string }
  ) => {
    const id = newId();
    rows.push({
      id,
      clientId: id,
      slot: horizonSlot(kind, subject, madeAt),
      kind,
      madeAt,
      dueAt: new Date(forecast.dueAt),
      ...fields,
      prediction: { point: forecast.point, low: forecast.low, high: forecast.high, unit: "lb" },
      basis: forecast.basis,
      inputs: {
        scatter: (forecast.high - forecast.low) / 2 / CALIBRATION.rangeZ,
        readinessShift: null,
        ...forecast.inputs,
      },
      modelVersion: FORECAST_KINDS[kind].modelVersion,
      synced: false,
    });
  };

  const lifts = [...e1rmResults(finishedBy(source.workouts, madeAt.getTime())).keys()].sort();
  for (const exerciseId of lifts) {
    if (skip(horizonSlot("e1rm4w", exerciseId, madeAt))) continue;
    const forecast = forecastE1RM(source, exerciseId);
    if (!forecast) continue;
    add("e1rm4w", exerciseId, forecast, {
      exerciseId,
      event: {
        type: "e1rmLevel",
        windowDays: E1RM_HORIZON_MODEL.outcomeWindowDays,
        minResults: E1RM_HORIZON_MODEL.minOutcomeResults,
      },
    });
  }

  const bodyweight = skip(horizonSlot("bodyweight4w", BODYWEIGHT_SUBJECT, madeAt))
    ? null
    : forecastBodyweight(source);
  if (bodyweight) {
    add("bodyweight4w", BODYWEIGHT_SUBJECT, bodyweight, {
      event: {
        type: "bodyweightMean",
        windowDays: BODYWEIGHT_MODEL.outcomeWindowDays,
        minResults: BODYWEIGHT_MODEL.minOutcomeEntries,
      },
    });
  }

  rows.push(...makeLiftOutlookForecasts(source, newId, skip));
  return rows;
}

/**
 * The stall chance and the round-number date of every program T1 lift that has an
 * outlook (`liftOutlook`): slot `kind|lift|ISO week (UTC)`, like the other forecasts
 * for a date ahead. A milestone's dates are stored in days since 1 January 1970
 * (UTC), so two weeks' forecasts of the same weight compare directly.
 */
function makeLiftOutlookForecasts(
  source: ForecastSource,
  newId: () => string,
  skip: (slot: string) => boolean
): Forecast[] {
  const madeAt = source.now;
  const rows: Forecast[] = [];
  const row = (
    kind: ForecastKind,
    exerciseId: string,
    fields: Pick<Forecast, "dueAt" | "event" | "prediction" | "basis" | "inputs">
  ) => {
    const id = newId();
    rows.push({
      id,
      clientId: id,
      slot: horizonSlot(kind, exerciseId, madeAt),
      kind,
      exerciseId,
      tier: "T1",
      madeAt,
      ...fields,
      modelVersion: FORECAST_KINDS[kind].modelVersion,
      synced: false,
    });
  };

  for (const exerciseId of T1_LIFTS) {
    const stall = skip(horizonSlot("stallRisk", exerciseId, madeAt))
      ? null
      : forecastStall(source, exerciseId);
    if (stall) {
      row("stallRisk", exerciseId, {
        dueAt: new Date(stall.dueAt),
        event: {
          type: "missAtStage",
          weight: stall.weight,
          reps: stall.targetReps,
          windowDays: STALL_MODEL.outcomeWindowDays,
          minResults: STALL_MODEL.sessions,
        },
        prediction: { point: stall.chance, probability: stall.chance, unit: "chance" },
        basis: stall.basis,
        inputs: stall.inputs,
      });
    }

    const milestone = skip(horizonSlot("milestone", exerciseId, madeAt))
      ? null
      : forecastMilestone(source, exerciseId);
    if (milestone) {
      row("milestone", exerciseId, {
        dueAt: new Date(milestone.high),
        event: { type: "weightReached", weight: milestone.target },
        prediction: {
          point: milestone.point / DAY_MS,
          low: milestone.low / DAY_MS,
          high: milestone.high / DAY_MS,
          unit: "day",
        },
        basis: milestone.basis,
        inputs: milestone.inputs,
      });
    }
  }
  return rows;
}
