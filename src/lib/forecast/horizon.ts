// Forecasts for a date some weeks ahead: a lift's estimated max and bodyweight. Pure.
import type { MetricSource, Point } from "@/lib/metrics/types";
import { measureBaseline } from "@/lib/projection/baseline";
import { projectE1RM, STALE_HISTORY_WEEKS } from "@/lib/projection/project";
import { fitTrend, MS_PER_WEEK } from "@/lib/projection/trend";
import { e1rmsForWorkout } from "@/lib/rebuild/e1rm";
import type { BodyweightLog, ForecastBasis, WorkoutSession } from "@/types";
import { BODYWEIGHT_MODEL, CALIBRATION, E1RM_HORIZON_MODEL } from "./coefficients";
import { DAY_MS, finishedBy, isLive, toMs } from "./log";
import { clamp } from "./math";
import type { ForecastSource } from "./types";

export interface HorizonForecast {
  /** Epoch milliseconds the forecast is for. */
  dueAt: number;
  point: number;
  /** About an 80% range. */
  low: number;
  high: number;
  basis: ForecastBasis;
  inputs: Record<string, number | string | null>;
}

function widening(source: ForecastSource, kind: "e1rm4w" | "bodyweight4w"): number {
  const scale = source.sdScale?.[kind];
  return clamp(
    typeof scale === "number" && Number.isFinite(scale) ? scale : 1,
    CALIBRATION.sdScaleMin,
    CALIBRATION.sdScaleMax
  );
}

/**
 * The estimated-max results of the given workouts, by exercise id, oldest first: the
 * rows the app itself would store for them (`e1rmsForWorkout`, which credits a
 * logged RPE and skips home substitutes). Deleted workouts give none.
 */
export function e1rmResults(workouts: WorkoutSession[]): Map<string, Point[]> {
  const byExercise = new Map<string, Point[]>();
  for (const workout of workouts) {
    if (!isLive(workout)) continue;
    for (const row of e1rmsForWorkout(workout)) {
      const t = toMs(row.date);
      if (!Number.isFinite(t)) continue;
      const list = byExercise.get(row.exerciseId) ?? [];
      list.push({ t, v: row.estimated1RM, refId: workout.id });
      byExercise.set(row.exerciseId, list);
    }
  }
  for (const list of byExercise.values()) list.sort((a, b) => a.t - b.t);
  return byExercise;
}

/**
 * A lift's estimated max E1RM_HORIZON_MODEL.horizonWeeks weeks ahead: the current
 * trend of `projectE1RM` (no scenario) from the lift's own results up to `now`, with
 * its range. Null when the projection has too little to fit.
 *
 * The basis is "trend", or "regime-change" when the last result is older than the
 * projection's own staleness limit and the line starts from that old result.
 *
 * @evidence projection-rate-of-gain
 */
export function forecastE1RM(source: ForecastSource, exerciseId: string): HorizonForecast | null {
  const nowMs = source.now.getTime();
  const workouts = finishedBy(source.workouts, nowMs);
  const history = e1rmResults(workouts).get(exerciseId) ?? [];
  const metricSource: MetricSource = {
    workouts,
    e1rms: [],
    bodyweight: source.bodyweight,
    runs: [],
    readiness: [],
    pain: [],
    liftStates: source.liftStates,
    settings: source.settings,
  };
  const weeks = E1RM_HORIZON_MODEL.horizonWeeks;
  const projection = projectE1RM({
    history,
    baseline: measureBaseline(metricSource, exerciseId, source.now),
    weeks,
    now: source.now,
  });
  if (projection.status === "insufficient-data") return null;
  const end = projection.points[projection.points.length - 1];
  if (!end) return null;

  const sdScale = widening(source, "e1rm4w");
  return {
    dueAt: nowMs + weeks * MS_PER_WEEK,
    point: end.v,
    low: Math.max(0, end.v - (end.v - end.low) * sdScale),
    high: end.v + (end.high - end.v) * sdScale,
    basis: projection.lastResultWeeksAgo > STALE_HISTORY_WEEKS ? "regime-change" : "trend",
    inputs: {
      level: projection.points[0].v,
      ratePerWeek: projection.startingRatePerWeek,
      sampleSize: history.filter((p) => p.t <= nowMs).length,
      fitWindowWeeks: projection.fitWindowWeeks,
      lastResultWeeksAgo: projection.lastResultWeeksAgo,
      projection: projection.status,
      sdScale,
      phase: source.settings?.trainingPhase?.mode ?? null,
    },
  };
}

/** Live weigh-ins with a usable date and weight, oldest first. */
export function weighIns(logs: BodyweightLog[]): Point[] {
  return logs
    .filter(isLive)
    .map((log) => ({ t: toMs(log.date), v: log.weight, refId: log.id }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0)
    .sort((a, b) => a.t - b.t);
}

/**
 * Bodyweight BODYWEIGHT_MODEL.horizonDays days ahead: a straight line through the
 * weigh-ins of the last fitWindowDays days, continued. Null with fewer than
 * minEntries weigh-ins in the window or when they cover less than minSpanDays.
 *
 * The range is rangeZ scatters either side, where the scatter of the outcome is the
 * weigh-ins' own around the line (at least sdFloorFraction of bodyweight), widened
 * for how far ahead the line is read (`predictionSd`).
 *
 * @evidence forecast-bodyweight
 */
export function forecastBodyweight(source: ForecastSource): HorizonForecast | null {
  const nowMs = source.now.getTime();
  const windowStart = nowMs - BODYWEIGHT_MODEL.fitWindowDays * DAY_MS;
  const fitted = weighIns(source.bodyweight).filter((p) => p.t >= windowStart && p.t <= nowMs);
  if (fitted.length < BODYWEIGHT_MODEL.minEntries) return null;
  const spanDays = (fitted[fitted.length - 1].t - fitted[0].t) / DAY_MS;
  if (spanDays < BODYWEIGHT_MODEL.minSpanDays) return null;
  const fit = fitTrend(fitted);
  if (!fit) return null;

  const dueAt = nowMs + BODYWEIGHT_MODEL.horizonDays * DAY_MS;
  const point = fit.valueAt(dueAt);
  const level = fit.valueAt(nowMs);
  if (!Number.isFinite(point) || !(point > 0)) return null;

  const sdScale = widening(source, "bodyweight4w");
  const singleSd = Math.max(fit.residualSd, BODYWEIGHT_MODEL.sdFloorFraction * level);
  const scatter = fit.predictionSd(dueAt, singleSd) * sdScale;
  const halfWidth = CALIBRATION.rangeZ * scatter;
  return {
    dueAt,
    point,
    low: Math.max(0, point - halfWidth),
    high: point + halfWidth,
    basis: "trend",
    inputs: {
      level,
      ratePerWeek: fit.slopePerWeek,
      scatter,
      sampleSize: fit.pointsUsed,
      spanDays,
      sdScale,
      phase: source.settings?.trainingPhase?.mode ?? null,
    },
  };
}
