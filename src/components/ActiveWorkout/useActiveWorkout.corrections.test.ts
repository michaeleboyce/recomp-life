// E14: a set logged in the workout in progress can be corrected before finishing, and
// the plan of a workout in progress comes from the prescription it started with.
// Everything here goes through the real data layer on fake-indexeddb.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { recordAdjustment, type NewAdjustment } from "@/lib/data/adjustments";
import { clearDb } from "@/lib/data/testUtils";
import { startWorkout, type StartWorkoutInput } from "@/lib/data/workouts";
import type { ToastOptions } from "@/components/ui/toast";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { LiftState, SetLog } from "@/types";
import { useActiveWorkout } from "./useActiveWorkout";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/lib/projection", () => ({ describePrOpportunity: () => null }));

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  useWorkoutStore.getState().reset();
  toast.mockReset();
});

async function start(overrides: Partial<StartWorkoutInput> = {}): Promise<string> {
  return startWorkout({
    templateId: "A1",
    location: "gym",
    includeWarmUps: false,
    selectedAccessories: [],
    ...overrides,
  });
}

async function mount(sessionId: string) {
  const hook = renderHook(() => useActiveWorkout(sessionId, { tapGuardMs: 0 }));
  await waitFor(() => expect(hook.result.current.status).toBe("active"));
  return hook;
}

type Hook = Awaited<ReturnType<typeof mount>>;

async function logSet(hook: Hook, options: { reps?: number; rpe?: number; keepResting?: boolean } = {}) {
  const before = hook.result.current.sets.length;
  if (options.reps != null) act(() => hook.result.current.setSelectedReps(options.reps!));
  if (options.rpe != null) act(() => hook.result.current.setSelectedRPE(options.rpe!));
  await act(() => hook.result.current.logSet());
  await waitFor(() => expect(hook.result.current.sets.length).toBe(before + 1));
  await waitFor(() => expect(hook.result.current.isSaving).toBe(false));
  if (!options.keepResting) act(() => useWorkoutStore.getState().skipRest());
}

/** Reloads the page: everything held in memory is lost. */
async function reload(hook: Hook, sessionId: string): Promise<Hook> {
  hook.unmount();
  useWorkoutStore.getState().reset();
  return mount(sessionId);
}

async function editSet(hook: Hook, set: SetLog, patch: { actualReps?: number; weight?: number; rpe?: number }) {
  let saved = false;
  await act(async () => {
    saved = await hook.result.current.correctSet({
      kind: "editSet",
      workoutId: hook.result.current.session!.id,
      setId: set.id,
      patch,
    });
  });
  return saved;
}

async function deleteSet(hook: Hook, set: SetLog) {
  let saved = false;
  await act(async () => {
    saved = await hook.result.current.correctSet({
      kind: "deleteSet",
      workoutId: hook.result.current.session!.id,
      setId: set.id,
    });
  });
  return saved;
}

async function undoLastToast() {
  const options = toast.mock.calls.at(-1)![0] as ToastOptions;
  expect(options.action?.label).toBe("Undo");
  await act(async () => {
    await options.action!.onAction();
  });
}

async function endAndFinish(hook: Hook) {
  if (hook.result.current.status === "active") act(() => hook.result.current.endEarly());
  let saved = false;
  await act(async () => {
    saved = await hook.result.current.finish();
  });
  expect(saved).toBe(true);
}

/** A weight changed on another screen while the workout is open. */
async function adjust(exerciseId: string, set: NewAdjustment["set"]) {
  await act(async () => {
    await recordAdjustment({ exerciseId, source: "manual", set });
  });
}

async function liftState(exerciseId: string): Promise<LiftState> {
  return (await db.liftStates.get(exerciseId))!;
}

const workingPlan = (hook: Hook) =>
  hook.result.current.plan
    .filter((e) => !e.isWarmUp)
    .map((e) => `${e.tier}:${e.exerciseId}:${e.weight}:${e.targetSets}x${e.targetReps}`);

