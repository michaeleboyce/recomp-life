// The measured parts of the weekly review, each against its comparison. Pure.
import { isNewPR } from "@/lib/e1rm";
import { computeMetric } from "@/lib/metrics";
import { toMs, workoutMs } from "@/lib/metrics/helpers";
import { SLEEP_LEVELS, STRESS_LEVELS } from "@/lib/metrics/readiness";
import type { Point } from "@/lib/metrics/types";
import { calculateGroupVolume } from "@/lib/volumeTracking";
import { excludeWarmUps } from "@/lib/workout/setSelectors";
import { LIFT_NAMES, MAIN_LIFTS } from "@/components/Progress/lifts";
import { cutTargetBand, paceStatus } from "@/components/Progress/body/bodyMath";
import type { WorkoutSession } from "@/types";
import { inWeek, previousWeek, weekOf } from "./weeks";
import type {
  BodyweightReview,
  CardioReview,
  CardioTotals,
  EffortReview,
  LiftReview,
  MuscleVolume,
  ReadinessReview,
  ReviewSource,
  VolumeReview,
} from "./types";

/** Weeks before the reviewed one that a lift's best is compared against. */
export const E1RM_COMPARE_WEEKS = 4;

const lastBefore = (points: Point[], t: number): Point | undefined =>
  points.filter((p) => p.t < t).at(-1);

export function workoutsInWeek(source: ReviewSource, weekStart: Date): WorkoutSession[] {
  return source.workouts.filter((w) => inWeek(workoutMs(w), weekStart));
}

/** The value of a one-point-per-week metric for the week starting `weekStart`, else 0. */
export function weeklyValue(points: Point[], weekStart: Date): number {
  return points.find((p) => p.t === weekOf(weekStart).getTime())?.v ?? 0;
}

export function liftReviews(source: ReviewSource, weekStart: Date, weekEnd: Date): LiftReview[] {
  const start = weekStart.getTime();
  let compareFrom = weekStart;
  for (let i = 0; i < E1RM_COMPARE_WEEKS; i++) compareFrom = previousWeek(compareFrom);
  const week = workoutsInWeek(source, weekStart);

  return MAIN_LIFTS.map((id): LiftReview => {
    const e1rm = computeMetric("e1rm", source, { exerciseId: id }).points;
    const inThisWeek = e1rm.filter((p) => inWeek(p.t, weekStart));
    // Highest value; on a tie the earliest, which is when the best was first reached.
    const best = inThisWeek.reduce<Point | null>((b, p) => (!b || p.v > b.v ? p : b), null);
    const prior = e1rm.filter((p) => p.t >= compareFrom.getTime() && p.t < start).map((p) => p.v);
    const priorBest = prior.length > 0 ? Math.max(...prior) : null;
    const earlier = best ? e1rm.filter((p) => p.t < best.t).map((p) => p.v) : [];

    const weights = computeMetric("workingWeight", source, { exerciseId: id }).points;
    const atEnd = lastBefore(weights, weekEnd.getTime());
    const atStart = lastBefore(weights, start);

    return {
      id,
      label: LIFT_NAMES[id].label,
      bestE1RM: best?.v ?? null,
      bestWorkoutId: best?.refId ?? null,
      e1rmChange: best && priorBest !== null ? best.v - priorBest : null,
      priorBest,
      // A first-ever estimate is not a best: there is nothing to beat (as the new-PR insight).
      isPR: best !== null && earlier.length > 0 && isNewPR(best.v, earlier),
      workingWeight: atEnd?.v ?? null,
      workingWeightChange: atEnd && atStart ? atEnd.v - atStart.v : null,
      sessions: week.filter((w) => excludeWarmUps(w.sets ?? []).some((s) => s.exerciseId === id))
        .length,
    };
  });
}

