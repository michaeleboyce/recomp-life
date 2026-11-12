// Shared building blocks for metric definitions. Pure: no React, no database.
import { getMonday } from "@/lib/dates";
import type { SetLog, WorkoutSession } from "@/types";
import type { MetricDef, MetricParams, MetricSource, Point, Series } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch milliseconds of a stored date, which may be a Date or an ISO string. */
export function toMs(value: Date | string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  return new Date(value).getTime();
}

/**
 * Builds a registry entry from its description and a function returning the raw
 * points. The series it computes drops non-finite points and is sorted oldest first.
 * `betterFor` overrides the direction when it depends on the data (e.g. the phase).
 */
export function defineMetric(
  meta: Omit<MetricDef, "compute">,
  build: (source: MetricSource, params: MetricParams) => Point[],
  betterFor?: (source: MetricSource) => Series["better"]
): MetricDef {
  return {
    ...meta,
    compute(source, params) {
      return {
        metric: meta.id,
        params,
        points: build(source, params)
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
          .sort((a, b) => a.t - b.t),
        unit: meta.unit,
        better: betterFor ? betterFor(source) : meta.better,
      };
    },
  };
}

/** Start (local Monday 00:00) of the week containing `t`, as epoch milliseconds. */
export function weekStartMs(t: number): number {
  return getMonday(new Date(t)).getTime();
}

/** Start (local, first of the month 00:00) of the month containing `t`. */
export function monthStartMs(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** The Monday one week after the Monday `weekStart` (safe across clock changes). */
export function nextWeekMs(weekStart: number): number {
  const d = new Date(weekStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime();
}

/** When a workout counts as having happened: its start, as the volume helpers use. */
export function workoutMs(workout: WorkoutSession): number {
  return toMs(workout.startedAt);
}

/** Workouts with a valid start time, oldest first. Does not reorder the input. */
export function sortedWorkouts(workouts: WorkoutSession[]): WorkoutSession[] {
  return workouts
    .filter((w) => Number.isFinite(workoutMs(w)))
    .sort((a, b) => workoutMs(a) - workoutMs(b));
}

/**
 * Workouts grouped by calendar week, oldest week first, including the weeks with no
 * workout that lie between the first and the last trained week (so a missed week
 * shows as zero and not as a gap).
 */
export function workoutsByWeek(
  workouts: WorkoutSession[]
): Array<{ weekStart: number; workouts: WorkoutSession[] }> {
  const sorted = sortedWorkouts(workouts);
  if (sorted.length === 0) return [];
  const byWeek = new Map<number, WorkoutSession[]>();
  for (const w of sorted) {
    const key = weekStartMs(workoutMs(w));
    const list = byWeek.get(key);
    if (list) list.push(w);
    else byWeek.set(key, [w]);
  }
  const last = weekStartMs(workoutMs(sorted[sorted.length - 1]));
  const weeks: Array<{ weekStart: number; workouts: WorkoutSession[] }> = [];
  for (let week = weekStartMs(workoutMs(sorted[0])); week <= last; week = nextWeekMs(week)) {
    weeks.push({ weekStart: week, workouts: byWeek.get(week) ?? [] });
  }
  return weeks;
}

/** Weight x reps summed over sets. */
export function setsVolume(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + s.weight * s.actualReps, 0);
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** "3 sets", "1 set". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "232.5", "190": at most `digits` decimals, trailing zeros dropped. */
export function formatNumber(value: number, digits = 1): string {
  return String(Number(value.toFixed(digits)));
}

/** Whole number with thousands separators, e.g. "12,450". */
export function formatWhole(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