describe("correcting a set before finishing", () => {
  it("an AMRAP logged as 5 and corrected to 1 finishes as a miss", async () => {
    const sessionId = await start();
    const hook = await mount(sessionId);
    for (let i = 0; i < 4; i++) await logSet(hook);
    await logSet(hook, { reps: 5 });
    const amrap = hook.result.current.sets[4];
    expect(amrap).toMatchObject({ isAMRAP: true, actualReps: 5, status: "completed" });
    expect((await db.estimated1RMs.toArray()).map((e) => e.estimated1RM)).toEqual([222]);

    expect(await editSet(hook, amrap, { actualReps: 1 })).toBe(true);
    await waitFor(() => expect(hook.result.current.sets[4].actualReps).toBe(1));
    expect(hook.result.current.sets[4]).toMatchObject({ id: amrap.id, status: "failed", setNumber: 5 });
    expect(hook.result.current.sets).toHaveLength(5);
    // One rep is not an estimate: the row logged for five reps is gone.
    expect(await db.estimated1RMs.count()).toBe(0);
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "Squat set 5 corrected" })
    );

    await endAndFinish(hook);
    const squat = await liftState("squat");
    expect(squat.t1Weight).toBe(190);
    expect(squat.t1Stage).toBe("6x2");
    expect(squat.t1FailCount).toBe(1);
    expect(squat.recentAMRAPReps).toEqual([1]);
    expect((await db.workouts.get(sessionId))!.sets[4]).toMatchObject({ actualReps: 1, status: "failed" });
  });

  it("an AMRAP logged as 1 and corrected to 5 finishes as a pass", async () => {
    const hook = await mount(await start());
    for (let i = 0; i < 4; i++) await logSet(hook);
    await logSet(hook, { reps: 1 });
    const amrap = hook.result.current.sets[4];
    expect(amrap.status).toBe("failed");

    expect(await editSet(hook, amrap, { actualReps: 5 })).toBe(true);
    await waitFor(() => expect(hook.result.current.sets[4].status).toBe("completed"));

    await endAndFinish(hook);
    const squat = await liftState("squat");
    expect(squat.t1Weight).toBe(200);
    expect(squat.t1Stage).toBe("5x3");
    expect(squat.t1FailCount).toBe(0);
    expect(squat.recentAMRAPReps).toEqual([5]);
    expect(squat.recentE1RMs).toEqual([222]);
  });

  it("Undo puts the set back as it was logged", async () => {
    const hook = await mount(await start());
    await logSet(hook, { rpe: 8 });
    const first = hook.result.current.sets[0];

    await editSet(hook, first, { actualReps: 2, rpe: 9.5 });
    await waitFor(() => expect(hook.result.current.sets[0]).toMatchObject({ actualReps: 2, rpe: 9.5, status: "failed" }));

    await undoLastToast();
    await waitFor(() => expect(hook.result.current.sets[0]).toMatchObject({ actualReps: 3, rpe: 8, status: "completed" }));
    expect(toast).toHaveBeenLastCalledWith({ message: "Correction undone" });
  });

  it("keeps the set counter, the current exercise and the rest timer after a rep correction", async () => {
    const hook = await mount(await start());
    await logSet(hook);
    await logSet(hook);
    await logSet(hook, { keepResting: true });
    expect(useWorkoutStore.getState().isRestTimerActive).toBe(true);

    await editSet(hook, hook.result.current.sets[1], { actualReps: 2 });
    await waitFor(() => expect(hook.result.current.sets[1].actualReps).toBe(2));

    expect(hook.result.current.entry).toMatchObject({ exerciseId: "squat", completedSets: 3, weight: 190 });
    expect(hook.result.current.sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(useWorkoutStore.getState().isRestTimerActive).toBe(true);
  });

  it("deleting the most recent set ends its rest and makes it loggable again", async () => {
    const hook = await mount(await start());
    await logSet(hook);
    await logSet(hook);
    await logSet(hook, { reps: 9, keepResting: true });
    expect(useWorkoutStore.getState().isRestTimerActive).toBe(true);

    expect(await deleteSet(hook, hook.result.current.sets[2])).toBe(true);
    await waitFor(() => expect(hook.result.current.sets).toHaveLength(2));
    expect(hook.result.current.entry).toMatchObject({ exerciseId: "squat", completedSets: 2 });
    expect(useWorkoutStore.getState().isRestTimerActive).toBe(false);
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "Squat set 3 deleted" })
    );

    await logSet(hook);
    expect(hook.result.current.sets.map((s) => [s.setNumber, s.actualReps, s.isAMRAP])).toEqual([
      [1, 3, false],
      [2, 3, false],
      [3, 3, false],
    ]);
  });

  it("deleting the last set of a finished exercise returns to it, AMRAP and e1RM included", async () => {
    const hook = await mount(await start());
    for (let i = 0; i < 4; i++) await logSet(hook);
    await logSet(hook, { reps: 6 });
    expect(hook.result.current.entry?.exerciseId).toBe("bench");
    expect(await db.estimated1RMs.count()).toBe(1);

    await deleteSet(hook, hook.result.current.sets[4]);
    await waitFor(() => expect(hook.result.current.sets).toHaveLength(4));
    expect(hook.result.current.entry).toMatchObject({ exerciseId: "squat", tier: "T1", completedSets: 4 });
    expect(hook.result.current.isAMRAPSet).toBe(true);
    expect(await db.estimated1RMs.count()).toBe(0);

    await logSet(hook, { reps: 4 });
    expect(hook.result.current.sets.at(-1)).toMatchObject({ setNumber: 5, isAMRAP: true, actualReps: 4 });
    expect(hook.result.current.entry?.exerciseId).toBe("bench");
  });

  it("Undo restores a deleted set, unless it has been logged again", async () => {
    const hook = await mount(await start());
    await logSet(hook);
    await logSet(hook, { reps: 2 });
    const second = hook.result.current.sets[1];

    await deleteSet(hook, second);
    await waitFor(() => expect(hook.result.current.sets).toHaveLength(1));
    await undoLastToast();
    await waitFor(() => expect(hook.result.current.sets).toHaveLength(2));
    expect(hook.result.current.sets[1]).toEqual(second);
    expect(hook.result.current.entry?.completedSets).toBe(2);

    // Finish the exercise, delete its last set, log it again, then tap the old Undo.
    for (let i = 0; i < 3; i++) await logSet(hook);
    await deleteSet(hook, hook.result.current.sets[4]);
    await waitFor(() => expect(hook.result.current.sets).toHaveLength(4));
    const staleUndo = toast.mock.calls.at(-1)![0] as ToastOptions;
    await logSet(hook);
    await act(async () => {
      await staleUndo.action!.onAction();
    });
    expect((await db.workouts.get(hook.result.current.session!.id))!.sets).toHaveLength(5);
    expect(toast).toHaveBeenLastCalledWith({
      message: "That set has been logged again, so the deleted one was not restored.",
    });
  });

  it("refuses to delete a set from the middle of an exercise and says why", async () => {
    const hook = await mount(await start());
    await logSet(hook);
    await logSet(hook);

    expect(await deleteSet(hook, hook.result.current.sets[0])).toBe(false);
    expect(hook.result.current.correctionError).toMatch(/Only the last set logged for an exercise/);
    expect(hook.result.current.sets).toHaveLength(2);
    expect(toast).not.toHaveBeenCalled();

    act(() => hook.result.current.clearCorrectionError());
    expect(hook.result.current.correctionError).toBeNull();
  });

  it("a corrected weight is not read as an accepted T2 load drop", async () => {
    const before = await liftState("bench");
    const sessionId = await start();
    const hook = await mount(sessionId);
    for (let i = 0; i < 5; i++) await logSet(hook);
    await logSet(hook);
    const firstBench = hook.result.current.sets[5];
    expect(firstBench).toMatchObject({ exerciseId: "bench", weight: 100 });

    await editSet(hook, firstBench, { weight: 95 });
    await waitFor(() => expect(hook.result.current.sets[5].weight).toBe(95));
    await logSet(hook);
    await logSet(hook);
    const bench = hook.result.current.sets.filter((s) => s.exerciseId === "bench");
    expect(bench.map((s) => [s.weight, s.status, s.originalWeight])).toEqual([
      [95, "completed", undefined],
      [95, "completed", undefined],
      [95, "completed", undefined],
    ]);

    // A real drop freezes T2 progression; this was a correction, so it progresses.
    await endAndFinish(hook);
    expect((await liftState("bench")).t2Weight).toBeGreaterThan(before.t2Weight);
  });

  it("keeps an accepted load drop's status when that set's reps are corrected", async () => {
    const hook = await mount(await start());
    for (let i = 0; i < 5; i++) await logSet(hook);
    await logSet(hook, { rpe: 9 });
    act(() => hook.result.current.acceptDrop());
    await logSet(hook);
    const dropped = hook.result.current.sets[6];
    expect(dropped.status).toBe("autoregulated_load_drop");

    await editSet(hook, dropped, { actualReps: 8 });
    await waitFor(() => expect(hook.result.current.sets[6].actualReps).toBe(8));
    expect(hook.result.current.sets[6]).toMatchObject({ status: "autoregulated_load_drop", originalWeight: 100 });
  });
});

