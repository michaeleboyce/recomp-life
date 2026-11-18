// Who owns each piece of the active workout's state, and how long it lasts (the map at
// the top of useActiveWorkout.ts): what a reload keeps, what leaving the screen and
// coming back keeps (the store is kept, React state is not), what a swap clears, and
// what ends the rest. Real data layer on fake-indexeddb; made-up data only.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { startWorkout } from "@/lib/data/workouts";
import type { SwapReplacement } from "@/lib/swap";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { RepsInReserve } from "@/types";
import { useActiveWorkout } from "./useActiveWorkout";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/projection", () => ({ describePrOpportunity: () => null }));

const DB_ROW: SwapReplacement = {
  exerciseId: "db_row",
  prescription: { weight: 40, sets: 3, reps: 15, isAMRAP: true, basis: "none", note: "" },
};
const GOBLET: SwapReplacement = {
  exerciseId: "goblet_squat",
  prescription: { weight: 50, sets: 5, reps: 3, isAMRAP: true, basis: "ratio", note: "" },
};

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  useWorkoutStore.getState().reset();
  sessionStorage.clear();
});

const start = () =>
  startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });

async function mount(sessionId: string) {
  const hook = renderHook(() => useActiveWorkout(sessionId, { tapGuardMs: 0 }));
  await waitFor(() => expect(hook.result.current.status).toBe("active"));
  return hook;
}
type Hook = Awaited<ReturnType<typeof mount>>;

/** A reload: the page's memory (React state and the store) is gone; the database and sessionStorage stay. */
async function reload(hook: Hook, sessionId: string): Promise<Hook> {
  hook.unmount();
  useWorkoutStore.getState().reset();
  return mount(sessionId);
}

/** Leaving the screen and coming back (Today, then Resume): React state is gone, the store stays. */
async function remount(hook: Hook, sessionId: string): Promise<Hook> {
  hook.unmount();
  return mount(sessionId);
}

async function logSet(
  hook: Hook,
  options: { repsInReserve?: RepsInReserve; keepResting?: boolean } = {}
) {
  const before = hook.result.current.sets.length;
  if (options.repsInReserve != null) act(() => hook.result.current.setSelectedRepsInReserve(options.repsInReserve!));
  await act(() => hook.result.current.logSet());
  await waitFor(() => expect(hook.result.current.sets).toHaveLength(before + 1));
  await waitFor(() => expect(hook.result.current.isSaving).toBe(false));
  if (!options.keepResting) act(() => useWorkoutStore.getState().skipRest());
}

/** Five squat sets, then the first bench set logged hard: the T2 drop is offered. */
async function benchDropOffered(hook: Hook) {
  for (let i = 0; i < 5; i++) await logSet(hook);
  expect(hook.result.current.entry?.exerciseId).toBe("bench");
  await logSet(hook, { repsInReserve: "1-2" });
  expect(hook.result.current.dropSuggestion).toEqual({ reducedWeight: 95, repsInReserve: "1-2" });
}

const resting = () => useWorkoutStore.getState().isRestTimerActive;

describe("the next set's draft", () => {
  it("a reload keeps the weights changed on the spot, not the reps or effort picked", async () => {
    const id = await start();
    let hook = await mount(id);
    act(() => hook.result.current.setNextWeight(200));
    act(() => hook.result.current.setSelectedReps(2));
    act(() => hook.result.current.setSelectedRepsInReserve("1-2"));
    expect(hook.result.current.entry?.weight).toBe(200);
    expect(hook.result.current.selectedReps).toBe(2);

    hook = await reload(hook, id);
    expect(hook.result.current.weightOverride).toBe(200);
    expect(hook.result.current.entry?.weight).toBe(200);
    expect(hook.result.current.selectedReps).toBe(3);
    expect(hook.result.current.selectedRepsInReserve).toBeNull();
  });

  it("leaving the screen and coming back keeps the spot weight, not the reps picked", async () => {
    const id = await start();
    let hook = await mount(id);
    act(() => hook.result.current.setNextWeight(200));
    act(() => hook.result.current.setSelectedReps(2));
    hook = await remount(hook, id);
    expect(hook.result.current.entry?.weight).toBe(200);
    expect(hook.result.current.selectedReps).toBe(3);
  });

  it("the reps and effort picked are for one set: the next set starts at its target", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.setSelectedReps(4));
    act(() => hook.result.current.setSelectedRepsInReserve("3+"));
    await logSet(hook);
    expect(hook.result.current.sets[0]).toMatchObject({ actualReps: 4, repsInReserve: "3+" });
    expect(hook.result.current.selectedReps).toBe(3);
    expect(hook.result.current.selectedRepsInReserve).toBeNull();
  });

  it("the reps picked come back with their set after a jump away and back", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.setSelectedReps(2));
    act(() => hook.result.current.jumpTo(1));
    expect(hook.result.current.entry?.exerciseId).toBe("bench");
    expect(hook.result.current.selectedReps).toBe(10);
    act(() => hook.result.current.jumpTo(0));
    expect(hook.result.current.selectedReps).toBe(2);
  });

  it("an accepted drop with no set logged since is lost on a reload and offered again", async () => {
    const id = await start();
    let hook = await mount(id);
    await benchDropOffered(hook);
    act(() => hook.result.current.acceptDrop());
    expect(hook.result.current.entry?.weight).toBe(95);

    hook = await reload(hook, id);
    expect(hook.result.current.entry).toMatchObject({ exerciseId: "bench", weight: 100, completedSets: 1 });
    expect(hook.result.current.dropSuggestion).toEqual({ reducedWeight: 95, repsInReserve: "1-2" });
  });

  it("an accepted drop with no set logged since is kept when leaving the screen and coming back", async () => {
    const id = await start();
    let hook = await mount(id);
    await benchDropOffered(hook);
    act(() => hook.result.current.acceptDrop());

    hook = await remount(hook, id);
    expect(hook.result.current.entry).toMatchObject({ exerciseId: "bench", weight: 95 });
    expect(hook.result.current.dropSuggestion).toBeNull();
    expect(hook.result.current.droppedFrom).toBe(100);
  });

  it("a swap of the entry with the accepted drop clears it; a swap of another entry keeps it", async () => {
    const id = await start();
    const hook = await mount(id);
    await benchDropOffered(hook);
    act(() => hook.result.current.acceptDrop());

    // Another entry, swapped in place before any set: the drop on bench stays.
    await act(() => hook.result.current.swapExercise("lat_pulldown", "T3", [DB_ROW]));
    expect(useWorkoutStore.getState().pendingDrop).toEqual({ entryIndex: 1, weight: 95 });
    expect(hook.result.current.plan[1].weight).toBe(95);

    // Bench itself, after its first set: the rest of it is gone, and so is the drop.
    await act(() => hook.result.current.swapExercise("bench", "T2", [GOBLET]));
    expect(useWorkoutStore.getState().pendingDrop).toBeNull();
    expect(hook.result.current.plan[1]).toMatchObject({ exerciseId: "bench", weight: 100, targetSets: 1 });
  });
});

