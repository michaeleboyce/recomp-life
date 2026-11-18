// Series maths for the Progress > Strength tab. Pure: no React, no database.
import {
  appPointsOnly,
  importedE1rmPoints,
  withImportedPoints,
  type ImportedLiftIndex,
} from "@/lib/import/history";
import { lineValueAt, type LinePoint, type Span } from "@/components/chart-kit/trendGeometry";
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import { windowBounds, type ChartWindow } from "@/lib/metrics/window";
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

export interface LiftEstimate {
  /** The planner's pooled estimate (`timeline.anchor`), the number the lift page headline shows. */
  value: number;
  /**
   * The smooth line's change over the window (standard smoothing, every source), worked
   * out as the lift page's chart works out its change; null with under a day of line.
   */
  change: number | null;
  /** That line inside the window, for a sparkline. */
  line: Point[];
  /** The newest session of the lift itself (app or imported) up to now. */
  latest: { t: number; imported: boolean } | null;
}

/**
 * One lift's number wherever it is shown on its own (Progress > Strength, Today's lift
 * tiles): the same pooled estimate as the lift page headline, with a change from the
 * same smooth line its chart draws over `window`. Null when the lift has no estimate.
 *
 * @evidence strength-pooling
 */
export function liftEstimate(timeline: StrengthTimeline, window: RangeKey): LiftEstimate | null {
  const anchor = timeline.anchor;
  if (!anchor) return null;
  const now = timeline.now;
  const line = smoothedEstimate(timeline, { halfLifeDays: TREND_SMOOTHING.standard }).points;
  // As the chart: the same window and the same change of the line over it.
  const view = trendView(timeline, window);
  const own = timeline.points.filter((p) => (p.sourceId === "own" || p.sourceId === "imported") && p.t <= now);
  const newest = own.at(-1);
  return {
    value: anchor.value,
    change: lineChange(line, view).change,
    line: line.filter((p) => p.t >= view.from && p.t <= view.to).map((p) => ({ t: p.t, v: p.v })),
    latest: newest ? { t: newest.t, imported: newest.imported } : null,
  };
}

/** What a strength chart can show: from its first dot (or a week back, if later) up to now. */
export function trendLimits(timeline: StrengthTimeline): Span {
  const now = timeline.now;
  const firstT = timeline.points.length > 0 ? timeline.points[0].t : now;
  return { from: Math.min(firstT, now - WEEK_MS), to: now };
}

/**
 * The span a strength chart shows for `window` (a preset, or a zoomed span), cut to
 * `trendLimits`. The lift page's chart, Progress and Today read their window here.
 */
export function trendView(timeline: StrengthTimeline, window: RangeKey | ChartWindow): Span {
  const limits = trendLimits(timeline);
  const bounds = windowBounds(window, timeline.now);
  return { from: Math.max(bounds.from, limits.from), to: Math.min(bounds.to, limits.to) };
}

export interface LineChange {
  /** The line at the view's start, or at its own first point when that is later. */
  first: LinePoint | null;
  /** The line at the view's end. */
  last: LinePoint | null;
  /** last minus first; null without both, or when they are the same instant. */
  change: number | null;
}

/** The smooth line's change over the view, as every strength chart and card shows it. */
export function lineChange(line: readonly LinePoint[], view: Span): LineChange {
  const first = lineValueAt(line, Math.max(view.from, line[0]?.t ?? view.from));
  const last = lineValueAt(line, view.to);
  return { first, last, change: first && last && last.t > first.t ? last.v - first.v : null };
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
  /**
   * The lift's number as the lift page shows it (`liftEstimate` over its timeline): what
   * the card shows when given. Absent or null without a timeline or an estimate.
   */
  estimate?: LiftEstimate | null;
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
 * With `timelines` (the lifts' strength timelines, `useLiftTimelines`), each lift also
 * gets its `estimate`, the pooled number the lift page headline shows.
 */
export function strengthOverview(
  source: MetricSource,
  range: RangeKey,
  now: number,
  imported?: ImportedLiftIndex,
  timelines?: readonly StrengthTimeline[]
): StrengthOverview {
  const lifts = MAIN_LIFTS.map((id): LiftOverview => {
    const timeline = timelines?.find((tl) => tl.subject.kind === "lift" && tl.subject.liftId === id);
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
      ...(timeline ? { estimate: liftEstimate(timeline, range) } : {}),
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
