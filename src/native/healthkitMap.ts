// Translates what the @capgo/capacitor-health plugin returns into the app's
// plugin-neutral health shapes (src/lib/health/types). Pure: the plugin's types
// are imported as types only, so this file runs anywhere and is fully tested.
import type { AggregatedSample, HealthSample, Workout } from "@capgo/capacitor-health";
import { localDateKey } from "@/lib/health/daily";
import type {
  HealthQuantity,
  HealthQuantitySample,
  HealthSleepSample,
  HealthWeight,
  HealthWorkout,
  HealthWorkoutType,
  SleepStage,
} from "@/lib/health/types";

const WORKOUT_TYPES: Record<string, HealthWorkoutType> = {
  running: "running",
  runningTreadmill: "running",
  cycling: "cycling",
  bikingStationary: "cycling",
  handCycling: "cycling",
  hiking: "hiking",
  walking: "walking",
  yoga: "yoga",
  traditionalStrengthTraining: "strength",
  functionalStrengthTraining: "strength",
  strengthTraining: "strength",
  weightlifting: "strength",
};

/** Workout types that are indoors by definition. */
const INDOOR_TYPES = new Set(["runningTreadmill", "bikingStationary"]);

/** HealthKit's metadata key for "this workout was indoors". */
const INDOOR_KEY = "HKIndoorWorkout";

function indoorFlag(workout: Workout): boolean | null {
  if (INDOOR_TYPES.has(workout.workoutType)) return true;
  const raw = workout.metadata?.[INDOOR_KEY];
  if (raw === undefined) return null;
  return raw === "1" || raw.toLowerCase() === "true";
}

export interface HeartRateStats {
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

/** Average and peak of heart-rate readings, in whole beats per minute. */
export function heartRateStats(beatsPerMinute: readonly number[]): HeartRateStats {
  const values = beatsPerMinute.filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) return { avgHeartRate: null, maxHeartRate: null };
  return {
    avgHeartRate: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    maxHeartRate: Math.round(Math.max(...values)),
  };
}

/**
 * A plugin workout as a HealthWorkout, or null when it has no identifier
 * (without one a second import could not recognise it).
 */
export function toHealthWorkout(
  workout: Workout,
  heartRate: HeartRateStats = { avgHeartRate: null, maxHeartRate: null }
): HealthWorkout | null {
  if (!workout.platformId) return null;
  const start = new Date(workout.startDate);
  const end = new Date(workout.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    uuid: workout.platformId,
    sourceName: workout.sourceName ?? null,
    type: WORKOUT_TYPES[workout.workoutType] ?? "other",
    rawType: workout.workoutType,
    start,
    end,
    durationSeconds: workout.duration,
    distanceMetres: workout.totalDistance ?? null,
    indoor: indoorFlag(workout),
    activeEnergyKcal:
      workout.totalEnergyBurned !== undefined ? Math.round(workout.totalEnergyBurned) : null,
    ...heartRate,
  };
}

/** Weight samples (kilograms) as HealthWeight; samples without an id are dropped. */
export function toHealthWeights(samples: readonly HealthSample[]): HealthWeight[] {
  return samples.flatMap((sample) => {
    const date = new Date(sample.startDate);
    if (!sample.platformId || Number.isNaN(date.getTime()) || !(sample.value > 0)) return [];
    return [
      {
        uuid: sample.platformId,
        sourceName: sample.sourceName ?? null,
        date,
        kilograms: sample.value,
      },
    ];
  });
}

/** The plugin calls Apple's "core" sleep "light". */
const SLEEP_STAGES: Record<string, SleepStage> = {
  inBed: "inBed",
  awake: "awake",
  asleep: "asleep",
  light: "core",
  deep: "deep",
  rem: "rem",
};

/**
 * Sleep samples as one entry per stage. A sample that carries a list of stages
 * is split into them; one that only has a state is passed through.
 */
export function toSleepSamples(samples: readonly HealthSample[]): HealthSleepSample[] {
  return samples.flatMap((sample, index) => {
    const uuid = sample.platformId ?? `sleep-${sample.startDate}-${index}`;
    const sourceName = sample.sourceName ?? null;
    const parts =
      sample.stages && sample.stages.length > 0
        ? sample.stages.map((s) => ({ start: s.startDate, end: s.endDate, stage: s.stage }))
        : [{ start: sample.startDate, end: sample.endDate, stage: sample.sleepState ?? "asleep" }];
    return parts.flatMap((part, i) => {
      const stage = SLEEP_STAGES[part.stage];
      const start = new Date(part.start);
      const end = new Date(part.end);
      if (!stage || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
      return [{ uuid: `${uuid}:${i}`, sourceName, stage, start, end }];
    });
  });
}

/** Daily totals or averages from the plugin, as one value per local day. Zeroes mean "no data". */
export function dailyFromBuckets(
  quantity: HealthQuantity,
  buckets: readonly AggregatedSample[]
): HealthQuantitySample[] {
  return buckets.flatMap((bucket) => {
    const start = new Date(bucket.startDate);
    if (Number.isNaN(start.getTime()) || !(bucket.value > 0)) return [];
    return [{ quantity, day: localDateKey(start), value: Math.round(bucket.value * 10) / 10 }];
  });
}

/**
 * Individual readings reduced to one value per local day: the day's average
 * (heart-rate variability) or its latest reading (VO2 max, body fat).
 */
export function dailyFromSamples(
  quantity: HealthQuantity,
  samples: readonly HealthSample[],
  reduce: "average" | "latest"
): HealthQuantitySample[] {
  const byDay = new Map<string, { t: number; v: number }[]>();
  for (const sample of samples) {
    const t = new Date(sample.startDate).getTime();
    if (Number.isNaN(t) || !Number.isFinite(sample.value)) continue;
    const day = localDateKey(new Date(t));
    byDay.set(day, [...(byDay.get(day) ?? []), { t, v: sample.value }]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, readings]) => {
      const value =
        reduce === "average"
          ? readings.reduce((sum, r) => sum + r.v, 0) / readings.length
          : readings.reduce((latest, r) => (r.t >= latest.t ? r : latest)).v;
      return { quantity, day, value: Math.round(value * 10) / 10 };
    });
}
