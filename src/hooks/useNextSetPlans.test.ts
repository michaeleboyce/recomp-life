import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import type { NextSetPlan } from "@/types";
import { saveNextSetPlan, useNextSetPlans, useNextWorkout, useUpcomingWorkouts } from "./index";

const SETS = [
  { weight: 185, reps: 3 },
  { weight: 195, reps: 3 },
  { weight: 205, reps: 3 },
];
const PLAN: NextSetPlan = {
  exerciseId: "squat",
  liftId: "squat",
  tier: "T1",
  sets: SETS,
  planSets: SETS.map((s) => ({ ...s, weight: 190 })),
  createdAt: "2026-11-17T09:00:00.000Z",
};

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
});

describe("next-session set plans in the hooks (E6)", () => {
  it("useNextSetPlans reads them live, an empty record when there are none", async () => {
    const r = renderHook(() => useNextSetPlans());
    await waitFor(() => expect(r.result.current).toEqual({}));
    await act(() => saveNextSetPlan(PLAN, "squat|T1"));
    await waitFor(() => expect(r.result.current).toEqual({ "squat|T1": PLAN }));
    await act(() => saveNextSetPlan(null, "squat|T1"));
    await waitFor(() => expect(r.result.current).toEqual({}));
  });

  it("Today's next workout shows the per-set weights", async () => {
    await saveNextSetPlan(PLAN, "squat|T1");
    const r = renderHook(() => useNextWorkout("gym"));
    await waitFor(() => expect(r.result.current).toBeDefined());
    expect(r.result.current!.templateId).toBe("A1");
    const squat = r.result.current!.plan.find((e) => e.exerciseId === "squat" && e.tier === "T1" && !e.isWarmUp)!;
    expect(squat.perSet).toEqual(SETS);
    expect(squat.weight).toBe(205);
  });

  it("Coming up shows them on the first workout that does the exercise at that tier", async () => {
    await saveNextSetPlan(PLAN, "squat|T1");
    const r = renderHook(() => useUpcomingWorkouts("gym", 5));
    await waitFor(() => expect(r.result.current).toBeDefined());
    const [first, , , , fifth] = r.result.current!;
    expect(first.entries.find((e) => e.exerciseId === "squat")).toMatchObject({ weight: 205, sets: 3 });
    expect(fifth.templateId).toBe("A1");
    expect(fifth.plan.find((e) => e.exerciseId === "squat" && e.tier === "T1")!.perSet).toBeUndefined();
  });
});
