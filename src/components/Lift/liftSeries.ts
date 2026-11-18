// Series maths for the lift detail page. Pure: no React, no database.
import { bucket, computeMetric, inRange, summarize, windowBounds, type ChartWindow } from "@/lib/metrics";
import type {
  MetricId,
  MetricSource,
  Point,
  RangeKey,
  Series,
  SeriesSummary,
} from "@/lib/metrics/types";
import { nextWeekMs, weekStartMs } from "@/lib/metrics/helpers";
import {
  describePrOpportunity,
  measureBaseline,
  projectionTeaser,
  type PrOpportunity,
  type ProjectionTeaser,
} from "@/lib/projection";
import {
  importedE1rmPoints,
  importedVolumePoints,
  importedWorkingWeightPoints,
  withImportedPoints,
  type ImportedLiftSession,
} from "@/lib/import/history";
import { getPrescription } from "@/lib/workout";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, SetLog, WorkoutTemplateExercise } from "@/types";

/** How far ahead the projection teaser looks, then the fallback when that is too far. */
const TEASER_WEEKS = [8, 4] as const;

const LIFT_METRICS = ["e1rm", "workingWeight", "amrapReps", "avgRepsInReserve", "liftVolume"] as const;
type LiftMetricId = (typeof LIFT_METRICS)[number] & MetricId;

export interface RangedMetric {
  full: Series;
  series: Series;
  summary: SeriesSummary;
}

export type LiftMetrics = Record<LiftMetricId, RangedMetric> & {
  /**
   * Volume summed per calendar week within the range, with a 0 for every week in
   * it that has none (from the range start, or the first logged volume if later,
   * to this week), so skipped weeks count.
   */
  weeklyVolume: Series;
};

/**
 * The source with the lift's home-substitute sets taken out, so the lift's statistics
 * are about the barbell lift only. A goblet squat's weight, reps and effort say
 * nothing about the squat's (the session list still shows those sessions).
 */
export function barbellOnlySource(source: MetricSource, exerciseId: string): MetricSource {
  const isHomeSet = (set: SetLog) =>
    set.exerciseId === exerciseId && (set.isSubstituted || set.substituteExerciseId != null);
  return {
    ...source,
    workouts: source.workouts.map((workout) =>
      (workout.sets ?? []).some(isHomeSet)
        ? { ...workout, sets: workout.sets.filter((set) => !isHomeSet(set)) }
        : workout
    ),
  };
}

/** The imported points each lift series takes; the others are the app's alone. */
const IMPORTED_POINTS: Partial<Record<LiftMetricId, (history: readonly ImportedLiftSession[]) => Point[]>> = {
  e1rm: importedE1rmPoints,
  workingWeight: importedWorkingWeightPoints,
  liftVolume: importedVolumePoints,
};

/**
 * The lift's series over `range`. With `imported` (the lift's imported sessions), the
 * estimated max, working weight and volume also have one point per imported session,
 * marked imported; last-set reps and effort stay the app's (an imported set was not an
 * AMRAP set, and its effort word is only an approximate answer).
 */
export function liftMetrics(
  source: MetricSource,
  exerciseId: string,
  range: RangeKey | ChartWindow,
  now: number,
  imported?: readonly ImportedLiftSession[]
): LiftMetrics {
  const barbell = barbellOnlySource(source, exerciseId);
  const entries = LIFT_METRICS.map((id) => {
    const extra = imported ? (IMPORTED_POINTS[id]?.(imported) ?? []) : [];
    const full = withImportedPoints(computeMetric(id, barbell, { exerciseId }), extra);
    const series = inRange(full, range, now);
    return [id, { full, series, summary: summarize(series) }] as const;
  });
  const metrics = Object.fromEntries(entries) as Record<LiftMetricId, RangedMetric>;
  return {
    ...metrics,
    weeklyVolume: zeroFilledWeeks(metrics.liftVolume.full, metrics.liftVolume.series, range, now),
  };
}

/** Weekly sums of `ranged`, with zeros for the empty weeks of the range (see LiftMetrics). */
export function zeroFilledWeeks(full: Series, ranged: Series, range: RangeKey | ChartWindow, now: number): Series {
  const weekly = bucket(ranged, "week", "sum");
  if (full.points.length === 0) return weekly;
  const firstEver = Math.min(...full.points.map((p) => p.t));
  const bounds = windowBounds(range, now);
  const rangeStart = Number.isFinite(bounds.from) ? bounds.from : firstEver;
  const byWeek = new Map(weekly.points.map((p) => [p.t, p]));
  const points: Point[] = [];
  const last = weekStartMs(Math.min(now, bounds.to));
  for (let week = weekStartMs(Math.max(rangeStart, firstEver)); week <= last; week = nextWeekMs(week)) {
    points.push(byWeek.get(week) ?? { t: week, v: 0 });
  }
  return { ...weekly, points };
}

function meanOf(points: Point[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.v, 0) / points.length;
}

export interface LiftStats {
  working: { value: number | null; change: number | null };
  /** Mean AMRAP reps in the range. */
  lastSetReps: number | null;
  /** Mean reps left in the range; higher means easier. */
  effort: number | null;
  /** Mean weekly volume (lbs) in the range. */
  weeklyVolume: number | null;
}

export function liftStats(m: LiftMetrics): LiftStats {
  return {
    working: {
      value: m.workingWeight.summary.latest?.v ?? null,
      change: m.workingWeight.summary.change,
    },
    lastSetReps: meanOf(m.amrapReps.series.points),
    effort: meanOf(m.avgRepsInReserve.series.points),
    weeklyVolume: meanOf(m.weeklyVolume.points),
  };
}

/** "8.4k" for thousands, else a whole number. */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(Math.round(value));
}

/**
 * "On this trend: about 249 in 8 weeks": the projection screen's own current-trend
 * figure (`projectionTeaser`), from the lift's whole history so it does not change
 * with the chart's range tab. 8 weeks ahead, else 4 when the history does not
 * support 8; null when neither can be shown.
 */
export function liftTeaser(
  source: MetricSource,
  exerciseId: string,
  history: Point[],
  now: number
): ProjectionTeaser | null {
  const date = new Date(now);
  const baseline = measureBaseline(source, exerciseId, date);
  for (const weeks of TEASER_WEEKS) {
    const teaser = projectionTeaser({ history, baseline, now: date, weeks });
    if (teaser) return teaser;
  }
  return null;
}

function t1TemplateExercise(exerciseId: string): WorkoutTemplateExercise {
  for (const template of Object.values(WORKOUT_TEMPLATES)) {
    const found = template.exercises.find((e) => e.exerciseId === exerciseId && e.tier === "T1");
    if (found) return found;
  }
  return { exerciseId, tier: "T1", sets: 5, reps: 3, isAMRAP: true };
}

/**
 * The lift's next T1 weight and scheme, and what its AMRAP set needs for a new best
 * e1RM.
 */
export function nextT1Opportunity(
  exerciseId: string,
  liftState: LiftState | undefined,
  bestE1RM: number | null
): { weight: number; sets: number; reps: number; opportunity: PrOpportunity | null } {
  const { weight, sets, reps } = getPrescription(t1TemplateExercise(exerciseId), liftState);
  const opportunity =
    weight > 0
      ? describePrOpportunity({
          tier: "T1",
          isAMRAP: true,
          weight,
          bestE1RM,
          recentAMRAPReps: liftState?.recentAMRAPReps ?? [],
        })
      : null;
  return { weight, sets, reps, opportunity };
}
