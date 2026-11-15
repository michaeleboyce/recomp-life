import { describe, expect, it } from "vitest";
import type { AggregatedSample, HealthSample, Workout } from "@capgo/capacitor-health";
import {
  dailyFromBuckets,
  dailyFromSamples,
  heartRateStats,
  toHealthWeights,
  toHealthWorkout,
  toSleepSamples,
} from "./healthkitMap";

const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    workoutType: "running",
    duration: 1800,
    totalEnergyBurned: 320.4,
    totalDistance: 5000,
    startDate: local(10, 7),
    endDate: local(10, 7, 30),
    sourceName: "Apple Watch",
    platformId: "UUID-1",
    ...overrides,
  };
}

function sample(overrides: Partial<HealthSample> = {}): HealthSample {
  return {
    dataType: "weight",
    value: 80,
    unit: "kilogram",
    startDate: local(10, 7),
    endDate: local(10, 7),
    platformId: "S-1",
    sourceName: "Scale",
    ...overrides,
  };
}

describe("toHealthWorkout", () => {
  it("maps a run", () => {
    expect(toHealthWorkout(workout(), { avgHeartRate: 150, maxHeartRate: 170 })).toEqual({
      uuid: "UUID-1",
      sourceName: "Apple Watch",
      type: "running",
      rawType: "running",
      start: new Date(local(10, 7)),
      end: new Date(local(10, 7, 30)),
      durationSeconds: 1800,
      distanceMetres: 5000,
      indoor: null,
      activeEnergyKcal: 320,
      avgHeartRate: 150,
      maxHeartRate: 170,
    });
  });

  it.each([
    ["traditionalStrengthTraining", "strength"],
    ["functionalStrengthTraining", "strength"],
    ["bikingStationary", "cycling"],
    ["hiking", "hiking"],
    ["yoga", "yoga"],
    ["swimming", "other"],
  ] as const)("maps %s to %s", (workoutType, type) => {
    expect(toHealthWorkout(workout({ workoutType }))?.type).toBe(type);
  });

  it("reads the indoor flag from the type or the metadata", () => {
    expect(toHealthWorkout(workout({ workoutType: "runningTreadmill" }))?.indoor).toBe(true);
    expect(toHealthWorkout(workout({ metadata: { HKIndoorWorkout: "1" } }))?.indoor).toBe(true);
    expect(toHealthWorkout(workout({ metadata: { HKIndoorWorkout: "0" } }))?.indoor).toBe(false);
  });

  it("drops a workout with no identifier", () => {
    expect(toHealthWorkout(workout({ platformId: undefined }))).toBeNull();
  });

  it("leaves missing energy and distance empty", () => {
    const mapped = toHealthWorkout(workout({ totalEnergyBurned: undefined, totalDistance: undefined }));
    expect(mapped?.activeEnergyKcal).toBeNull();
    expect(mapped?.distanceMetres).toBeNull();
  });
});

describe("heartRateStats", () => {
  it("averages and finds the peak", () => {
    expect(heartRateStats([100, 121, 140])).toEqual({ avgHeartRate: 120, maxHeartRate: 140 });
  });

  it("is empty with no readings", () => {
    expect(heartRateStats([0, NaN])).toEqual({ avgHeartRate: null, maxHeartRate: null });
  });
});

describe("toHealthWeights", () => {
  it("keeps identified, positive samples", () => {
    const weights = toHealthWeights([
      sample(),
      sample({ platformId: undefined }),
      sample({ platformId: "S-2", value: 0 }),
    ]);
    expect(weights).toEqual([
      { uuid: "S-1", sourceName: "Scale", date: new Date(local(10, 7)), kilograms: 80 },
    ]);
  });
});

describe("toSleepSamples", () => {
  it("splits a session into its stages and renames light sleep", () => {
    const stages = toSleepSamples([
      sample({
        dataType: "sleep",
        platformId: "N-1",
        startDate: local(10, 23),
        endDate: local(11, 6),
        stages: [
          { stage: "light", startDate: local(10, 23), endDate: local(11, 2), durationMinutes: 180 },
          { stage: "deep", startDate: local(11, 2), endDate: local(11, 3), durationMinutes: 60 },
        ],
      }),
    ]);
    expect(stages.map((s) => [s.uuid, s.stage])).toEqual([
      ["N-1:0", "core"],
      ["N-1:1", "deep"],
    ]);
    expect(stages[1].start).toEqual(new Date(local(11, 2)));
  });

  it("passes through a sample that only has a state", () => {
    const [only] = toSleepSamples([
      sample({ dataType: "sleep", sleepState: "rem", startDate: local(11, 3), endDate: local(11, 4) }),
    ]);
    expect(only.stage).toBe("rem");
  });
});

describe("daily values", () => {
  const bucket = (day: number, value: number): AggregatedSample => ({
    startDate: local(day, 0),
    endDate: local(day + 1, 0),
    value,
    values: {},
    unit: "count",
  });

  it("turns day buckets into one value per local day, skipping empty days", () => {
    expect(dailyFromBuckets("steps", [bucket(10, 9120.04), bucket(11, 0)])).toEqual([
      { quantity: "steps", day: "2026-11-10", value: 9120 },
    ]);
  });

  it("averages readings within a day", () => {
    const readings = [
      sample({ value: 40, startDate: local(10, 2) }),
      sample({ value: 50, startDate: local(10, 5) }),
      sample({ value: 61, startDate: local(11, 4) }),
    ];
    expect(dailyFromSamples("hrvMs", readings, "average")).toEqual([
      { quantity: "hrvMs", day: "2026-11-10", value: 45 },
      { quantity: "hrvMs", day: "2026-11-11", value: 61 },
    ]);
  });

  it("takes the latest reading of a day", () => {
    const readings = [
      sample({ value: 42.1, startDate: local(10, 18) }),
      sample({ value: 41.7, startDate: local(10, 6) }),
    ];
    expect(dailyFromSamples("vo2Max", readings, "latest")).toEqual([
      { quantity: "vo2Max", day: "2026-11-10", value: 42.1 },
    ]);
  });
});
