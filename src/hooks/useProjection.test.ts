import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { MIN_TREND_POINTS } from "@/lib/projection/trend";
import type { ProjectionScenario } from "@/lib/projection";
import { useProjection } from "./index";

const NOW = new Date();
const demo = generateDemoData(NOW);

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.sets.bulkPut(demo.sets);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.bodyweight.bulkPut(demo.bodyweight);
  await db.runs.bulkPut(demo.runs);
  await db.readinessLogs.bulkPut(demo.readinessLogs);
  await db.painEntries.bulkPut(demo.painEntries);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

beforeEach(clearDb);
// The database open is slow under full-suite load.
vi.setConfig({ testTimeout: 30_000 });

async function loaded(scenario: ProjectionScenario = {}, weeks = 12, id = "squat") {
  const r = renderHook((props: { scenario: ProjectionScenario; weeks: number }) =>
    useProjection(id, props.scenario, props.weeks),
    { initialProps: { scenario, weeks } }
  );
  await waitFor(() => expect(r.result.current).not.toBeUndefined(), { timeout: 15_000 });
  return r;
}

describe("useProjection", () => {
  it("is undefined while loading", () => {
    const r = renderHook(() => useProjection("squat", {}, 12));
    expect(r.result.current).toBeUndefined();
  });

  it("projects the demo squat with an identical current and empty scenario", async () => {
    await seedDemo();
    const r = await loaded();
    const p = r.result.current!;
    expect(p.history.length).toBeGreaterThanOrEqual(MIN_TREND_POINTS);
    expect(p.current.status).toBe("ok");
    expect(p.current.points).toHaveLength(13);
    expect(p.scenario.points).toEqual(p.current.points);
    expect(p.baseline.exerciseId).toBe("squat");
    expect(p.baseline.sessionsPerWeek).toBeGreaterThan(0);
    expect(p.summary).toMatch(/^On your current trend, about \d+ in 12 weeks\.$/);
    expect(p.resultsNeeded).toBe(0);
    // Related lifts with enough working-weight points are reported for context.
    expect(Array.isArray(p.current.relatedTrend)).toBe(true);
  });

  it("applies the scenario and the horizon, and keys on scenario contents", async () => {
    await seedDemo();
    const r = await loaded();
    const current = r.result.current!.current;
    r.rerender({ scenario: { sessionsPerWeek: 3 }, weeks: 12 });
    await waitFor(() =>
      expect(r.result.current!.scenario.gain.v).toBeGreaterThan(current.gain.v)
    );
    expect(r.result.current!.summary).toMatch(/^With 3 squat sessions a week instead of/);
    expect(r.result.current!.current).toBe(current);

    const before = r.result.current;
    r.rerender({ scenario: { sessionsPerWeek: 3 }, weeks: 12 });
    expect(r.result.current).toBe(before);

    r.rerender({ scenario: {}, weeks: 4 });
    await waitFor(() => expect(r.result.current!.current.points).toHaveLength(5));
  });

  it("reports insufficient data and how many results are missing on an empty database", async () => {
    const r = await loaded();
    expect(r.result.current!.current.status).toBe("insufficient-data");
    expect(r.result.current!.resultsNeeded).toBe(MIN_TREND_POINTS);
    expect(r.result.current!.history).toEqual([]);
  });
});
