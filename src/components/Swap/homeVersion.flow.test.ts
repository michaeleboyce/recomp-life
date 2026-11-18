// W10 at home: a home version of a lift picked in the swap sheet goes through the
// home-substitute path. Started, resumed, finished: the session stores it, the plan after
// a reload agrees, the rebuild moves that home exercise's own state, and the day moves
// on. Real data layer on fake-indexeddb; made-up data only.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { useActiveWorkout } from "@/components/ActiveWorkout/useActiveWorkout";
import { useWorkoutSetup } from "@/components/PreWorkout/useWorkoutSetup";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { updateSettings } from "@/lib/data/records";
import { sessionCountsForRotation } from "@/lib/workout/credit";
import { useWorkoutStore } from "@/stores/workoutStore";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/projection", () => ({ describePrOpportunity: () => null }));

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  await updateSettings({ defaultLocation: "home", accessories: "ask", showWarmUps: false });
  useWorkoutStore.getState().reset();
  sessionStorage.clear();
});

async function mountActive(id: string) {
  const hook = renderHook(() => useActiveWorkout(id, { tapGuardMs: 0 }));
  await waitFor(() => expect(hook.result.current.status).toBe("active"));
  return hook;
}

describe("a home version picked before the workout", () => {
  it("is stored as the session's home exercise, resumes the same, and counts as the lift", async () => {
    const setup = renderHook(() => useWorkoutSetup("A1"));
    await waitFor(() => expect(setup.result.current.isLoading).toBe(false));
    expect(setup.result.current.location).toBe("home");
    act(() => setup.result.current.chooseSubstitute("bench", "db_floor_press"));
    await waitFor(() =>
      expect(setup.result.current.plan.find((e) => e.exerciseId === "bench")?.substituteExerciseId).toBe("db_floor_press")
    );
    const planned = setup.result.current.plan.find((e) => !e.isWarmUp && e.exerciseId === "bench")!;
    expect(setup.result.current.edits).toEqual([]);

    let id: string | null = null;
    await act(async () => {
      id = await setup.result.current.start();
    });
    setup.unmount();
    const saved = (await db.workouts.get(id!))!;
    expect(saved.planEdits ?? []).toEqual([]);
    expect(saved.prescribed!.find((p) => p.exerciseId === "bench")!.home?.exerciseId).toBe("db_floor_press");

    let hook = await mountActive(id!);
    const bench = () => hook.result.current.plan.find((e) => !e.isWarmUp && e.exerciseId === "bench")!;
    expect(bench()).toMatchObject({ substituteExerciseId: "db_floor_press", weight: planned.weight });
    // Resume after a reload: the same plan.
    const before = hook.result.current.plan.map((e) => `${e.exerciseId}/${e.substituteExerciseId ?? ""}/${e.weight}`);
    hook.unmount();
    useWorkoutStore.getState().reset();
    hook = await mountActive(id!);
    expect(hook.result.current.plan.map((e) => `${e.exerciseId}/${e.substituteExerciseId ?? ""}/${e.weight}`)).toEqual(before);

    // Every set at target, then finish: the floor press's own state moves up, and the day counts.
    while (hook.result.current.status === "active") {
      const n = hook.result.current.sets.length;
      await act(() => hook.result.current.logSet());
      await waitFor(() => expect(hook.result.current.sets).toHaveLength(n + 1));
      await waitFor(() => expect(hook.result.current.isSaving).toBe(false));
      act(() => useWorkoutStore.getState().skipRest());
    }
    await act(async () => {
      expect(await hook.result.current.finish()).toBe(true);
    });
    const done = (await db.workouts.get(id!))!;
    expect(done.sets.filter((s) => s.exerciseId === "bench").every((s) => s.substituteExerciseId === "db_floor_press")).toBe(true);
    const floor = (await db.variantStates.toArray()).find((v) => v.liftId === "bench" && v.exerciseId === "db_floor_press" && v.tier === "T2");
    expect(floor).toBeDefined();
    expect(floor!.weight).toBeGreaterThan(planned.weight);
    expect(sessionCountsForRotation(done, "A1")).toBe(true);
  });
});
