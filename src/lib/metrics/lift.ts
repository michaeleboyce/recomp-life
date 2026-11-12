// Per-lift metrics (params.exerciseId). Pure.
import { excludeWarmUps, workingSetsFor } from "@/lib/workout/setSelectors";
import type { SetLog } from "@/types";
import {
  count,
  defineMetric,
  formatNumber,
  formatWhole,
  mean,
  setsVolume,
  sortedWorkouts,
  toMs,
  workoutMs,
} from "./helpers";
import type { MetricParams, MetricSource, Point } from "./types";

type LiftPoint = Omit<Point, "t" | "refId"> | null;

/** One point per workout for which `pick` returns a value; refId is the workout. */
function perWorkout(
  source: MetricSource,
  params: MetricParams,
  pick: (sets: SetLog[], exerciseId: string) => LiftPoint
): Point[] {
  const exerciseId = params.exerciseId;
  if (!exerciseId) return [];
  const points: Point[] = [];
  for (const workout of sortedWorkouts(source.workouts)) {
    const picked = pick(workout.sets ?? [], exerciseId);
    if (picked) points.push({ t: workoutMs(workout), refId: workout.id, ...picked });
  }
  return points;
}

/**
 * The weight a set stands for on the lift's own scale: a substituted set's
 * `originalWeight` (the barbell weight it replaced) when recorded, else its weight.
 * `originalWeight` on a set that was not substituted is a pre-reduction weight and
 * is not used.
 */
function plottedWeight(set: SetLog): number {
  return set.isSubstituted && set.originalWeight != null ? set.originalWeight : set.weight;
}

/** The lift's non-warm-up sets in a workout, in any tier. */
function liftSets(sets: SetLog[], exerciseId: string): SetLog[] {
  return excludeWarmUps(sets).filter((s) => s.exerciseId === exerciseId);
}

/** One point per stored e1RM row for the exercise. */
export const e1rm = defineMetric(
  {
    id: "e1rm",
    label: "Estimated 1RM",
    unit: "lbs",
    better: "up",
    scope: "lift",
    format: (v) => formatNumber(v, 0),
  },
  (source, params) =>
    params.exerciseId
      ? source.e1rms
          .filter((row) => row.exerciseId === params.exerciseId)
          .map((row) => ({
            t: toMs(row.date),
            v: row.estimated1RM,
            label: `${formatNumber(row.workingWeight)} x ${row.repsCompleted}`,
            refId: row.workoutSessionId,
          }))
      : []
);

/**
 * Per workout in which the lift was trained as T1, the heaviest weight among those
 * sets. Days it was trained light (T2) or not at all are skipped.
 */
export const workingWeight = defineMetric(
  {
    id: "workingWeight",
    label: "Working weight",
    unit: "lbs",
    better: "up",
    scope: "lift",
    format: (v) => formatNumber(v),
  },
  (source, params) =>
    perWorkout(source, params, (sets, exerciseId) => {
      // T1 days only: each lift is also trained light as a T2 on another day, and
      // mixing the two would zigzag and report the light day as the latest weight.
      const working = workingSetsFor(sets, exerciseId, "T1");
      if (working.length === 0) return null;
      return {
        v: Math.max(...working.map(plottedWeight)),
        label: `T1 ${working.length} x ${working[0].targetReps}`,
      };
    })
);

/** Reps of the T1 AMRAP set per workout. */
export const amrapReps = defineMetric(
  {
    id: "amrapReps",
    label: "AMRAP reps",
    unit: "reps",
    better: "up",
    scope: "lift",
    format: (v) => formatNumber(v),
  },
  (source, params) =>
    perWorkout(source, params, (sets, exerciseId) => {
      const amrap = workingSetsFor(sets, exerciseId, "T1").find((s) => s.isAMRAP);
      if (!amrap) return null;
      return {
        v: amrap.actualReps,
        label: `${formatNumber(plottedWeight(amrap))} x ${amrap.actualReps}`,
      };
    })
);

/** Mean RPE of the lift's non-warm-up sets per workout; workouts with no RPE are skipped. */
export const avgRpe = defineMetric(
  {
    id: "avgRpe",
    label: "Average RPE",
    unit: "rpe",
    better: "none",
    scope: "lift",
    format: (v) => v.toFixed(1),
  },
  (source, params) =>
    perWorkout(source, params, (sets, exerciseId) => {
      const rpes = liftSets(sets, exerciseId).flatMap((s) =>
        typeof s.rpe === "number" && Number.isFinite(s.rpe) ? [s.rpe] : []
      );
      if (rpes.length === 0) return null;
      return { v: mean(rpes), label: count(rpes.length, "set") };
    })
);

/** Per workout, weight x reps summed over the lift's non-warm-up sets (as lifted). */
export const liftVolume = defineMetric(
  {
    id: "liftVolume",
    label: "Volume",
    unit: "lbs",
    better: "up",
    scope: "lift",
    format: formatWhole,
  },
  (source, params) =>
    perWorkout(source, params, (sets, exerciseId) => {
      const mine = liftSets(sets, exerciseId);
      if (mine.length === 0) return null;
      return { v: setsVolume(mine), label: count(mine.length, "set") };
    })
);