describe("the plan of a workout in progress", () => {
  it("keeps the prescription it started with when lift states change mid-workout", async () => {
    const sessionId = await start();
    const first = await mount(sessionId);
    expect(workingPlan(first)).toEqual([
      "T1:squat:190:5x3",
      "T2:bench:100:3x10",
      "T3:lat_pulldown:90:3x15",
    ]);
    for (let i = 0; i < 5; i++) await logSet(first);
    await logSet(first);

    // Another screen changes the lifts while this workout is open.
    await adjust("squat", { t1Weight: 150, t1Stage: "6x2" });
    await adjust("bench", { t2Weight: 120, t2Stage: "3x8" });
    await adjust("lat_pulldown", { t3Weight: 60 });
    expect((await liftState("bench")).t2Weight).toBe(120);

    const second = await reload(first, sessionId);
    expect(workingPlan(second)).toEqual([
      "T1:squat:190:5x3",
      "T2:bench:100:3x10",
      "T3:lat_pulldown:90:3x15",
    ]);
    expect(second.result.current.entry).toMatchObject({ exerciseId: "bench", completedSets: 1, weight: 100 });
    expect(second.result.current.dropSuggestion).toBeNull();

    // No load drop is inferred from the changed weight.
    await logSet(second);
    expect(second.result.current.sets.at(-1)).toMatchObject({
      weight: 100,
      targetReps: 10,
      status: "completed",
      originalWeight: undefined,
    });
  });

  it("keeps the prescribed warm-ups and home substitute weights too", async () => {
    const sessionId = await start({ location: "home", includeWarmUps: true });
    const first = await mount(sessionId);
    const before = first.result.current.plan.map((e) => ({ ...e }));

    await adjust("squat", { t1Weight: 100 });
    await adjust("bench", { t2Weight: 40 });

    const second = await reload(first, sessionId);
    expect(second.result.current.plan).toEqual(before);
  });

  it("follows the current lift states when the session stored no prescription", async () => {
    const sessionId = await start();
    await db.workouts.update(sessionId, { prescribed: undefined });
    const first = await mount(sessionId);
    expect(workingPlan(first)[0]).toBe("T1:squat:190:5x3");

    await adjust("squat", { t1Weight: 150, t1Stage: "6x2" });

    const second = await reload(first, sessionId);
    expect(workingPlan(second)[0]).toBe("T1:squat:150:6x2");
  });
});
