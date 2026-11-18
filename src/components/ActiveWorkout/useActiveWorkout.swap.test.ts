// W11: swapping or removing an exercise during the workout. Saved as plan edits (each
// appended in order), laid on the frozen plan with no entry moved, the same plan after a
// reload, and finished like any workout: the Log groups both exercises and the swapped
// lift is held. Real data layer on fake-indexeddb; made-up data only.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { groupSets } from "@/components/LogEdit/groupSets";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { startWorkout } from "@/lib/data/workouts";
import { isDroppedEntry, type SwapReplacement } from "@/lib/swap";
import { useWorkoutStore } from "@/stores/workoutStore";
import { useActiveWorkout } from "./useActiveWorkout";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/projection", () => ({ describePrOpportunity: () => null }));

const GOBLET: SwapReplacement = {
  exerciseId: "goblet_squat",
  prescription: { weight: 50, sets: 5, reps: 3, isAMRAP: true, basis: "ratio", note: "" },
};
const LEG_PRESS_LIKE: SwapReplacement = {
  exerciseId: "db_lunge",
  prescription: { weight: 30, sets: 3, reps: 10, isAMRAP: true, basis: "none", note: "" },
};

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  useWorkoutStore.getState().reset();
  sessionStorage.clear();
});

async function mount(sessionId: string) {
  const hook = renderHook(() => useActiveWorkout(sessionId, { tapGuardMs: 0 }));
  await waitFor(() => expect(hook.result.current.status).toBe("active"));
  return hook;
}
type Hook = Awaited<ReturnType<typeof mount>>;

async function reload(hook: Hook, sessionId: string): Promise<Hook> {
  hook.unmount();
  useWorkoutStore.getState().reset();
  return mount(sessionId);
}

async function logSet(hook: Hook) {
  const before = hook.result.current.sets.length;
  await act(() => hook.result.current.logSet());
  await waitFor(() => expect(hook.result.current.sets).toHaveLength(before + 1));
  await waitFor(() => expect(hook.result.current.isSaving).toBe(false));
  act(() => useWorkoutStore.getState().skipRest());
}

const describe_ = (hook: Hook) =>
  hook.result.current.plan.map(
    (e) => `${e.isWarmUp ? "warmup" : e.tier}:${e.exerciseId} ${e.weight} ${e.targetSets}x${e.targetReps}`
  );

const start = (includeWarmUps = false) =>
  startWorkout({ templateId: "A1", location: "gym", includeWarmUps, selectedAccessories: [] });

