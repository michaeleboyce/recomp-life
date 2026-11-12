// Series maths for the Progress > Strength tab. Pure: no React, no database.
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import type { MetricSource, Point, RangeKey, Series, SeriesSummary } from "@/lib/metrics/types";
import type { LiftState } from "@/types";
import { LIFT_NAMES, MAIN_LIFTS, type MainLiftId } from "./lifts";

const WEEK_MS = 7 * 86_400_000;

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
  const points = times.map((t) => {
    let v = 0;
    sorted.forEach((pts, i) => {
      while (cursor[i] + 1 < pts.length && pts[cursor[i] + 1].t <= t) cursor[i]++;
      v += pts[cursor[i]].v;
    });
    return { t, v };
  });
  return { points, lifts };
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
}

export interface StrengthOverview {
  /** False when there are no estimates and no completed workouts at all. */
  hasData: boolean;
  lifts: LiftOverview[];
  total: { label: string; lifts: MainLiftId[]; series: Series; summary: SeriesSummary };
}

export function strengthOverview(
  source: MetricSource,
  range: RangeKey,
  now: number
): StrengthOverview {
  const lifts = MAIN_LIFTS.map((id): LiftOverview => {
    const full = computeMetric("e1rm", source, { exerciseId: id });
    const series = inRange(full, range, now);
    return {
      id,
      label: LIFT_NAMES[id].label,
      liftState: source.liftStates.find((s) => s.exerciseId === id),
      full,
      series,
      summary: summarize(series),
      stall: stallOf(full.points),
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
    hasData: source.e1rms.length > 0 || source.workouts.length > 0,
    lifts,
    total: {
      label: totalLabel(totals.lifts),
      lifts: totals.lifts,
      series: totalSeries,
      summary: summarize(totalSeries),
    },
  };
}
