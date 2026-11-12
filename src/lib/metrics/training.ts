// Whole-programme training metrics: per-week sets, sessions and tonnage. Pure.
import { MUSCLE_GROUPS, type DisplayGroup } from "@/lib/muscles";
import { calculateGroupVolume } from "@/lib/volumeTracking";
import { excludeWarmUps } from "@/lib/workout/setSelectors";
import {
  count,
  defineMetric,
  formatNumber,
  formatWhole,
  setsVolume,
  workoutsByWeek,
} from "./helpers";

/**
 * Per calendar week, the direct hard sets for the display group `params.muscleGroup`
 * (a key of `calculateGroupVolume`: "Chest", "Back", "Quads", ...). Direct sets are
 * the count the weekly volume bars show; indirect sets are reported in the label.
 */
export const weeklySets = defineMetric(
  {
    id: "weeklySets",
    label: "Weekly sets",
    unit: "sets",
    better: "none",
    scope: "muscle",
    format: (v) => formatNumber(v),
  },
  (source, params) => {
    const group = params.muscleGroup;
    if (!group || !Object.prototype.hasOwnProperty.call(MUSCLE_GROUPS, group)) return [];
    return workoutsByWeek(source.workouts).map(({ weekStart, workouts }) => {
      const volume = calculateGroupVolume(workouts.flatMap((w) => w.sets ?? []))[
        group as DisplayGroup
      ];
      const direct = volume?.directSets ?? 0;
      const indirect = volume?.indirectSets ?? 0;
      return { t: weekStart, v: direct, label: `${direct} direct, ${indirect} indirect` };
    });
  }
);

/** Completed workouts per calendar week. */
export const sessionsPerWeek = defineMetric(
  {
    id: "sessionsPerWeek",
    label: "Sessions per week",
    unit: "sessions",
    better: "up",
    scope: "global",
    format: (v) => formatNumber(v),
  },
  (source) =>
    workoutsByWeek(source.workouts).map(({ weekStart, workouts }) => ({
      t: weekStart,
      v: workouts.length,
    }))
);

/** Per calendar week, weight x reps summed over every non-warm-up set. */
export const tonnage = defineMetric(
  {
    id: "tonnage",
    label: "Weekly tonnage",
    unit: "lbs",
    better: "up",
    scope: "global",
    format: formatWhole,
  },
  (source) =>
    workoutsByWeek(source.workouts).map(({ weekStart, workouts }) => ({
      t: weekStart,
      v: setsVolume(excludeWarmUps(workouts.flatMap((w) => w.sets ?? []))),
      label: count(workouts.length, "session"),
    }))
);