export function bodyweightReview(
  source: ReviewSource,
  weekStart: Date,
  weekEnd: Date
): BodyweightReview | null {
  const weighIns = computeMetric("bodyweight", source).points.filter((p) => inWeek(p.t, weekStart));
  if (weighIns.length < 2) return null;
  const avg7 = computeMetric("bodyweight7d", source).points;
  const average = lastBefore(avg7, weekEnd.getTime())!.v;
  const before = lastBefore(avg7, weekStart.getTime());
  const rate = computeMetric("lossRate", source).points.filter((p) => inWeek(p.t, weekStart)).at(-1);
  const cutting = source.settings?.trainingPhase?.mode === "cutting";
  const upToEnd = source.bodyweight
    .map((b) => ({ date: new Date(b.date), weight: b.weight }))
    .filter((b) => b.date.getTime() < weekEnd.getTime() && Number.isFinite(b.weight));
  return {
    average,
    change: before ? average - before.v : null,
    weeklyRate: rate?.v ?? null,
    pace: cutting && rate ? paceStatus(upToEnd) : null,
    targetBand: cutting ? cutTargetBand(average) : null,
    weighIns: weighIns.length,
    cutting,
  };
}

function groupSets(workouts: WorkoutSession[]): Map<string, number> {
  const volume = calculateGroupVolume(workouts.flatMap((w) => w.sets ?? []));
  const out = new Map<string, number>();
  for (const [group, v] of Object.entries(volume)) if (v && v.directSets > 0) out.set(group, v.directSets);
  return out;
}

export function volumeReview(source: ReviewSource, weekStart: Date): VolumeReview {
  const prev = previousWeek(weekStart);
  const now = groupSets(workoutsInWeek(source, weekStart));
  const before = groupSets(workoutsInWeek(source, prev));
  const groups: MuscleVolume[] = [...new Set([...now.keys(), ...before.keys()])]
    .map((group) => ({ group, sets: now.get(group) ?? 0, previous: before.get(group) ?? 0 }))
    .sort((a, b) => b.sets - a.sets || b.previous - a.previous || a.group.localeCompare(b.group));
  const tonnage = computeMetric("tonnage", source).points;
  return { groups, tonnage: weeklyValue(tonnage, weekStart), previousTonnage: weeklyValue(tonnage, prev) };
}

function totals(
  rows: ReadonlyArray<{ date: Date | string; distanceMiles: number | null; durationMinutes: number }>,
  weekStart: Date
): CardioTotals {
  const mine = rows.filter((r) => inWeek(toMs(r.date), weekStart));
  return {
    count: mine.length,
    miles: mine.reduce((sum, r) => sum + (r.distanceMiles ?? 0), 0),
    minutes: mine.reduce((sum, r) => sum + (Number.isFinite(r.durationMinutes) ? r.durationMinutes : 0), 0),
  };
}

export function cardioReview(source: ReviewSource, weekStart: Date): CardioReview | null {
  const prev = previousWeek(weekStart);
  const activities = source.activities ?? [];
  const review = {
    runs: totals(source.runs, weekStart),
    activities: totals(activities, weekStart),
    previousRuns: totals(source.runs, prev),
    previousActivities: totals(activities, prev),
  };
  const any =
    review.runs.count + review.activities.count + review.previousRuns.count + review.previousActivities.count;
  return any > 0 ? review : null;
}

/** Null when there are no check-ins at all; otherwise this week's counts (possibly zero). */
export function readinessReview(source: ReviewSource, weekStart: Date): ReadinessReview | null {
  if (source.readiness.length === 0) return null;
  const mine = source.readiness.filter((r) => inWeek(toMs(r.date), weekStart));
  return {
    checkIns: mine.length,
    lowSleep: mine.filter((r) => SLEEP_LEVELS[r.sleepHours] === 1).length,
    lowEnergy: mine.filter((r) => STRESS_LEVELS[r.stressLevel] === 1).length,
  };
}

function t1Rpes(workouts: WorkoutSession[]): number[] {
  return workouts.flatMap((w) =>
    (w.sets ?? []).flatMap((s) =>
      s.tier === "T1" && typeof s.rpe === "number" && Number.isFinite(s.rpe) ? [s.rpe] : []
    )
  );
}

const meanOf = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function effortReview(source: ReviewSource, weekStart: Date): EffortReview | null {
  const mine = t1Rpes(workoutsInWeek(source, weekStart));
  if (mine.length === 0) return null;
  const before = t1Rpes(workoutsInWeek(source, previousWeek(weekStart)));
  return { meanRpe: meanOf(mine), sets: mine.length, previous: before.length > 0 ? meanOf(before) : null };
}
