// Series maths for the Progress > Strength tab. Pure: no React, no database.
import {
  appPointsOnly,
  importedE1rmPoints,
  withImportedPoints,
  type ImportedLiftIndex,
} from "@/lib/import/history";
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import { WEEK_MS } from "@/lib/dates";
import type { MetricSource, Point, RangeKey, Series, SeriesSummary } from "@/lib/metrics/types";
import { TREND_SMOOTHING, smoothedEstimate, sumLines, type StrengthTimeline } from "@/lib/strength";
import type { LiftState } from "@/types";
import { LIFT_NAMES, MAIN_LIFTS, isMainLift, type MainLiftId } from "./lifts";


export interface TotalPoints {
  points: Point[];
  /** The lifts summed, in MAIN_LIFTS order. */
  lifts: MainLiftId[];
}

/**
 * The sum of the main lifts' estimated 1RMs over time. At each estimate's date it adds
 * each lift's most recent estimate at or before that date, starting once every lift
 * included has at least one. Lifts with no estimate are left out (see `lifts`).
 */
export function totalE1RMPoints(byLift: Partial<Record<MainLiftId, Point[]>>): TotalPoints {
  const lifts = MAIN_LIFTS.filter((id) => (byLift[id]?.length ?? 0) > 0);
  if (lifts.length === 0) return { points: [], lifts: [] };

  const sorted = lifts.map((id) => [...byLift[id]!].sort((a, b) => a.t - b.t));
  const start = Math.max(...sorted.map((pts) => pts[0].t));
  const times = [...new Set(sorted.flatMap((pts) => pts.map((x) => x.t)))]
    .filter((t) => t >= start)
    .sort((a, b) => a - b);

  const cursor = sorted.map(() => 0);
  const points = times.map((t): Point => {
    let v = 0;
    let imported = false;
    sorted.forEach((pts, i) => {
      while (cursor[i] + 1 < pts.length && pts[cursor[i] + 1].t <= t) cursor[i]++;
      v += pts[cursor[i]].v;
      imported ||= pts[cursor[i]].imported === true;
    });
    // A total that adds an imported estimate is drawn as imported.
    return imported ? { t, v, imported } : { t, v };
  });
  return { points, lifts };
}

export interface TrendTotal {
  label: string;
  lifts: MainLiftId[];
  /** The sum of the lifts' smooth lines (standard smoothing, every source), in the range. */
  series: Series;
  summary: SeriesSummary;
  /** The sum of the planner's estimates, the numbers the lift pages show; null without lifts. */
  value: number | null;
}

/**
 * The Strength tab's total from the same smooth line each lift page draws: each lift's
 * line on a shared day grid, summed from the day every included lift has one, and the
 * planner's estimates summed for the number. Lifts with no sessions are left out.
 */
export function trendTotal(timelines: readonly StrengthTimeline[], range: RangeKey, now: number): TrendTotal {
  const withData = timelines.filter(
    (tl) => tl.subject.kind === "lift" && isMainLift(tl.subject.liftId) && tl.points.length > 0
  );
  const lifts = MAIN_LIFTS.filter((id) =>
    withData.some((tl) => tl.subject.kind === "lift" && tl.subject.liftId === id)
  );
  const ordered = lifts.map((id) => withData.find((tl) => tl.subject.kind === "lift" && tl.subject.liftId === id)!);
  const lines = ordered.map((tl) => smoothedEstimate(tl, { halfLifeDays: TREND_SMOOTHING.standard }).points);
  const full: Series = { metric: "e1rm", params: {}, points: sumLines(lines), unit: "lbs", better: "up" };
  const series = inRange(full, range, now);
  const anchors = ordered.map((tl) => tl.anchor?.value);
  return {
    label: totalLabel(lifts),
    lifts,
    series,
    summary: summarize(series),
    value: anchors.length > 0 && anchors.every((v) => v !== undefined) ? anchors.reduce((s, v) => s + v!, 0) : null,
  };
}

/** "Total of four lifts, est. 1RM", or the lifts included when fewer have estimates. */
export function totalLabel(lifts: MainLiftId[]): string {
  if (lifts.length === MAIN_LIFTS.length) return "Total of four lifts, est. 1RM";
  const names = lifts.map((id) => LIFT_NAMES[id].short);
  if (names.length === 1) {
    return `${names[0][0].toUpperCase()}${names[0].slice(1)}, est. 1RM`;
  }
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Total of ${list}, est. 1RM`;
}

export interface Stall {
  /** Latest minus the first of the last three estimates (0 or less). */
  change: number;
  /** Whole weeks spanned by those estimates, at least 1. */
  weeks: number;
}

/** Non-null when the latest of a lift's last three estimates is not above the first of them. */
export function stallOf(points: Point[]): Stall | null {
  if (points.length < 3) return null;
  const [first, , last] = points.slice(-3);
  const change = last.v - first.v;
  if (change > 0) return null;
  return { change, weeks: Math.max(1, Math.round((last.t - first.t) / WEEK_MS)) };
}

export interface LiftOverview {
  id: MainLiftId;
  label: string;
  liftState: LiftState | undefined;
  full: Series;
  series: Series;
  summary: SeriesSummary;
  /** From the full history, not the range. */
  stall: Stall | null;
  /**
   * The latest estimate of the whole history, when the range holds none: the one the
   * total above the rows still counts, shown with its date instead of "–". Null when the
   * range has a point or the lift has no estimate at all.
   */
  latestBeforeRange: Point | null;
}

/** The newest point of a series, or null. */
function newestPoint(points: readonly Point[]): Point | null {
  return points.reduce<Point | null>((latest, p) => (latest == null || p.t >= latest.t ? p : latest), null);
}

export interface StrengthOverview {
  /** False when there are no estimates, no completed workouts and no imported sessions of a lift. */
  hasData: boolean;
  lifts: LiftOverview[];
  total: { label: string; lifts: MainLiftId[]; series: Series; summary: SeriesSummary };
}

/**
 * Each main lift's estimated 1RM over `range` and their total. With `imported` (the
 * imported sessions per exercise), each lift's series also has the estimates of its
 * imported sessions, marked imported; a stall is judged on the app's own estimates.
 */
export function strengthOverview(
  source: MetricSource,
  range: RangeKey,
  now: number,
  imported?: ImportedLiftIndex
): StrengthOverview {
  const lifts = MAIN_LIFTS.map((id): LiftOverview => {
    const full = withImportedPoints(
      computeMetric("e1rm", source, { exerciseId: id }),
      importedE1rmPoints(imported?.get(id) ?? [])
    );
    const series = inRange(full, range, now);
    return {
      id,
      label: LIFT_NAMES[id].label,
      liftState: source.liftStates.find((s) => s.exerciseId === id),
      full,
      series,
      summary: summarize(series),
      stall: stallOf(appPointsOnly(full.points)),
      latestBeforeRange: series.points.length > 0 ? null : newestPoint(full.points),
    };
  });

  const totals = totalE1RMPoints(
    Object.fromEntries(lifts.map((l) => [l.id, l.full.points])) as Record<MainLiftId, Point[]>
  );
  const totalFull: Series = {
    metric: "e1rm",
    params: {},
    points: totals.points,
    unit: "lbs",
    better: "up",
  };
  const totalSeries = inRange(totalFull, range, now);

  return {
    hasData: source.e1rms.length > 0 || source.workouts.length > 0 || lifts.some((l) => l.full.points.length > 0),
    lifts,
    total: {
      label: totalLabel(totals.lifts),
      lifts: totals.lifts,
      series: totalSeries,
      summary: summarize(totalSeries),
    },
  };
}