describe("the viewed entry", () => {
  it("is kept when leaving the screen and coming back, and not after a reload", async () => {
    const id = await start();
    let hook = await mount(id);
    act(() => hook.result.current.jumpTo(1));
    hook = await remount(hook, id);
    expect(hook.result.current.activeIndex).toBe(1);

    hook = await reload(hook, id);
    expect(hook.result.current.activeIndex).toBe(0);
  });
});

describe("the rest timer", () => {
  it("is ended by a jump to another entry", async () => {
    const hook = await mount(await start());
    await logSet(hook, { keepResting: true });
    expect(resting()).toBe(true);
    act(() => hook.result.current.jumpTo(1));
    expect(resting()).toBe(false);
  });

  it("is ended by a swap that goes to the replacement, not by a removal", async () => {
    const hook = await mount(await start());
    await logSet(hook, { keepResting: true });
    expect(resting()).toBe(true);
    await act(() => hook.result.current.removeExercise("lat_pulldown", "T3"));
    expect(resting()).toBe(true);
    expect(hook.result.current.activeIndex).toBe(0);

    await act(() => hook.result.current.swapExercise("bench", "T2", [DB_ROW]));
    expect(resting()).toBe(false);
    expect(hook.result.current.entry?.exerciseId).toBe("db_row");
  });

  it("keeps running when leaving the screen and coming back, and is gone after a reload", async () => {
    const id = await start();
    let hook = await mount(id);
    await logSet(hook, { keepResting: true });
    const duration = useWorkoutStore.getState().restTimerDuration;
    expect(duration).toBeGreaterThan(0);
    hook = await remount(hook, id);
    expect(useWorkoutStore.getState()).toMatchObject({ isRestTimerActive: true, restTimerDuration: duration });

    hook = await reload(hook, id);
    expect(resting()).toBe(false);
  });

  it("does not start when the drops end after the workout was ended early", async () => {
    const hook = await mount(await start());
    await logSet(hook);
    act(() => hook.result.current.endEarly());
    expect(hook.result.current.status).toBe("complete");
    await waitFor(() => expect(hook.result.current.dropPreview).not.toBeNull());
    act(() => hook.result.current.startDropSet());
    expect(hook.result.current.dropSet).not.toBeNull();
    act(() => hook.result.current.endDropSets());
    expect(hook.result.current.dropSet).toBeNull();
    expect(resting()).toBe(false);
  });
});

describe("the start time", () => {
  it("is the saved session's, the same object from render to render and after coming back", async () => {
    const id = await start();
    const startedAt = new Date(Date.now() - 20 * 60 * 1000);
    await db.workouts.update(id, { startedAt });
    let hook = await mount(id);
    const first = hook.result.current.workoutStartTime;
    expect(first).toEqual(startedAt);
    act(() => hook.result.current.setSelectedReps(2));
    await logSet(hook);
    expect(hook.result.current.workoutStartTime).toBe(first);

    hook = await remount(hook, id);
    expect(hook.result.current.workoutStartTime).toEqual(startedAt);
  });

  it("is what the saved duration is counted from", async () => {
    const id = await start();
    await db.workouts.update(id, { startedAt: new Date(Date.now() - 20 * 60 * 1000) });
    const hook = await mount(id);
    await logSet(hook);
    await act(async () => {
      expect(await hook.result.current.finish()).toBe(true);
    });
    const saved = (await db.workouts.get(id))!;
    expect(saved.totalDurationSeconds).toBeGreaterThanOrEqual(20 * 60);
    expect(saved.totalDurationSeconds).toBeLessThan(20 * 60 + 30);
  });
});
