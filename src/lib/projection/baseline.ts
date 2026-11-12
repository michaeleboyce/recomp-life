// What the lifter is actually doing for one lift, measured from their records. Pure.
import { EXERCISES } from "@/lib/exercises";
import type { MetricSource } from "@/lib/metrics/types";
import { calculateMuscleLoad } from "@/lib/muscleLoad";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type { MuscleId, SetLog, SetStatus, TrainingPhase } from "@/types";
import { MS_PER_WEEK } from "./trend";

/** What the lifter is actually doing for one lift, measured from their records. */
export interface ProjectionBaseline {
  exerciseId: string;
  /** Sessions per week in which the lift was trained as T1 or T2, over the window. */
  sessionsPerWeek: number;
  /** Mean weekly working sets of the lift itself (T1 + T2, warm-ups excluded). */
  directWeeklySets: number;
  /**
   * Mean weekly sets from OTHER exercises, credited to the lift's primary muscles
   * with the app's own weighting (a set counts 1 when it trains one of them as a
   * primary muscle, 0.5 when only as a secondary one).
   */
  relatedWeeklySets: number;
  /**
   * Weekly fractional sets, from all exercises, for each of the lift's primary and
   * then secondary muscles: where the work comes from.
   */
  byMuscle: Array<{ muscle: string; weeklySets: number }>;
  /** Share of T1 sessions for this lift that were passed, 0..1. */
  passRate: number;
  phase: TrainingPhase["mode"];
  /** Weeks of data the measurement used. */
  windowWeeks: number;
}

/** The baseline looks back at most this many weeks. */
export const BASELINE_MAX_WEEKS = 8;

/** Rates are never divided by less than this, so a first week does not look like a habit. */
export const BASELINE_MIN_WEEKS = 1;

export const DEFAULT_PHASE: TrainingPhase["mode"] = "maintaining";

/**
 * Statuses that freeze progression (see `progression.ts`): a session carrying one is
 * neither a pass nor a failure, so it is left out of the pass rate.
 */
const FREEZE_STATUSES: ReadonlySet<SetStatus> = new Set([
  "skipped_pain",
  "reduced_run_fatigue",
  "reduced_equipment",
]);

/** The exercise a set was actually performed with (the substitute, when there is one). */
function performedExerciseId(set: SetLog): string {
  return set.substituteExerciseId || set.exerciseId;
}

/**
 * What one set of another exercise is worth to the lift's primary muscles: the
 * highest credit `calculateMuscleLoad` gives any of them (1 as a primary muscle, 0.5
 * as a secondary one, 0 otherwise; warm-ups and pain skips earn nothing). A set is
 * credited once, at its highest level, as `calculateGroupVolume` does for a group.
 */
function relatedCredit(set: SetLog, primaryMuscles: readonly MuscleId[]): number {
  const load = calculateMuscleLoad([set]);
  return Math.max(0, ...primaryMuscles.map((muscle) => load[muscle] ?? 0));
}

function isT1Pass(t1Sets: SetLog[]): boolean {
  return t1Sets.every((set) => set.status !== "failed" && set.actualReps >= set.targetReps);
}

/**
 * Measures the lift's current reality from completed workouts.
 *
 * Choices:
 * - Window: workouts started in the `BASELINE_MAX_WEEKS` weeks up to `now`. When the
 *   whole history (any exercise) is shorter than that, `windowWeeks` is the time
 *   from the first workout to `now`, as a fraction, but never under
 *   `BASELINE_MIN_WEEKS`. With no workouts in the window `windowWeeks` is 0 and
 *   the rates are 0. Workouts dated after `now` or not completed are ignored.
 * - `sessionsPerWeek`: workouts with at least one T1 or T2 set of this exercise
 *   (matched on the template `exerciseId`, like `workingSetsFor`) that was not
 *   skipped for pain, divided by `windowWeeks`.
 * - `directWeeklySets`: T1 and T2 sets performed with this exercise (not a
 *   substitute) and not skipped for pain, divided by `windowWeeks`. Failed sets
 *   count: they were hard sets.
 * - `relatedWeeklySets`: every set performed with a different exercise (including a
 *   substitute done in this lift's slot), credited to this lift's primary muscles
 *   by `relatedCredit` and divided by `windowWeeks`. The weighting is the app's
 *   own (`calculateMuscleLoad`: primary 1, secondary 0.5, stabiliser 0).
 * - `byMuscle`: `calculateMuscleLoad` over every set in the window, per week, for
 *   the lift's primary muscles then its secondary ones. Empty for an unknown
 *   exercise.
 * - `passRate`: of the sessions with T1 sets of this lift (`workingSetsFor`), the
 *   share in which every set reached its target reps and none was marked failed.
 *   Sessions with no T1 sets of the lift are not counted, nor are sessions where a
 *   T1 set carries a freeze status (pain skip, run-fatigue or equipment reduction),
 *   which the program treats as neither pass nor failure. With no counted T1
 *   session the rate is 1.
 * - `phase`: `settings.trainingPhase.mode`, or "maintaining" without settings.
 */
