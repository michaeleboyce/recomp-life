// A9: an accessory added during the workout. Appended (never inserted), saved as an
// `add` plan edit so resume and the rebuild plan it, weights changed on the spot stay
// on their sets, and once finished it is saved and counted in volume. Real data layer
// on fake-indexeddb; made-up data only.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { startWorkout } from "@/lib/data/workouts";
import { calculateMuscleLoad } from "@/lib/muscleLoad";
import { calculateMuscleGroupVolume } from "@/lib/volumeTracking";
import { useWorkoutStore } from "@/stores/workoutStore";
import { useActiveWorkout } from "./useActiveWorkout";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/projection", () => ({ describePrOpportunity: () => null }));

const CURLS = { sets: 3, reps: 15, weight: 30, isAMRAP: true };

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
  hook.result.current.plan.map((e) => `${e.tier}:${e.exerciseId} ${e.weight} ${e.targetSets}x${e.targetReps}`);

describe("adding an accessory during the workout", () => {
  it("appends it, keeps every spot weight on its set through a reload, and saves it as a plan edit", async () => {
    const id = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    let hook = await mount(id);
    // A weight changed on the spot for the squat's third set, and one done.
    act(() => hook.result.current.setSetWeight(2, 200));
    await logSet(hook);
    const before = describe_(hook);

    await act(() => hook.result.current.addExercise("bicep_curls", CURLS));
    const after = describe_(hook);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toBe("accessory:bicep_curls 30 3x15");
    const saved = (await db.workouts.get(id))!;
    expect(saved.planEdits).toEqual([{ kind: "add", exerciseId: "bicep_curls", ...CURLS }]);
    // Still on the squat, its third set still at the weight set for it.
    expect(hook.result.current.activeIndex).toBe(0);
    expect(hook.result.current.setChips[2].weight).toBe(200);

    hook = await reload(hook, id);
    expect(describe_(hook)).toEqual(after);
    expect(hook.result.current.activeIndex).toBe(0);
    expect(hook.result.current.setChips[2].weight).toBe(200);
    expect(hook.result.current.sets).toHaveLength(1);
  });

  it("rejects one already in the workout, an unknown one and a bad scheme, saving nothing", async () => {
    const id = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    const hook = await mount(id);
    await act(() => hook.result.current.addExercise("face_pulls", CURLS));
    await expect(hook.result.current.addExercise("face_pulls", CURLS)).rejects.toThrow(/already in this workout/);
    await expect(hook.result.current.addExercise("squat", CURLS)).rejects.toThrow(/already in this workout/);
    await expect(hook.result.current.addExercise("nonsense", CURLS)).rejects.toThrow(/not in the library/);
    await expect(hook.result.current.addExercise("bicep_curls", { ...CURLS, sets: 0 })).rejects.toThrow(/whole numbers/);
    await expect(hook.result.current.addExercise("bicep_curls", { ...CURLS, weight: -5 })).rejects.toThrow(/0 or more/);
    expect((await db.workouts.get(id))!.planEdits).toHaveLength(1);
  });

  it("is done like any entry, saved when the workout finishes and counted in volume", async () => {
    const id = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    let hook = await mount(id);
    await act(() => hook.result.current.addExercise("bicep_curls", CURLS));
    hook = await reload(hook, id);
    while (hook.result.current.status === "active") await logSet(hook);
    expect(hook.result.current.status).toBe("complete");
    await act(async () => {
      expect(await hook.result.current.finish()).toBe(true);
    });
    const saved = (await db.workouts.get(id))!;
    expect(saved.completedAt).not.toBeNull();
    const curls = saved.sets.filter((s) => s.exerciseId === "bicep_curls");
    expect(curls).toHaveLength(3);
    expect(curls.every((s) => s.tier === "accessory" && s.weight === 30 && s.targetReps === 15)).toBe(true);
    expect(calculateMuscleGroupVolume(saved.sets).biceps?.directSets).toBe(3);
    expect(calculateMuscleLoad(saved.sets).biceps).toBeGreaterThanOrEqual(3);
  });
});
