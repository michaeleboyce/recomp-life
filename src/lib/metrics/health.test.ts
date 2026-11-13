import { describe, expect, it } from "vitest";
import { foldDaily } from "@/lib/health/daily";
import { computeMetric, getMetric } from "./index";
import type { MetricSource } from "./types";

const base: MetricSource = {
  workouts: [],
  e1rms: [],
  bodyweight: [],
  runs: [],
  readiness: [],
  pain: [],
  liftStates: [],
  settings: null,
};

const healthDaily = foldDaily(
  [
    { quantity: "restingHr", day: "2026-11-11", value: 51 },
    { quantity: "restingHr", day: "2026-11-10", value: 54 },
    { quantity: "steps", day: "2026-11-10", value: 9120 },
    { quantity: "vo2Max", day: "2026-11-10", value: 42.13 },
  ],
  [
    {
      day: "2026-11-11",
      asleepMinutes: 432,
      deepMinutes: 60,
      remMinutes: 90,
      start: new Date(2026, 10, 10, 23),
      end: new Date(2026, 10, 11, 6, 30),
    },
  ]
);

describe("Apple Health metrics", () => {
  it("are empty when Apple Health is not connected", () => {
    expect(computeMetric("sleepHours", base).points).toEqual([]);
    expect(computeMetric("restingHr", { ...base, healthDaily: [] }).points).toEqual([]);
  });

  it("plot one point per day that has a value, oldest first, at local noon", () => {
    const series = computeMetric("restingHr", { ...base, healthDaily });
    expect(series.points).toEqual([
      { t: new Date(2026, 10, 10, 12).getTime(), v: 54, refId: "2026-11-10" },
      { t: new Date(2026, 10, 11, 12).getTime(), v: 51, refId: "2026-11-11" },
    ]);
    expect(series.unit).toBe("bpm");
    expect(series.better).toBe("down");
  });

  it("skips days without the value", () => {
    expect(computeMetric("steps", { ...base, healthDaily }).points.map((p) => p.refId)).toEqual([
      "2026-11-10",
    ]);
    expect(computeMetric("hrv", { ...base, healthDaily }).points).toEqual([]);
  });

  it("reports sleep in hours with a readable label", () => {
    const [night] = computeMetric("sleepHours", { ...base, healthDaily }).points;
    expect(night.v).toBeCloseTo(7.2);
    expect(night.label).toBe("7h 12m");
    expect(getMetric("sleepHours").format(7.2)).toBe("7h 12m");
  });

  it("formats values for display", () => {
    expect(getMetric("steps").format(9120)).toBe("9,120");
    expect(getMetric("vo2Max").format(42.13)).toBe("42.1");
    expect(getMetric("restingHr").format(51.4)).toBe("51");
  });
});
