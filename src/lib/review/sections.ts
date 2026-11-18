// The measured parts of the weekly review, each against its comparison. Pure.
import { isNewPR } from "@/lib/e1rm";
import { importedGroupSets, importedStrengthSets, importedTonnage } from "@/lib/import/evidence";
import { importedE1rmPoints, importedLiftIndex, type ImportedLiftIndex } from "@/lib/import/history";
import { computeMetric } from "@/lib/metrics";
import { toMs, workoutMs } from "@/lib/metrics/helpers";
import { SLEEP_LEVELS, STRESS_LEVELS } from "@/lib/metrics/readiness";
import type { Point } from "@/lib/metrics/types";
import { calculateGroupVolume } from "@/lib/volumeTracking";
import { excludeWarmUps } from "@/lib/workout/setSelectors";
import { LIFT_NAMES, MAIN_LIFTS } from "@/lib/liftNames";
import { cutTargetBand, paceStatus } from "@/lib/rateOfLoss";
import type { ImportedSessionRecord, WorkoutSession } from "@/types";
import { inWeek, nextWeek, previousWeek, weekOf } from "./weeks";
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

/** The live imported sessions started in the week starting `weekStart`. */
export function importedInWeek(source: ReviewSource, weekStart: Date): ImportedSessionRecord[] {
  return (source.imported ?? []).filter((s) => s.deletedAt == null && inWeek(toMs(s.startedAt), weekStart));
}

/** The imported sessions as lift history (estimates and set counts per exercise). */
function importedIndex(source: ReviewSource): ImportedLiftIndex {
  return importedLiftIndex(importedStrengthSets(source.imported ?? [], source.overrides));
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
  const index = importedIndex(source);

  return MAIN_LIFTS.map((id): LiftReview => {
    const history = index.get(id) ?? [];
    const app = computeMetric("e1rm", source, { exerciseId: id }).points;
    // The app's estimates and the imported sessions' (marked imported), oldest first; at
    // the same instant the app's first.
    const e1rm = [...app, ...importedE1rmPoints(history)].sort(
      (a, b) => a.t - b.t || Number(a.imported === true) - Number(b.imported === true)
    );
    const inThisWeek = e1rm.filter((p) => inWeek(p.t, weekStart));
    // Highest value; on a tie the earliest, which is when the best was first reached.
    const best = inThisWeek.reduce<Point | null>((b, p) => (!b || p.v > b.v ? p : b), null);
    const prior = e1rm.filter((p) => p.t >= compareFrom.getTime() && p.t < start).map((p) => p.v);
    const priorBest = prior.length > 0 ? Math.max(...prior) : null;
    // A new best is the app's own, judged against the app's own (as everywhere else).
    const earlier = best && !best.imported ? app.filter((p) => p.t < best.t).map((p) => p.v) : [];
    const importedSessions = history.filter((h) => h.sets > 0 && inWeek(h.t, weekStart)).length;

    const weights = computeMetric("workingWeight", source, { exerciseId: id }).points;
    const atEnd = lastBefore(weights, weekEnd.getTime());
    const atStart = lastBefore(weights, start);

    return {
      id,
      label: LIFT_NAMES[id].label,
      bestE1RM: best?.v ?? null,
      bestWorkoutId: best?.refId ?? null,
      bestImported: best?.imported === true,
      e1rmChange: best && priorBest !== null ? best.v - priorBest : null,
      priorBest,
      // A first-ever estimate is not a best: there is nothing to beat (as the new-PR insight).
      isPR: best !== null && earlier.length > 0 && isNewPR(best.v, earlier),
      workingWeight: atEnd?.v ?? null,
      workingWeightChange: atEnd && atStart ? atEnd.v - atStart.v : null,
      sessions:
        week.filter((w) => excludeWarmUps(w.sets ?? []).some((s) => s.exerciseId === id)).length +
        importedSessions,
      importedSessions,
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

/** Direct sets per display group: the app's workouts of the week plus its imported sessions. */
function groupSets(source: ReviewSource, weekStart: Date): Map<string, number> {
  const volume = calculateGroupVolume(workoutsInWeek(source, weekStart).flatMap((w) => w.sets ?? []));
  const out = new Map<string, number>();
  for (const [group, v] of Object.entries(volume)) if (v && v.directSets > 0) out.set(group, v.directSets);
  const imported = importedGroupSets(source.imported ?? [], weekStart, nextWeek(weekStart), source.overrides);
  for (const [group, sets] of Object.entries(imported)) {
    if (sets && sets > 0) out.set(group, (out.get(group) ?? 0) + sets);
  }
  return out;
}

const tonnageOfImported = (source: ReviewSource, weekStart: Date) =>
  importedTonnage(source.imported ?? [], weekStart, nextWeek(weekStart));

export function volumeReview(source: ReviewSource, weekStart: Date): VolumeReview {
  const prev = previousWeek(weekStart);
  const now = groupSets(source, weekStart);
  const before = groupSets(source, prev);
  const groups: MuscleVolume[] = [...new Set([...now.keys(), ...before.keys()])]
    .map((group) => ({ group, sets: now.get(group) ?? 0, previous: before.get(group) ?? 0 }))
    .sort((a, b) => b.sets - a.sets || b.previous - a.previous || a.group.localeCompare(b.group));
  const tonnage = computeMetric("tonnage", source).points;
  return {
    groups,
    tonnage: weeklyValue(tonnage, weekStart) + tonnageOfImported(source, weekStart),
    previousTonnage: weeklyValue(tonnage, prev) + tonnageOfImported(source, prev),
    importedSessions: importedInWeek(source, weekStart).length,
  };
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
