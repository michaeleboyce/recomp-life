// Pure helpers for the Runs tab: series totals, other-activity totals and the
// sleep-versus-effort comparison.
import { ACTIVITY_KIND_LABELS } from "@/lib/activities";
import { averageRepsInReserve } from "@/lib/effort";
import { inRange } from "@/lib/metrics";
import type { RangeKey, Series } from "@/lib/metrics/types";
import type { ActivityKind, ActivityLog, ReadinessLog, WorkoutSession } from "@/types";

/** Sum of a series' values; 0 when empty. */
export function sum(series: Series): number {
  return series.points.reduce((total, p) => total + p.v, 0);
}

/** Mean of a series' values; null when empty. */
export function mean(series: Series): number | null {
  return series.points.length === 0 ? null : sum(series) / series.points.length;
}

export interface PaceOverall {
  /** Minutes per mile over every run with a distance: total minutes / total miles. */
  average: number | null;
  /**
   * The same figure for the later half of those runs minus the earlier half (an odd
   * middle run counts as later); null with fewer than two. Negative is faster.
   */
  change: number | null;
}

/**
 * Average pace for a set of runs, from the per-run distance and duration series
 * (joined on `refId`, the run's id). A mean of per-run paces would let a one-mile
 * run count as much as a ten-mile one; this is what a watch would show for the lot.
 * Runs without a distance, or with a distance of zero, are left out along with their
 * minutes.
 */
export function paceOverall(distance: Series, duration: Series): PaceOverall {
  const minutesByRun = new Map<string, number>();
  for (const p of duration.points) if (p.refId !== undefined) minutesByRun.set(p.refId, p.v);

  const runs = distance.points
    .flatMap((p) => {
      const minutes = p.refId === undefined ? undefined : minutesByRun.get(p.refId);
      return p.v > 0 && minutes !== undefined && Number.isFinite(minutes)
        ? [{ t: p.t, miles: p.v, minutes }]
        : [];
    })
    .sort((a, b) => a.t - b.t);

  const pace = (part: typeof runs): number | null => {
    const miles = part.reduce((total, r) => total + r.miles, 0);
    return miles > 0 ? part.reduce((total, r) => total + r.minutes, 0) / miles : null;
  };

  const half = Math.floor(runs.length / 2);
  const earlier = pace(runs.slice(0, half));
  const later = pace(runs.slice(half));
  return {
    average: pace(runs),
    change: earlier !== null && later !== null ? later - earlier : null,
  };
}

/** "45 min", "1 h", "1 h 35 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface ActivityTotal {
  kind: ActivityKind;
  label: string;
  sessions: number;
  minutes: number;
}

/**
 * Sessions and minutes per kind of non-running activity in the range ending at `now`,
 * most minutes first. There is no metric for these yet, so the range window is borrowed
 * from `inRange` by passing the sessions through as a series.
 */
export function activityTotals(activities: ActivityLog[], range: RangeKey, now: number): ActivityTotal[] {
  const series: Series = {
    metric: "runDuration",
    params: {},
    points: activities.map((a) => ({ t: new Date(a.date).getTime(), v: a.durationMinutes, label: a.kind })),
    unit: "min",
    better: "none",
  };
  series.points = series.points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  const totals = new Map<ActivityKind, ActivityTotal>();
  for (const p of inRange(series, range, now).points) {
    const kind = p.label as ActivityKind;
    const row = totals.get(kind) ?? { kind, label: ACTIVITY_KIND_LABELS[kind] ?? kind, sessions: 0, minutes: 0 };
    row.sessions += 1;
    row.minutes += p.v;
    totals.set(kind, row);
  }
  return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
}

export interface WeeklyBar {
  key: string;
  label: string;
  value: number;
}

/** Most bars that get a label of their own; beyond it only every few weeks is named. */
const MAX_LABELLED_BARS = 8;

/**
 * Bars for a weekly series. With many weeks, only every few bars carry a date label so
 * the labels do not run into each other.
 */
export function weeklyBars(series: Series, formatDate: (t: number) => string): WeeklyBar[] {
  const n = series.points.length;
  const every = n <= MAX_LABELLED_BARS ? 1 : Math.ceil(n / 4);
  return series.points.map((p, i) => ({
    key: String(p.t),
    label: (n - 1 - i) % every === 0 ? formatDate(p.t) : "",
    value: p.v,
  }));
}

/** Days of each kind needed before the sleep comparison is shown. */
export const MIN_DAYS_EACH = 3;
/** Difference in mean reps left below which the two kinds of day count as the same. */
const SAME_REPS_LEFT_BAND = 0.2;

export interface SleepEffortComparison {
  lowDays: number;
  otherDays: number;
  /** Mean reps left of the working sets on days with under 7 hours of sleep. */
  lowAvg: number;
  otherAvg: number;
}

/** Mean reps left of a workout's non-warm-up sets that have an answer; null when none. */
function workoutRepsInReserve(workout: WorkoutSession): number | null {
  return averageRepsInReserve(workout.sets.filter((s) => s.tier !== "warmup").map((s) => s.repsInReserve));
}

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * How sets felt after short sleep. Fewer reps left means harder, so "harder" is a LOWER
 * mean on short-sleep days by more than the band; "easier" is higher by more than it.
 */
export function sleepEffortDirection(c: SleepEffortComparison): "harder" | "easier" | "same" {
  const diff = c.lowAvg - c.otherAvg;
  if (Math.abs(diff) < SAME_REPS_LEFT_BAND) return "same";
  return diff < 0 ? "harder" : "easier";
}

/**
 * Mean reps left on workout days after under 7 hours of sleep ("<5" or "5-7")
 * against days after 7+ hours. Null unless there are at least three of each.
 */
export function sleepEffortComparison(
  workouts: WorkoutSession[],
  readiness: ReadinessLog[]
): SleepEffortComparison | null {
  const repsLeftBySession = new Map<string, number>();
  for (const w of workouts) {
    const repsLeft = workoutRepsInReserve(w);
    if (repsLeft !== null) repsLeftBySession.set(w.id, repsLeft);
  }
  const low: number[] = [];
  const other: number[] = [];
  for (const log of readiness) {
    const repsLeft = repsLeftBySession.get(log.sessionId);
    if (repsLeft === undefined) continue;
    (log.sleepHours === "7+" ? other : low).push(repsLeft);
  }
  if (low.length < MIN_DAYS_EACH || other.length < MIN_DAYS_EACH) return null;
  return { lowDays: low.length, otherDays: other.length, lowAvg: average(low), otherAvg: average(other) };
}

/** One plain sentence for the comparison. */
export function describeSleepEffort(c: SleepEffortComparison): string {
  const low = c.lowAvg.toFixed(1);
  const other = c.otherAvg.toFixed(1);
  const direction = sleepEffortDirection(c);
  if (direction === "same") {
    return `Your sets had about the same number of reps left (about ${low}) on days you slept under 7 hours as on other days.`;
  }
  const feel = direction === "harder" ? "Sets felt harder" : "Sets felt easier";
  return `${feel} on days you slept under 7 hours: about ${low} reps left, against ${other} on other days.`;
}
