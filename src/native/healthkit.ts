// Apple Health through the @capgo/capacitor-health plugin. This is the only file
// that loads the plugin, and it does so on demand, so the web build never runs
// plugin code. All translation lives in ./healthkitMap.
//
// Not covered by the plugin, and therefore not imported yet: dietary protein
// and lean body mass. Not yet confirmed on a phone: that every workout carries
// an identifier, and the scale of body-fat values (percent or fraction).
import type { HealthDataType } from "@capgo/capacitor-health";
import type {
  HealthCategory,
  HealthQuantity,
  HealthQuantitySample,
  HealthRange,
  HealthSource,
  HealthWorkout,
} from "@/lib/health/types";
import {
  dailyFromBuckets,
  dailyFromSamples,
  heartRateStats,
  toHealthWeights,
  toHealthWorkout,
  toSleepSamples,
} from "./healthkitMap";
import { isNativeApp } from "./platform";

/** What each category needs permission to read. */
const READ_TYPES: Record<HealthCategory, HealthDataType[]> = {
  bodyweight: ["weight"],
  sleep: ["sleep"],
  workouts: ["workouts", "heartRate"],
  daily: [
    "steps",
    "restingHeartRate",
    "heartRateVariability",
    "calories",
    "exerciseTime",
    "vo2Max",
    "bodyFat",
    "dietaryEnergyConsumed",
  ],
};

/** Daily values the plugin can total or average per day itself. */
const BUCKETED: [HealthQuantity, HealthDataType, "sum" | "average"][] = [
  ["steps", "steps", "sum"],
  ["activeEnergyKcal", "calories", "sum"],
  ["exerciseMinutes", "exerciseTime", "sum"],
  ["dietaryKcal", "dietaryEnergyConsumed", "sum"],
  ["restingHr", "restingHeartRate", "average"],
];

/** Daily values the plugin only returns as individual readings. */
const SAMPLED: [HealthQuantity, HealthDataType, "average" | "latest"][] = [
  ["hrvMs", "heartRateVariability", "average"],
  ["vo2Max", "vo2Max", "latest"],
  ["bodyFatPct", "bodyFat", "latest"],
];

const WORKOUT_PAGE = 100;
const SAMPLE_LIMIT = 5000;

async function plugin() {
  const { Health } = await import("@capgo/capacitor-health");
  return Health;
}

const dates = (range: HealthRange) => ({
  startDate: range.since.toISOString(),
  endDate: range.until.toISOString(),
});

/** The Apple Health source for the iPhone app. Reports "unavailable" anywhere else. */
export function createHealthKitSource(): HealthSource {
  return {
    async isAvailable() {
      if (!isNativeApp()) {
        return { available: false, reason: "Apple Health is only available in the iPhone app." };
      }
      const result = await (await plugin()).isAvailable();
      return result.available
        ? { available: true }
        : { available: false, reason: result.reason ?? "Apple Health is not available on this device." };
    },

    async requestAccess(categories) {
      const read = [...new Set(categories.flatMap((category) => READ_TYPES[category]))];
      await (await plugin()).requestAuthorization({ read, write: [] });
    },

    async readWeights(range) {
      const health = await plugin();
      const { samples } = await health.readSamples({
        dataType: "weight",
        ...dates(range),
        limit: SAMPLE_LIMIT,
        ascending: true,
      });
      return toHealthWeights(samples);
    },

    async readWorkouts(range) {
      const health = await plugin();
      const workouts: HealthWorkout[] = [];
      let anchor: string | undefined;
      do {
        const page = await health.queryWorkouts({
          ...dates(range),
          limit: WORKOUT_PAGE,
          ascending: true,
          anchor,
        });
        for (const raw of page.workouts) {
          const mapped = toHealthWorkout(raw);
          if (!mapped) continue;
          // Heart rate is only shown for lifting sessions, so only strength
          // workouts pay for the extra read.
          if (mapped.type === "strength") {
            const { samples } = await health.readSamples({
              dataType: "heartRate",
              startDate: raw.startDate,
              endDate: raw.endDate,
              limit: SAMPLE_LIMIT,
            });
            Object.assign(mapped, heartRateStats(samples.map((s) => s.value)));
          }
          workouts.push(mapped);
        }
        anchor = page.workouts.length > 0 ? page.anchor : undefined;
      } while (anchor);
      return workouts;
    },

    async readSleep(range) {
      const health = await plugin();
      const { samples } = await health.readSamples({
        dataType: "sleep",
        ...dates(range),
        limit: SAMPLE_LIMIT,
        ascending: true,
      });
      return toSleepSamples(samples);
    },

    async readDaily(range) {
      const health = await plugin();
      const values: HealthQuantitySample[] = [];
      for (const [quantity, dataType, aggregation] of BUCKETED) {
        const { samples } = await health.queryAggregated({
          dataType,
          ...dates(range),
          bucket: "day",
          aggregation,
        });
        values.push(...dailyFromBuckets(quantity, samples));
      }
      for (const [quantity, dataType, reduce] of SAMPLED) {
        const { samples } = await health.readSamples({
          dataType,
          ...dates(range),
          limit: SAMPLE_LIMIT,
          ascending: true,
        });
        values.push(...dailyFromSamples(quantity, samples, reduce));
      }
      return values;
    },
  };
}