describe("swapping during the workout", () => {
  it("before any set: replaces the entry in place, saved as edits, the same after a reload", async () => {
    const id = await start();
    let hook = await mount(id);
    const before = describe_(hook);

    await act(() => hook.result.current.swapExercise("squat", "T1", [GOBLET]));
    const after = describe_(hook);
    expect(after).toHaveLength(before.length);
    expect(after[0]).toBe("T1:goblet_squat 50 5x3");
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(hook.result.current.activeIndex).toBe(0);
    const saved = (await db.workouts.get(id))!;
    expect(saved.planEdits).toEqual([
      { kind: "swap", exerciseId: "squat", tier: "T1", replacementId: "goblet_squat" },
      { kind: "weight", exerciseId: "goblet_squat", tier: "T1", weight: 50 },
    ]);

    hook = await reload(hook, id);
    expect(describe_(hook)).toEqual(after);
    expect(hook.result.current.activeIndex).toBe(0);
  });

  it("after two sets: keeps them, ends the entry there, appends the replacement and goes to it; reload, finish, Log", async () => {
    const id = await start();
    const squatBefore = (await db.liftStates.get("squat"))!;
    let hook = await mount(id);
    await logSet(hook);
    await logSet(hook);
    const before = describe_(hook);

    await act(() => hook.result.current.swapExercise("squat", "T1", [GOBLET, LEG_PRESS_LIKE]));
    const after = describe_(hook);
    expect(after).toHaveLength(before.length + 2);
    expect(after[0]).toBe(before[0].replace("5x3", "2x3"));
    expect(after.slice(1, before.length)).toEqual(before.slice(1));
    expect(after.slice(-2)).toEqual(["accessory:goblet_squat 50 5x3", "accessory:db_lunge 30 3x10"]);
    expect(hook.result.current.activeIndex).toBe(before.length);
    expect(hook.result.current.plan[0].completedSets).toBe(2);
    const saved = (await db.workouts.get(id))!;
    expect(saved.planEdits!.map((e) => e.kind)).toEqual(["scheme", "add", "add"]);

    hook = await reload(hook, id);
    expect(describe_(hook)).toEqual(after);
    expect(hook.result.current.sets).toHaveLength(2);

    while (hook.result.current.status === "active") await logSet(hook);
    await act(async () => {
      expect(await hook.result.current.finish()).toBe(true);
    });
    const done = (await db.workouts.get(id))!;
    const groups = groupSets(done.sets).map((g) => g.exerciseId);
    expect(groups).toContain("squat");
    expect(groups).toContain("goblet_squat");
    expect(groups).toContain("db_lunge");
    expect(done.sets.filter((s) => s.exerciseId === "squat")).toHaveLength(2);
    // The swapped lift is held: neither a pass nor a miss.
    const squatAfter = (await db.liftStates.get("squat"))!;
    expect(squatAfter.t1Weight).toBe(squatBefore.t1Weight);
    expect(squatAfter.t1Stage).toBe(squatBefore.t1Stage);
  });

  it("a T1 with warm-ups swapped before its first working set skips those warm-ups", async () => {
    const id = await start(true);
    let hook = await mount(id);
    expect(hook.result.current.plan[0].isWarmUp).toBe(true);
    await act(() => hook.result.current.swapExercise("squat", "T1", [GOBLET]));
    const squat = hook.result.current.plan.findIndex((e) => !e.isWarmUp && e.exerciseId === "squat");
    expect(isDroppedEntry(hook.result.current.plan[squat])).toBe(true);
    expect(hook.result.current.plan[hook.result.current.activeIndex].exerciseId).toBe("goblet_squat");
    // Once the replacement is done, the squat's warm-ups are not offered.
    while (hook.result.current.plan[hook.result.current.activeIndex]?.exerciseId === "goblet_squat") await logSet(hook);
    expect(hook.result.current.plan[hook.result.current.activeIndex]?.exerciseId).not.toBe("squat");
    hook = await reload(hook, id);
    expect(hook.result.current.plan[hook.result.current.activeIndex]?.exerciseId).not.toBe("squat");
  });

  it("refuses an unknown entry or a replacement already in the workout, saving nothing", async () => {
    const id = await start();
    const hook = await mount(id);
    await expect(hook.result.current.swapExercise("squat", "T1", [{ ...GOBLET, exerciseId: "bench" }])).rejects.toThrow(
      /already in this workout/
    );
    await expect(hook.result.current.swapExercise("nonsense", "T1", [GOBLET])).rejects.toThrow(/not in this workout/);
    expect((await db.workouts.get(id))!.planEdits ?? []).toEqual([]);
  });
});

describe("removing during the workout", () => {
  it("drops an entry with no set logged: hidden from the plan's flow, the same after a reload", async () => {
    const id = await start();
    let hook = await mount(id);
    await act(() => hook.result.current.removeExercise("bench", "T2"));
    const bench = hook.result.current.plan.findIndex((e) => e.exerciseId === "bench");
    expect(isDroppedEntry(hook.result.current.plan[bench])).toBe(true);
    expect((await db.workouts.get(id))!.planEdits).toEqual([
      { kind: "scheme", exerciseId: "bench", tier: "T2", sets: 0, reps: 10 },
    ]);
    hook = await reload(hook, id);
    expect(isDroppedEntry(hook.result.current.plan[bench])).toBe(true);
    // Squat done, the next entry is past the removed bench.
    for (let i = 0; i < 5; i++) await logSet(hook);
    expect(hook.result.current.activeIndex).toBeGreaterThan(bench);
  });

  it("refuses an entry with a set logged", async () => {
    const id = await start();
    const hook = await mount(id);
    await logSet(hook);
    await expect(hook.result.current.removeExercise("squat", "T1")).rejects.toThrow(/Sets of this exercise are logged/);
  });
});
