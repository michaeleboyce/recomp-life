// How long today's workout will take: planned sets and rests, corrected by how long
// the lifter's own sessions ran against the same estimate. Pure.
import {
  estimateLoggedSeconds,
  estimateWorkoutSeconds,
} from "@/lib/workout/duration";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { ForecastBasis, TrainingPhase, WorkoutSession } from "@/types";
import { CALIBRATION, SESSION_LENGTH_MODEL } from "./coefficients";
import { finishedBy } from "./log";
import { clamp, median, robustSd } from "./math";

export interface SessionLengthForecast {
  /** Expected length in seconds. */
  seconds: number;
  /** About an 80% range, seconds. */
  low: number;
  high: number;
  /** "prior" until there are enough finished sessions, then "persistence". */
  basis: ForecastBasis;
  /** The plan's length on paper, before the correction. */
  plannedSeconds: number;
  /** Typical real length over length on paper in past sessions; 1 before there is history. */
  correction: number;
  /** Scatter of the forecast as a fraction of it, after any widening. */
  relativeSd: number;
  /** Past sessions the correction was read from. */
  sampleSize: number;
  sdScale: number;
}

/**
 * Real length over length on paper for each finished session up to `now`, oldest
 * first. Length on paper is `estimateLoggedSeconds` of the sets that were logged, so
 * the ratio is the lifter's pace and a short plan does not look like a fast one.
 * Sessions that were ended early, have no sets or no recorded length are left out.
 */
export function sessionPaceRatios(
  workouts: WorkoutSession[],
  now: Date,
  fallbackPhase?: TrainingPhase
): number[] {
  const ratios: number[] = [];
  for (const workout of finishedBy(workouts, now.getTime())) {
    if (workout.endedEarly) continue;
    const mode = workout.completionContext?.phaseMode;
    const phase: TrainingPhase | undefined = mode ? { mode } : fallbackPhase;
    const onPaper = estimateLoggedSeconds(workout.sets ?? [], phase);
    const real = workout.totalDurationSeconds;
    if (!(onPaper > 0) || !(real > 0)) continue;
    ratios.push(real / onPaper);
  }
  return ratios;
}

/**
 * Session length for a plan.
 *
 * Before SESSION_LENGTH_MODEL.minSessionsForCorrection finished sessions: the length
 * on paper (`estimateWorkoutSeconds`), give or take defaultRangeFraction of it.
 * After: the length on paper x the median pace ratio of the latest `recentSessions`
 * sessions. The scatter is the ratios' own (a robust measure, so one session left
 * open overnight does not blow it up), at least sdFloorFraction, widened for the
 * small sample; the range is rangeZ scatters either side.
 */
export function forecastSessionLength(input: {
  plan: WorkoutPlan;
  workouts: WorkoutSession[];
  phase?: TrainingPhase;
  /** Widening factor from the track record (`sdScaleFor`); 1 when left out. */
  sdScale?: number;
  now: Date;
}): SessionLengthForecast {
  const plannedSeconds = estimateWorkoutSeconds(input.plan, input.phase);
  const sdScale = clamp(
    Number.isFinite(input.sdScale) ? (input.sdScale as number) : 1,
    CALIBRATION.sdScaleMin,
    CALIBRATION.sdScaleMax
  );
  const ratios = sessionPaceRatios(input.workouts, input.now, input.phase).slice(
    -SESSION_LENGTH_MODEL.recentSessions
  );

  let basis: ForecastBasis = "prior";
  let correction = 1;
  let relativeSd = SESSION_LENGTH_MODEL.defaultRangeFraction / CALIBRATION.rangeZ;
  if (ratios.length >= SESSION_LENGTH_MODEL.minSessionsForCorrection) {
    basis = "persistence";
    correction = median(ratios);
    relativeSd =
      Math.max(robustSd(ratios) / correction, SESSION_LENGTH_MODEL.sdFloorFraction) *
      Math.sqrt(1 + 1 / ratios.length);
  }
  relativeSd *= sdScale;

  const seconds = plannedSeconds * correction;
  const halfWidth = CALIBRATION.rangeZ * relativeSd * seconds;
  return {
    seconds,
    low: Math.max(0, seconds - halfWidth),
    high: seconds + halfWidth,
    basis,
    plannedSeconds,
    correction,
    relativeSd,
    sampleSize: basis === "prior" ? 0 : ratios.length,
    sdScale,
  };
}
