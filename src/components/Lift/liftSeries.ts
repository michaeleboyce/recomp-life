// Series maths for the lift detail page. Pure: no React, no database.
import { bucket, computeMetric, inRange, summarize } from "@/lib/metrics";
import type {
  MetricId,
  MetricSource,
  Point,
  RangeKey,
  Series,
  SeriesSummary,
} from "@/lib/metrics/types";
import { describePrOpportunity, fitTrend, type PrOpportunity } from "@/lib/projection";
import { getPrescription } from "@/lib/workout";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, WorkoutTemplateExercise } from "@/types";
import type { TrendOverlay } from "@/components/chart-kit";

const WEEK_MS = 7 * 86_400_000;
/** How far ahead the projection teaser looks. */
export const TEASER_WEEKS = 8;

const LIFT_METRICS = ["e1rm", "workingWeight", "amrapReps", "avgRpe", "liftVolume"] as const;
type LiftMetricId = (typeof LIFT_METRICS)[number] & MetricId;

export interface RangedMetric {
  full: Series;
  series: Series;
  summary: SeriesSummary;
}

export type LiftMetrics = Record<LiftMetricId, RangedMetric> & {
  /** Volume summed per calendar week, within the range. */
  weeklyVolume: Series;
};

export function liftMetrics(
  source: MetricSource,
  exerciseId: string,
  range: RangeKey,
  now: number
): LiftMetrics {
  const entries = LIFT_METRICS.map((id) => {
    const full = computeMetric(id, source, { exerciseId });
    const series = inRange(full, range, now);
    return [id, { full, series, summary: summarize(series) }] as const;
  });
  const metrics = Object.fromEntries(entries) as Record<LiftMetricId, RangedMetric>;
  return { ...metrics, weeklyVolume: bucket(metrics.liftVolume.series, "week", "sum") };
}

function meanOf(points: Point[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.v, 0) / points.length;
}

export interface LiftStats {
  working: { value: number | null; change: number | null };
  /** Mean AMRAP reps in the range. */
  lastSetReps: number | null;
  /** Mean RPE in the range. */
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
    effort: meanOf(m.avgRpe.series.points),
    weeklyVolume: meanOf(m.weeklyVolume.points),
  };
}

/** "8.4k" for thousands, else a whole number. */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(Math.round(value));
}

/** The fitted straight line across the visible points, or null under four points. */
export function trendOverlay(points: Point[]): TrendOverlay | null {
  const fit = fitTrend(points);
  if (!fit || points.length === 0) return null;
  const first = points[0].t;
  const last = points[points.length - 1].t;
  return {
    id: "trend",
    label: "Trend",
    style: "dashed",
    points: [
      { t: first, v: fit.valueAt(first) },
      { t: last, v: fit.valueAt(last) },
    ],
  };
}

/** The fitted line's value TEASER_WEEKS after `now`, rounded; null without a fit. */
export function projectionTeaser(points: Point[], now: number): number | null {
  const fit = fitTrend(points);
  return fit ? Math.round(fit.valueAt(now + TEASER_WEEKS * WEEK_MS)) : null;
}

function t1TemplateExercise(exerciseId: string): WorkoutTemplateExercise {
  for (const template of Object.values(WORKOUT_TEMPLATES)) {
    const found = template.exercises.find((e) => e.exerciseId === exerciseId && e.tier === "T1");
    if (found) return found;
  }
  return { exerciseId, tier: "T1", sets: 5, reps: 3, isAMRAP: true };
}

/** The lift's next T1 weight and what its AMRAP set needs for a new best e1RM. */
export function nextT1Opportunity(
  exerciseId: string,
  liftState: LiftState | undefined,
  bestE1RM: number | null
): { weight: number; opportunity: PrOpportunity | null } {
  const { weight } = getPrescription(t1TemplateExercise(exerciseId), liftState);
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
  return { weight, opportunity };
}
