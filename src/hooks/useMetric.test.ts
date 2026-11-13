import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { useMetric, useMetricSource, useReadinessLogs } from "./index";
import { clearDb, makeProfile, makeWorkout } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { computeMetric, inRange, summarize } from "@/lib/metrics";

const DAY = 24 * 60 * 60 * 1000;

// Demo data ending "now", so range filtering against the real clock is meaningful.
const NOW = new Date();
const demo = generateDemoData(NOW);

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.bodyweight.bulkPut(demo.bodyweight);
  await db.runs.bulkPut(demo.runs);
  await db.readinessLogs.bulkPut(demo.readinessLogs);
  await db.painEntries.bulkPut(demo.painEntries);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

beforeEach(clearDb);

async function loaded<T>(hook: () => T) {
  const r = renderHook(hook);
  await waitFor(() => expect(r.result.current).not.toBeUndefined());
  return r;
}

describe("useReadinessLogs", () => {
  it("is undefined while loading, then an empty list", async () => {
    const r = renderHook(() => useReadinessLogs());
    expect(r.result.current).toBeUndefined();
    await waitFor(() => expect(r.result.current).toEqual([]));
  });

  it("returns the logs oldest first and stays live", async () => {
    await db.readinessLogs.bulkPut([...demo.readinessLogs].reverse());
    const r = await loaded(() => useReadinessLogs());
    expect(r.result.current).toEqual(demo.readinessLogs);

    await act(() =>
      db.readinessLogs.put({
        id: "extra",
        clientId: "c-extra",
        sessionId: "s",
        sleepHours: "7+",
        stressLevel: "good",
        date: new Date(NOW.getTime() - 1000),
        synced: false,
      })
    );
    await waitFor(() => expect(r.result.current).toHaveLength(demo.readinessLogs.length + 1));
    expect(r.result.current!.at(-1)!.id).toBe("extra");
  });
});

describe("useMetricSource", () => {
  it("is undefined while loading and loads an empty database", async () => {
    const r = renderHook(() => useMetricSource());
    expect(r.result.current).toBeUndefined();
    await waitFor(() => expect(r.result.current).not.toBeUndefined());
    expect(r.result.current).toEqual({
      workouts: [],
      e1rms: [],
      bodyweight: [],
      runs: [],
      readiness: [],
      pain: [],
      liftStates: [],
      settings: null,
    });
  });

  it("assembles every record type, completed workouts only", async () => {
    await seedDemo();
    await db.workouts.put(makeWorkout({ id: "unfinished", completedAt: null }));
    const r = await loaded(() => useMetricSource());
    const source = r.result.current!;
    expect(source.workouts).toHaveLength(demo.workouts.length);
    expect(source.workouts.some((w) => w.id === "unfinished")).toBe(false);
    expect(source.e1rms).toHaveLength(demo.estimated1RMs.length);
    expect(source.bodyweight).toHaveLength(demo.bodyweight.length);
    expect(source.runs).toHaveLength(demo.runs.length);
    expect(source.readiness).toHaveLength(demo.readinessLogs.length);
    expect(source.pain).toHaveLength(1);
    expect(source.liftStates).toHaveLength(demo.liftStates.length);
    expect(source.settings?.trainingPhase.mode).toBe("cutting");
  });

  it("keeps its identity across re-renders and changes it when data changes", async () => {
    await seedDemo();
    const r = await loaded(() => useMetricSource());
    const first = r.result.current;
    r.rerender();
    r.rerender();
    expect(r.result.current).toBe(first);

    await act(() =>
      db.bodyweight.put({
        id: "new-weigh-in",
        clientId: "c-new-weigh-in",
        date: new Date(NOW.getTime() - 1000),
        weight: 225.5,
        timeOfDay: "morning",
        synced: false,
      })
    );
    await waitFor(() =>
      expect(r.result.current!.bodyweight).toHaveLength(demo.bodyweight.length + 1)
    );
    expect(r.result.current).not.toBe(first);
  });
});

