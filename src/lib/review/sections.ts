// The measured parts of the weekly review, each against its comparison. Pure.
import { isNewPR } from "@/lib/e1rm";
import { averageRepsInReserve } from "@/lib/effort";
import { importedGroupSets, importedStrengthSets, importedTonnage } from "@/lib/import/evidence";
import { importedE1rmPoints, importedLiftIndex, type ImportedLiftIndex } from "@/lib/import/history";
import { computeMetric } from "@/lib/metrics";
import { toMs, workoutMs } from "@/lib/metrics/helpers";
import { SLEEP_LEVELS, STRESS_LEVELS } from "@/lib/metrics/readiness";
import type { Point } from "@/lib/metrics/types";
import { calculateGroupVolume } from "@/lib/volumeTracking";
import { excludeWarmUps } from "@/lib/workout/setSelectors";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { relatedExercises, strengthTimeline, type StrengthSet } from "@/lib/strength";
import { LIFT_NAMES, MAIN_LIFTS } from "@/lib/liftNames";
import { cutTargetBand, paceStatus } from "@/lib/rateOfLoss";
import type { ImportedSessionRecord, RepsInReserve, WorkoutSession } from "@/types";
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

/** An estimate behind a lift row: the app's, an imported session's, or a home version's. */
type RowEstimate = Point & { from?: string };

/**
 * Sessions of the week with a non-warm-up set of the lift or one of its home versions
 * (`relatedExercises`, as the lift chart pools them): the app's workouts, by the exercise
 * actually performed (a substitute at home is its home version), and the imported
 * sessions. One done only as a home version is "at home".
 */
function liftSessions(
  liftId: string,
  week: readonly WorkoutSession[],
  importedSets: readonly StrengthSet[],
  weekStart: Date
): { sessions: number; homeSessions: number; importedSessions: number } {
  const home = new Set(relatedExercises(liftId));
  let sessions = 0;
  let homeSessions = 0;
  for (const w of week) {
    const sets = excludeWarmUps(w.sets ?? []);
    const done = sets.map((s) => s.substituteExerciseId || s.exerciseId);
    const barbell = done.includes(liftId);
    // The lift's slot (whatever stood in) or a home version of it.
    if (!sets.some((s) => s.exerciseId === liftId) && !done.some((id) => home.has(id))) continue;
    sessions += 1;
    if (!barbell) homeSessions += 1;
  }
  const bySession = new Map<string, { barbell: boolean }>();
  for (const s of importedSets) {
    if (s.role === "warmup" || !inWeek(toMs(s.date), weekStart)) continue;
    if (s.exerciseId !== liftId && !home.has(s.exerciseId)) continue;
    const entry = bySession.get(s.sessionId) ?? { barbell: false };
    entry.barbell ||= s.exerciseId === liftId;
    bySession.set(s.sessionId, entry);
  }
  const importedSessions = bySession.size;
  const importedHome = [...bySession.values()].filter((e) => !e.barbell).length;
  return { sessions: sessions + importedSessions, homeSessions: homeSessions + importedHome, importedSessions };
}

/**
 * One row per main lift: the week's best estimate (the app's, an imported session's or
 * a home version's converted into the lift's pounds as the lift chart converts it,
 * `strengthTimeline`) against the best of the weeks before, the working weight and the
 * sessions, home versions included. A new best is the app's own barbell estimate,
 * judged against the app's own.
 *
 * @evidence strength-pooling
 */
export function liftReviews(source: ReviewSource, weekStart: Date, weekEnd: Date): LiftReview[] {
  const start = weekStart.getTime();
  let compareFrom = weekStart;
  for (let i = 0; i < E1RM_COMPARE_WEEKS; i++) compareFrom = previousWeek(compareFrom);
  const week = workoutsInWeek(source, weekStart);
  const index = importedIndex(source);
  const importedSets = importedStrengthSets(source.imported ?? [], source.overrides);
  const evidence = strengthEvidenceOf(source.workouts, source.imported ?? [], source.overrides);

  return MAIN_LIFTS.map((id): LiftReview => {
    const history = index.get(id) ?? [];
    const app = computeMetric("e1rm", source, { exerciseId: id }).points;
    // Home versions' sessions in the lift's pounds, as the lift chart draws them.
    const homePoints: RowEstimate[] = strengthTimeline(id, evidence, { now: weekEnd.getTime() })
      .points.filter((p) => p.sourceId !== "own" && p.sourceId !== "imported" && !p.provisional)
      .map((p) => ({ t: p.t, v: p.value, refId: p.sessionId, from: p.exerciseId, ...(p.imported ? { imported: true } : {}) }));
    // The app's estimates, the imported sessions' (marked imported) and the home versions',
    // oldest first; at the same instant the app's barbell estimate first.
    const rank = (p: RowEstimate) => (p.from ? 2 : p.imported ? 1 : 0);
    const e1rm: RowEstimate[] = [...app, ...importedE1rmPoints(history), ...homePoints].sort(
      (a, b) => a.t - b.t || rank(a) - rank(b)
    );
    const inThisWeek = e1rm.filter((p) => inWeek(p.t, weekStart));
    // Highest value; on a tie the earliest, which is when the best was first reached.
    const best = inThisWeek.reduce<RowEstimate | null>((b, p) => (!b || p.v > b.v ? p : b), null);
    const prior = e1rm.filter((p) => p.t >= compareFrom.getTime() && p.t < start).map((p) => p.v);
    const priorBest = prior.length > 0 ? Math.max(...prior) : null;
    // A new best is the app's own barbell estimate, judged against the app's own (as everywhere else).
    const own = best !== null && !best.imported && !best.from;
    const earlier = own ? app.filter((p) => p.t < best.t).map((p) => p.v) : [];
    const counts = liftSessions(id, week, importedSets, weekStart);

    const weights = computeMetric("workingWeight", source, { exerciseId: id }).points;
    const atEnd = lastBefore(weights, weekEnd.getTime());
    const atStart = lastBefore(weights, start);

    return {
      id,
      label: LIFT_NAMES[id].label,
      bestE1RM: best?.v ?? null,
      bestWorkoutId: best?.refId ?? null,
      bestImported: best?.imported === true,
      bestFrom: best?.from ?? null,
      e1rmChange: best && priorBest !== null ? best.v - priorBest : null,
      priorBest,
      // A first-ever estimate is not a best: there is nothing to beat (as the new-PR insight).
      isPR: own && earlier.length > 0 && isNewPR(best.v, earlier),
      workingWeight: atEnd?.v ?? null,
      workingWeightChange: atEnd && atStart ? atEnd.v - atStart.v : null,
      ...counts,
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

function t1RepsInReserve(workouts: WorkoutSession[]): RepsInReserve[] {
  return workouts.flatMap((w) =>
    (w.sets ?? []).flatMap((s) => (s.tier === "T1" && s.repsInReserve ? [s.repsInReserve] : []))
  );
}

export function effortReview(source: ReviewSource, weekStart: Date): EffortReview | null {
  const mine = t1RepsInReserve(workoutsInWeek(source, weekStart));
  const meanRepsInReserve = averageRepsInReserve(mine);
  if (meanRepsInReserve === null) return null;
  const before = t1RepsInReserve(workoutsInWeek(source, previousWeek(weekStart)));
  return { meanRepsInReserve, sets: mine.length, previous: averageRepsInReserve(before) };
}