export function measureBaseline(
  source: MetricSource,
  exerciseId: string,
  now: Date
): ProjectionBaseline {
  const nowMs = now.getTime();
  const exercise = EXERCISES[exerciseId];
  const primaryMuscles: readonly MuscleId[] = exercise?.primaryMuscles ?? [];
  const byMuscle: MuscleId[] = exercise
    ? [...exercise.primaryMuscles, ...exercise.secondaryMuscles]
    : [];
  const phase = source.settings?.trainingPhase?.mode ?? DEFAULT_PHASE;

  const dated = source.workouts
    .filter((w) => w.completedAt)
    .map((w) => ({ workout: w, t: new Date(w.startedAt).getTime() }))
    .filter(({ t }) => Number.isFinite(t) && t <= nowMs);

  const windowStart = nowMs - BASELINE_MAX_WEEKS * MS_PER_WEEK;
  const inWindow = dated.filter(({ t }) => t >= windowStart).map(({ workout }) => workout);

  if (inWindow.length === 0) {
    return {
      exerciseId,
      sessionsPerWeek: 0,
      directWeeklySets: 0,
      relatedWeeklySets: 0,
      byMuscle: byMuscle.map((muscle) => ({ muscle, weeklySets: 0 })),
      passRate: 1,
      phase,
      windowWeeks: 0,
    };
  }

  const firstEver = Math.min(...dated.map(({ t }) => t));
  const windowWeeks = Math.min(
    BASELINE_MAX_WEEKS,
    Math.max(BASELINE_MIN_WEEKS, (nowMs - firstEver) / MS_PER_WEEK)
  );

  let sessions = 0;
  let t1Sessions = 0;
  let t1Passes = 0;
  for (const workout of inWindow) {
    const t1 = workingSetsFor(workout.sets, exerciseId, "T1");
    const t2 = workingSetsFor(workout.sets, exerciseId, "T2");
    if ([...t1, ...t2].some((set) => set.status !== "skipped_pain")) sessions += 1;

    if (t1.length > 0 && !t1.some((set) => FREEZE_STATUSES.has(set.status))) {
      t1Sessions += 1;
      if (isT1Pass(t1)) t1Passes += 1;
    }
  }

  const allSets = inWindow.flatMap((w) => w.sets);
  let directSets = 0;
  let relatedSets = 0;
  for (const set of allSets) {
    if (performedExerciseId(set) === exerciseId) {
      const isWorkingTier = set.tier === "T1" || set.tier === "T2";
      if (isWorkingTier && set.status !== "skipped_pain") directSets += 1;
    } else {
      relatedSets += relatedCredit(set, primaryMuscles);
    }
  }
  const load = calculateMuscleLoad(allSets);

  return {
    exerciseId,
    sessionsPerWeek: sessions / windowWeeks,
    directWeeklySets: directSets / windowWeeks,
    relatedWeeklySets: relatedSets / windowWeeks,
    byMuscle: byMuscle.map((muscle) => ({
      muscle,
      weeklySets: (load[muscle] ?? 0) / windowWeeks,
    })),
    passRate: t1Sessions > 0 ? t1Passes / t1Sessions : 1,
    phase,
    windowWeeks,
  };
}