describe("useMetric", () => {
  it("is undefined while loading", () => {
    expect(renderHook(() => useMetric("bodyweight")).result.current).toBeUndefined();
  });

  it("returns empty series and a null summary for an empty database", async () => {
    const r = await loaded(() => useMetric("bodyweight"));
    expect(r.result.current!.full.points).toEqual([]);
    expect(r.result.current!.series.points).toEqual([]);
    expect(r.result.current!.summary.latest).toBeNull();
    expect(r.result.current!.full.better).toBe("none");
  });

  it("computes the full series, the range-limited series and its summary", async () => {
    await seedDemo();
    const r = await loaded(() => useMetric("bodyweight", undefined, "4w"));
    const { full, series, summary } = r.result.current!;
    expect(full.points).toHaveLength(demo.bodyweight.length);
    expect(full.better).toBe("down");
    expect(series.points.length).toBeGreaterThan(20);
    expect(series.points.length).toBeLessThan(full.points.length);
    expect(series.points.every((p) => p.t >= Date.now() - 28 * DAY - 60_000)).toBe(true);
    expect(summary).toEqual(summarize(series));
    expect(summary.latest!.v).toBe(demo.bodyweight.at(-1)!.weight);
  });

  it("defaults to the whole history", async () => {
    await seedDemo();
    const r = await loaded(() => useMetric("sessionsPerWeek"));
    expect(r.result.current!.series).toBe(r.result.current!.full);
    expect(r.result.current!.full.points.reduce((sum, p) => sum + p.v, 0)).toBe(24);
  });

  it("passes params through and matches the pure computation", async () => {
    await seedDemo();
    const r = await loaded(() => useMetric("e1rm", { exerciseId: "squat" }, "3m"));
    const s = await loaded(() => useMetricSource());
    const expected = computeMetric("e1rm", s.result.current!, { exerciseId: "squat" });
    expect(r.result.current!.full).toEqual(expected);
    expect(r.result.current!.full.points).toHaveLength(6);
    expect(r.result.current!.series.points).toEqual(
      inRange(expected, "3m", Date.now()).points
    );
    const quads = await loaded(() => useMetric("weeklySets", { muscleGroup: "Quads" }));
    expect(Math.max(...quads.result.current!.full.points.map((p) => p.v))).toBeGreaterThan(0);
  });

  it("is referentially stable across re-renders, even with a fresh params object", async () => {
    await seedDemo();
    const r = await loaded(() => useMetric("workingWeight", { exerciseId: "bench" }, "4w"));
    const first = r.result.current!;
    r.rerender();
    expect(r.result.current).toBe(first);
    expect(r.result.current!.series).toBe(first.series);
    expect(r.result.current!.summary).toBe(first.summary);
  });

  it("recomputes when the metric, params or range change, and when data changes", async () => {
    await seedDemo();
    const r = renderHook(
      ({ exerciseId, range }: { exerciseId: string; range: "4w" | "all" }) =>
        useMetric("amrapReps", { exerciseId }, range),
      { initialProps: { exerciseId: "squat", range: "all" } }
    );
    await waitFor(() => expect(r.result.current).not.toBeUndefined());
    const squat = r.result.current!;
    expect(squat.full.params).toEqual({ exerciseId: "squat" });

    r.rerender({ exerciseId: "bench", range: "all" });
    expect(r.result.current!.full.params).toEqual({ exerciseId: "bench" });
    expect(r.result.current!.full).not.toBe(squat.full);

    const benchAll = r.result.current!;
    r.rerender({ exerciseId: "bench", range: "4w" });
    expect(r.result.current!.full).toBe(benchAll.full);
    expect(r.result.current!.series.points.length).toBeLessThan(benchAll.series.points.length);

    const before = r.result.current!.full.points.length;
    await act(() => db.workouts.delete(demo.workouts.at(-2)!.id)); // the last A2 (bench T1)
    await waitFor(() => expect(r.result.current!.full.points.length).toBe(before - 1));
  });
});
