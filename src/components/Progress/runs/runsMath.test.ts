import { describe, expect, it } from "vitest";
import type { ActivityLog, ReadinessLog, SetLog, WorkoutSession } from "@/types";
import {
  activityTotals,
  describeSleepEffort,
  formatMinutes,
  mean,
  sleepEffortComparison,
  sum,
  weeklyBars,
} from "./runsMath";
import type { Series } from "@/lib/metrics/types";

describe("weeklyBars", () => {
  const weekly = (n: number): Series => ({
    metric: "runDistance",
    params: {},
    points: Array.from({ length: n }, (_, i) => ({ t: i, v: i + 1 })),
    unit: "miles",
    better: "up",
  });

  it("labels every bar when there are few", () => {
    const bars = weeklyBars(weekly(5), (t) => `w${t}`);
    expect(bars.map((b) => b.label)).toEqual(["w0", "w1", "w2", "w3", "w4"]);
    expect(bars[2]).toEqual({ key: "2", label: "w2", value: 3 });
  });

  it("labels only some bars when there are many, always the newest", () => {
    const bars = weeklyBars(weekly(13), (t) => `w${t}`);
    expect(bars).toHaveLength(13);
    expect(bars[12].label).toBe("w12");
    expect(bars.filter((b) => b.label !== "").length).toBeLessThanOrEqual(5);
  });
});

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 11, 12).getTime();

function activity(id: string, kind: ActivityLog["kind"], daysAgo: number, minutes: number): ActivityLog {
  return {
    id,
    clientId: id,
    date: new Date(NOW - daysAgo * DAY),
    kind,
    durationMinutes: minutes,
    style: null,
    distanceMiles: null,
    notes: "",
    perceivedEffort: 2,
    synced: false,
  };
}

describe("activityTotals", () => {
  const all = [
    activity("a", "yoga", 2, 30),
    activity("b", "yoga", 9, 45),
    activity("c", "cycling", 5, 60),
    activity("d", "walking", 100, 40),
  ];

  it("totals sessions and minutes per kind in the range, most minutes first", () => {
    expect(activityTotals(all, "4w", NOW)).toEqual([
      { kind: "yoga", label: "Yoga", sessions: 2, minutes: 75 },
      { kind: "cycling", label: "Cycling", sessions: 1, minutes: 60 },
    ]);
  });

  it("includes older sessions when the range grows", () => {
    expect(activityTotals(all, "all", NOW).map((t) => t.kind)).toEqual(["yoga", "cycling", "walking"]);
    expect(activityTotals(all, "1y", NOW)).toHaveLength(3);
  });

  it("is empty with none in range, and accepts ISO date strings", () => {
    expect(activityTotals([], "all", NOW)).toEqual([]);
    expect(activityTotals([all[3]], "4w", NOW)).toEqual([]);
    const iso = { ...all[0], date: new Date(NOW - DAY).toISOString() } as unknown as ActivityLog;
    expect(activityTotals([iso], "4w", NOW)).toHaveLength(1);
  });
});

describe("series helpers", () => {
  const series = (values: number[]): Series => ({
    metric: "runDistance",
    params: {},
    points: values.map((v, i) => ({ t: i, v })),
    unit: "miles",
    better: "up",
  });

  it("sums and averages, and returns null for nothing to average", () => {
    expect(sum(series([1.5, 2, 3]))).toBeCloseTo(6.5);
    expect(sum(series([]))).toBe(0);
    expect(mean(series([2, 4]))).toBe(3);
    expect(mean(series([]))).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("reads as minutes under an hour and hours with minutes above", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(95)).toBe("1 h 35 min");
    expect(formatMinutes(0)).toBe("0 min");
  });
});

describe("sleepEffortComparison", () => {
  function workout(id: string, rpes: Array<number | undefined>): WorkoutSession {
    const sets = rpes.map((rpe, i) => ({ id: `${id}-${i}`, tier: "T1", rpe }) as SetLog);
    sets.push({ id: `${id}-w`, tier: "warmup", rpe: 1 } as SetLog);
    return { id, sets, completedAt: new Date() } as WorkoutSession;
  }
  function readiness(id: string, sessionId: string, sleepHours: ReadinessLog["sleepHours"]): ReadinessLog {
    return { id, clientId: id, sessionId, sleepHours, stressLevel: "normal", date: new Date(), synced: false };
  }

  function build(low: number[], rest: number[]) {
    const workouts: WorkoutSession[] = [];
    const logs: ReadinessLog[] = [];
    low.forEach((rpe, i) => {
      workouts.push(workout(`l${i}`, [rpe, rpe]));
      logs.push(readiness(`rl${i}`, `l${i}`, i % 2 ? "<5" : "5-7"));
    });
    rest.forEach((rpe, i) => {
      workouts.push(workout(`o${i}`, [rpe]));
      logs.push(readiness(`ro${i}`, `o${i}`, "7+"));
    });
    return { workouts, logs };
  }

  it("compares average effort on under-7-hour days with other days, ignoring warm-ups", () => {
    const { workouts, logs } = build([9, 8.5, 9.5], [7, 7.5, 8, 7.5]);
    const c = sleepEffortComparison(workouts, logs);
    expect(c).not.toBeNull();
    expect(c!.lowDays).toBe(3);
    expect(c!.otherDays).toBe(4);
    expect(c!.lowAvg).toBeCloseTo(9);
    expect(c!.otherAvg).toBeCloseTo(7.5);
    expect(describeSleepEffort(c!)).toBe(
      "On days you slept under 7 hours your average effort was RPE 9.0, against 7.5 on other days."
    );
  });

  it("needs at least three of each", () => {
    expect(sleepEffortComparison(...Object.values(build([9, 9], [7, 7, 7])) as [WorkoutSession[], ReadinessLog[]])).toBeNull();
    expect(sleepEffortComparison(...Object.values(build([9, 9, 9], [7, 7])) as [WorkoutSession[], ReadinessLog[]])).toBeNull();
  });

  it("skips logs whose workout is missing or has no RPE", () => {
    const { workouts, logs } = build([9, 9, 9], [7, 7, 7]);
    const noRpe = [workout("x", [undefined])];
    const extra = [readiness("rx", "x", "<5"), readiness("ry", "gone", "<5")];
    const c = sleepEffortComparison([...workouts, ...noRpe], [...logs, ...extra]);
    expect(c!.lowDays).toBe(3);
  });

  it("says so when the difference is negligible", () => {
    const { workouts, logs } = build([8, 8, 8.1], [8, 8, 8]);
    const c = sleepEffortComparison(workouts, logs)!;
    expect(describeSleepEffort(c)).toMatch(/about the same/);
  });
});
