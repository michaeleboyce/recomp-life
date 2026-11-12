import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeE1RM } from "@/lib/data/testUtils";
import { startWorkout, type StartWorkoutInput } from "@/lib/data/workouts";
import { evaluateT1Progression, evaluateT2Progression } from "@/lib/progression";
import { substituteModification } from "@/lib/workout";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { LiftState } from "@/types";
import { useActiveWorkout } from "./useActiveWorkout";

const describePrOpportunity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projection", () => ({ describePrOpportunity }));

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  useWorkoutStore.getState().reset();
  describePrOpportunity.mockReset();
  describePrOpportunity.mockReturnValue(null);
});

async function start(overrides: Partial<StartWorkoutInput> = {}): Promise<string> {
  return startWorkout({
    templateId: "A1",
    location: "gym",
    includeWarmUps: true,
    selectedAccessories: [],
    ...overrides,
  });
}

async function mount(sessionId: string) {
  const hook = renderHook(() => useActiveWorkout(sessionId));
  await waitFor(() => expect(hook.result.current.status).toBe("active"));
  return hook;
}

type Hook = Awaited<ReturnType<typeof mount>>;

/** Logs the set on screen (at target unless told otherwise) and skips any rest. */
async function logSet(hook: Hook, options: { reps?: number; rpe?: number } = {}) {
  const before = hook.result.current.sets.length;
  if (options.reps != null) act(() => hook.result.current.setSelectedReps(options.reps!));
  if (options.rpe != null) act(() => hook.result.current.setSelectedRPE(options.rpe!));
  await act(() => hook.result.current.logSet());
  await waitFor(() => expect(hook.result.current.sets.length).toBe(before + 1));
  await waitFor(() => expect(hook.result.current.isSaving).toBe(false));
  act(() => useWorkoutStore.getState().skipRest());
}

async function logEverything(hook: Hook) {
  while (hook.result.current.status === "active") {
    await logSet(hook);
  }
  expect(hook.result.current.status).toBe("complete");
}

async function liftStatesById(): Promise<Record<string, LiftState>> {
  return Object.fromEntries((await db.liftStates.toArray()).map((ls) => [ls.exerciseId, ls]));
}

describe("a full A1 workout at the gym with warm-ups", () => {
  it("walks the plan in order, pre-selecting the target reps", async () => {
    const hook = await mount(await start());
    const { plan, entry, selectedReps, activeIndex } = hook.result.current;

    expect(plan.map((e) => `${e.tier}:${e.exerciseId}:${e.weight}x${e.targetReps}`)).toEqual([
      "warmup:squat:45x10",
      "warmup:squat:95x5",
      "warmup:squat:135x3",
      "warmup:squat:160x1",
      "T1:squat:190x3",
      "T2:bench:100x10",
      "T3:lat_pulldown:90x15",
    ]);
    expect(activeIndex).toBe(0);
    expect(entry?.isWarmUp).toBe(true);
    expect(selectedReps).toBe(10);
  });

  it("leaves the same lift states, sets, e1RM rows and workout row as before the rewrite", async () => {
    const before = await liftStatesById();
    const equipment = (await db.userProfile.toCollection().first())!.settings.equipment;
    const sessionId = await start();
    const hook = await mount(sessionId);

    await logEverything(hook);
    let saved = false;
    await act(async () => {
      saved = await hook.result.current.finish();
    });
    expect(saved).toBe(true);

    // Sets: 4 warm-ups, 5 squat, 3 bench, 3 pulldown, each written to `sets` and
    // mirrored on the workout row.
    const workout = (await db.workouts.get(sessionId))!;
    const storedSets = await db.sets.toArray();
    expect(workout.sets).toHaveLength(15);
    expect(storedSets.map((s) => s.id).sort()).toEqual(workout.sets.map((s) => s.id).sort());
    expect(
      workout.sets.map((s) => [s.tier, s.exerciseId, s.setNumber, s.weight, s.actualReps, s.isAMRAP])
    ).toEqual([
      ["warmup", "squat", 1, 45, 10, false],
      ["warmup", "squat", 1, 95, 5, false],
      ["warmup", "squat", 1, 135, 3, false],
      ["warmup", "squat", 1, 160, 1, false],
      ["T1", "squat", 1, 190, 3, false],
      ["T1", "squat", 2, 190, 3, false],
      ["T1", "squat", 3, 190, 3, false],
      ["T1", "squat", 4, 190, 3, false],
      ["T1", "squat", 5, 190, 3, true],
      ["T2", "bench", 1, 100, 10, false],
      ["T2", "bench", 2, 100, 10, false],
      ["T2", "bench", 3, 100, 10, false],
      ["T3", "lat_pulldown", 1, 90, 15, false],
      ["T3", "lat_pulldown", 2, 90, 15, false],
      ["T3", "lat_pulldown", 3, 90, 15, true],
    ]);
    for (const set of workout.sets) {
      expect(set).toMatchObject({
        status: "completed",
        location: "gym",
        isSubstituted: false,
        restAfterSeconds: 0,
        synced: false,
      });
      expect(set.rpe).toBeUndefined();
      expect(set.originalWeight).toBeUndefined();
    }

    // Workout row.
    expect(workout.completedAt).toBeInstanceOf(Date);
    expect(workout.endedEarly).toBeUndefined();
    expect(workout.totalDurationSeconds).toBeGreaterThanOrEqual(0);
    expect(workout.synced).toBe(false);

    // One e1RM row, for the squat AMRAP set: 190 x 3 -> round(190 * 1.1) = 209.
    const e1rms = await db.estimated1RMs.toArray();
    expect(e1rms).toHaveLength(1);
    expect(e1rms[0]).toMatchObject({
      exerciseId: "squat",
      workingWeight: 190,
      repsCompleted: 3,
      estimated1RM: 209,
      workoutSessionId: sessionId,
      synced: false,
    });

    // Lift states: what the previous page's completion handler wrote.
    const after = await liftStatesById();
    const squatSets = workout.sets.filter((s) => s.exerciseId === "squat" && s.tier === "T1");
    const benchSets = workout.sets.filter((s) => s.exerciseId === "bench" && s.tier === "T2");
    expect(after.squat).toEqual({
      ...evaluateT1Progression(before.squat, squatSets, "gym", equipment, "lower"),
      t1LastWorkoutDate: workout.completedAt,
      recentE1RMs: [209],
      recentAvgRPEs: [],
      recentAMRAPReps: [3],
      synced: false,
    });
    expect(after.bench).toEqual({
      ...evaluateT2Progression(before.bench, benchSets, "gym", equipment, "upper"),
      t2LastWorkoutDate: workout.completedAt,
      recentE1RMs: [],
      recentAvgRPEs: [],
      recentAMRAPReps: [],
      synced: false,
    });
    expect(after.squat.t1Weight).toBe(200);
    expect(after.squat.t1Stage).toBe("5x3");
    expect(after.bench.t2Weight).toBe(105);
    // T3 and untouched lifts do not change.
    expect(after.lat_pulldown).toEqual(before.lat_pulldown);
    expect(after.deadlift).toEqual(before.deadlift);
    expect(after.ohp).toEqual(before.ohp);
  });

  it("records RPE and uses it for the e1RM estimate", async () => {
    const sessionId = await start({ includeWarmUps: false });
    const hook = await mount(sessionId);
    for (let i = 0; i < 4; i++) await logSet(hook, { rpe: 8 });
    await logSet(hook, { reps: 5, rpe: 9 });

    // 5 reps at RPE 9 = 1 rep in reserve: round(190 * (1 + 6 / 30)) = 228.
    const e1rms = await db.estimated1RMs.toArray();
    expect(e1rms.map((e) => e.estimated1RM)).toEqual([228]);
    expect(hook.result.current.e1rmFlash).toBe(228);

    await logEverything(hook);
    await act(async () => {
      await hook.result.current.finish();
    });
    const squat = (await liftStatesById()).squat;
    expect(squat.recentAvgRPEs).toEqual([(8 * 4 + 9) / 5]);
    expect(squat.recentAMRAPReps).toEqual([5]);
    expect(squat.recentE1RMs).toEqual([228]);
  });

  it("marks a set below target as failed and moves the T1 stage on finish", async () => {
    const hook = await mount(await start({ includeWarmUps: false }));
    await logSet(hook, { reps: 2 });
    expect(hook.result.current.sets[0].status).toBe("failed");
    await logEverything(hook);
    await act(async () => {
      await hook.result.current.finish();
    });
    const squat = (await liftStatesById()).squat;
    expect(squat.t1Weight).toBe(190);
    expect(squat.t1Stage).toBe("6x2");
  });
});

describe("a full A1 workout at home", () => {
  it("performs the default substitutes and progresses by the dumbbell increment", async () => {
    const before = await liftStatesById();
    const equipment = (await db.userProfile.toCollection().first())!.settings.equipment;
    const sessionId = await start({ location: "home" });
    const hook = await mount(sessionId);

    const working = hook.result.current.plan.filter((e) => !e.isWarmUp);
    expect(working.map((e) => [e.tier, e.exerciseId, e.substituteExerciseId, e.originalWeight])).toEqual([
      ["T1", "squat", working[0].substituteExerciseId, 190],
      ["T2", "bench", "db_bench", 100],
      ["T3", "lat_pulldown", working[2].substituteExerciseId, working[2].originalWeight],
    ]);
    expect(working[0].substituteExerciseId).toBeTruthy();
    // Warm-ups are generated for the T1 entry only, from the substitute's weight.
    const warmUps = hook.result.current.plan.filter((e) => e.isWarmUp);
    expect(warmUps.length).toBeGreaterThan(0);
    expect(warmUps.every((e) => e.exerciseId === "squat")).toBe(true);

    await logEverything(hook);
    await act(async () => {
      await hook.result.current.finish();
    });

    const workout = (await db.workouts.get(sessionId))!;
    const squatSets = workout.sets.filter((s) => s.exerciseId === "squat" && s.tier === "T1");
    const benchSets = workout.sets.filter((s) => s.exerciseId === "bench" && s.tier === "T2");
    expect(squatSets).toHaveLength(5);
    for (const set of squatSets) {
      expect(set).toMatchObject({
        isSubstituted: true,
        substituteExerciseId: working[0].substituteExerciseId,
        originalWeight: 190,
        weight: working[0].weight,
        location: "home",
        status: "completed",
      });
    }

    // Intended change: a substitute's AMRAP set records no e1RM for the barbell lift.
    expect(await db.estimated1RMs.count()).toBe(0);

    // Home-adapted workouts count as passes.
    const after = await liftStatesById();
    expect(after.squat).toEqual({
      ...evaluateT1Progression(before.squat, squatSets, "home", equipment, "lower"),
      t1LastWorkoutDate: workout.completedAt,
      recentE1RMs: [],
      recentAvgRPEs: [],
      recentAMRAPReps: [3],
      synced: false,
    });
    expect(after.bench).toEqual({
      ...evaluateT2Progression(before.bench, benchSets, "home", equipment, "upper"),
      t2LastWorkoutDate: workout.completedAt,
      recentE1RMs: [],
      recentAvgRPEs: [],
      recentAMRAPReps: [],
      synced: false,
    });
    expect(after.squat.t1Weight).toBe(195);
    expect(after.bench.t2Weight).toBe(105);
  });

  it("performs the substitute that was chosen on Configure", async () => {
    // Deadlift at 220 does not fit the seeded dumbbells, so Configure offers
    // alternatives; the default is db_rdl.
    const sessionId = await start({
      templateId: "B2",
      location: "home",
      includeWarmUps: false,
      modifications: [substituteModification("deadlift", "single_leg_db_rdl", 220, 80)],
    });
    const hook = await mount(sessionId);
    expect(hook.result.current.entry).toMatchObject({
      exerciseId: "deadlift",
      substituteExerciseId: "single_leg_db_rdl",
      originalWeight: 220,
    });

    await logSet(hook);
    expect(hook.result.current.sets[0]).toMatchObject({
      exerciseId: "deadlift",
      isSubstituted: true,
      substituteExerciseId: "single_leg_db_rdl",
    });
  });

  it("does not offer a PR line or record an e1RM for a substituted lift", async () => {
    describePrOpportunity.mockReturnValue({
      repsNeeded: 4,
      e1rmAtRepsNeeded: 230,
      bestE1RM: 220,
      chance: "likely",
    });
    await db.estimated1RMs.put(makeE1RM({ exerciseId: "squat", estimated1RM: 220 }));
    const sessionId = await start({ location: "home", includeWarmUps: false });
    const hook = await mount(sessionId);
    for (let i = 0; i < 4; i++) await logSet(hook);
    expect(hook.result.current.isAMRAPSet).toBe(true);
    expect(hook.result.current.prOpportunity).toBeNull();

    await logSet(hook, { reps: 6 });
    expect(await db.estimated1RMs.count()).toBe(1); // only the seeded row
    expect(hook.result.current.e1rmFlash).toBeNull();
  });
});

describe("PR opportunity", () => {
  it("passes the lift's best stored e1RM and recent AMRAP reps for the set on screen", async () => {
    describePrOpportunity.mockReturnValue({
      repsNeeded: 5,
      e1rmAtRepsNeeded: 222,
      bestE1RM: 220,
      chance: "likely",
    });
    await db.estimated1RMs.bulkPut([
      makeE1RM({ exerciseId: "squat", estimated1RM: 205 }),
      makeE1RM({ exerciseId: "squat", estimated1RM: 220 }),
      makeE1RM({ exerciseId: "bench", estimated1RM: 300 }),
    ]);
    await db.liftStates.update("squat", { recentAMRAPReps: [5, 4, 6] });
    const hook = await mount(await start({ includeWarmUps: false }));
    for (let i = 0; i < 4; i++) await logSet(hook);

    await waitFor(() => expect(hook.result.current.prOpportunity?.repsNeeded).toBe(5));
    expect(describePrOpportunity).toHaveBeenLastCalledWith({
      tier: "T1",
      isAMRAP: true,
      weight: 190,
      bestE1RM: 220,
      recentAMRAPReps: [5, 4, 6],
    });
  });
});

describe("resume", () => {
  it("resumes at the fourth set after three were logged and the page was reloaded", async () => {
    const sessionId = await start({ includeWarmUps: false });
    const first = await mount(sessionId);
    await logSet(first);
    await logSet(first);
    await logSet(first);
    first.unmount();
    // A reload loses everything held in memory.
    useWorkoutStore.getState().reset();

    const second = await mount(sessionId);
    expect(second.result.current.activeIndex).toBe(0);
    expect(second.result.current.entry).toMatchObject({
      exerciseId: "squat",
      tier: "T1",
      completedSets: 3,
      targetSets: 5,
    });
    expect(second.result.current.sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);

    await logSet(second);
    expect(second.result.current.sets.at(-1)).toMatchObject({ setNumber: 4, isAMRAP: false });
  });

  it("resumes inside the warm-ups", async () => {
    const sessionId = await start();
    const first = await mount(sessionId);
    await logSet(first);
    await logSet(first);
    first.unmount();
    useWorkoutStore.getState().reset();

    const second = await mount(sessionId);
    expect(second.result.current.activeIndex).toBe(2);
    expect(second.result.current.entry).toMatchObject({ isWarmUp: true, weight: 135 });
  });

  it("keeps the workout's own start time", async () => {
    const sessionId = await start();
    const startedAt = new Date(Date.now() - 20 * 60 * 1000);
    await db.workouts.update(sessionId, { startedAt });
    const hook = await mount(sessionId);
    expect(hook.result.current.workoutStartTime).toEqual(startedAt);
  });

  it("reports a finished workout instead of letting it be logged again", async () => {
    const sessionId = await start({ includeWarmUps: false });
    await db.workouts.update(sessionId, { completedAt: new Date() });
    const hook = renderHook(() => useActiveWorkout(sessionId));
    await waitFor(() => expect(hook.result.current.status).toBe("finished"));
  });

  it("reports a missing workout", async () => {
    const hook = renderHook(() => useActiveWorkout("nope"));
    await waitFor(() => expect(hook.result.current.status).toBe("missing"));
  });
});

describe("rest", () => {
  it("rests between sets of an entry for the tier's duration, and not after its last set", async () => {
    // Seeded phase is cutting: T1 rest is 180 + 30.
    const hook = await mount(await start({ includeWarmUps: false }));
    await act(() => hook.result.current.logSet());
    expect(useWorkoutStore.getState()).toMatchObject({
      isRestTimerActive: true,
      restTimerDuration: 210,
      restTier: "T1",
    });
    act(() => useWorkoutStore.getState().skipRest());
    await waitFor(() => expect(hook.result.current.entry?.completedSets).toBe(1));

    for (let i = 0; i < 3; i++) await logSet(hook);
    await act(() => hook.result.current.logSet());
    expect(useWorkoutStore.getState().isRestTimerActive).toBe(false);
    await waitFor(() => expect(hook.result.current.entry?.exerciseId).toBe("bench"));
  });
});

describe("T2 auto-regulation", () => {
  async function reachBench(sessionId: string) {
    const hook = await mount(sessionId);
    for (let i = 0; i < 5; i++) await logSet(hook);
    expect(hook.result.current.entry?.exerciseId).toBe("bench");
    return hook;
  }

  it("suggests a drop after a hard first set and applies an accepted drop to the remaining sets", async () => {
    const sessionId = await start({ includeWarmUps: false });
    const hook = await reachBench(sessionId);
    expect(hook.result.current.dropSuggestion).toBeNull();

    await logSet(hook, { rpe: 9 });
    expect(hook.result.current.dropSuggestion).toEqual({ reducedWeight: 95, rpe: 9 });

    act(() => hook.result.current.acceptDrop());
    expect(hook.result.current.dropSuggestion).toBeNull();
    expect(hook.result.current.entry?.weight).toBe(95);

    await logSet(hook);
    await logSet(hook);
    const bench = hook.result.current.sets.filter((s) => s.exerciseId === "bench");
    expect(bench.map((s) => [s.weight, s.status, s.originalWeight])).toEqual([
      [100, "completed", undefined],
      [95, "autoregulated_load_drop", 100],
      [95, "autoregulated_load_drop", 100],
    ]);

    // An accepted drop freezes T2 progression.
    await logEverything(hook);
    await act(async () => {
      await hook.result.current.finish();
    });
    const bench2 = (await liftStatesById()).bench;
    expect(bench2.t2Weight).toBe(100);
    expect(bench2.t2Stage).toBe("3x10");
  });

  it("an accepted drop survives a reload", async () => {
    const sessionId = await start({ includeWarmUps: false });
    const first = await reachBench(sessionId);
    await logSet(first, { rpe: 9 });
    act(() => first.result.current.acceptDrop());
    await logSet(first);
    first.unmount();
    useWorkoutStore.getState().reset();

    const second = await mount(sessionId);
    expect(second.result.current.entry).toMatchObject({
      exerciseId: "bench",
      completedSets: 2,
      weight: 95,
    });
    expect(second.result.current.dropSuggestion).toBeNull();
    await logSet(second);
    expect(second.result.current.sets.at(-1)).toMatchObject({
      weight: 95,
      status: "autoregulated_load_drop",
      originalWeight: 100,
    });
  });

  it("keeps the weight when the suggestion is declined, and offers it again after a reload", async () => {
    const sessionId = await start({ includeWarmUps: false });
    const first = await reachBench(sessionId);
    await logSet(first, { rpe: 9.5 });
    act(() => first.result.current.keepWeight());
    expect(first.result.current.dropSuggestion).toBeNull();
    expect(first.result.current.entry?.weight).toBe(100);
    first.unmount();
    useWorkoutStore.getState().reset();

    const second = await mount(sessionId);
    expect(second.result.current.dropSuggestion).toEqual({ reducedWeight: 95, rpe: 9.5 });
    await logSet(second);
    expect(second.result.current.sets.at(-1)).toMatchObject({ weight: 100, status: "completed" });
    expect(second.result.current.dropSuggestion).toBeNull();
  });

  it("makes no suggestion below the phase threshold", async () => {
    const hook = await reachBench(await start({ includeWarmUps: false }));
    await logSet(hook, { rpe: 8.5 });
    expect(hook.result.current.dropSuggestion).toBeNull();
  });
});

describe("jumping, ending early and discarding", () => {
  it("jumps to another exercise and comes back to what was skipped", async () => {
    const hook = await mount(await start());
    // Straight to the squat working sets (index 4), skipping the warm-ups.
    act(() => hook.result.current.jumpTo(5));
    expect(hook.result.current.entry?.exerciseId).toBe("bench");
    for (let i = 0; i < 3; i++) await logSet(hook);
    // Carries on down the plan, then returns to the skipped squat.
    expect(hook.result.current.entry?.exerciseId).toBe("lat_pulldown");
    for (let i = 0; i < 3; i++) await logSet(hook);
    expect(hook.result.current.status).toBe("active");
    expect(hook.result.current.entry).toMatchObject({ exerciseId: "squat", isWarmUp: true });
  });

  it("does not come back to warm-ups once their exercise has been started", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.jumpTo(4));
    for (let i = 0; i < 5; i++) await logSet(hook);
    for (let i = 0; i < 6; i++) await logSet(hook);
    expect(hook.result.current.status).toBe("complete");
  });

  it("ending early freezes a partly done lift and flags the workout", async () => {
    const before = await liftStatesById();
    const sessionId = await start({ includeWarmUps: false });
    const hook = await mount(sessionId);
    await logSet(hook);
    await logSet(hook);
    act(() => hook.result.current.endEarly());
    expect(hook.result.current.status).toBe("complete");
    await act(async () => {
      await hook.result.current.finish();
    });

    const workout = (await db.workouts.get(sessionId))!;
    expect(workout.endedEarly).toBe(true);
    expect(workout.completedAt).toBeInstanceOf(Date);
    const after = await liftStatesById();
    expect(after.squat).toEqual({
      ...before.squat,
      t1LastWorkoutDate: workout.completedAt,
      synced: false,
    });
    expect(after.bench).toEqual(before.bench);
  });

  it("discarding removes the workout, its sets and its e1RM rows", async () => {
    await db.estimated1RMs.put(makeE1RM({ id: "older", workoutSessionId: "another" }));
    const sessionId = await start({ includeWarmUps: false });
    const hook = await mount(sessionId);
    for (let i = 0; i < 5; i++) await logSet(hook);
    expect(await db.sets.count()).toBe(5);
    expect(await db.estimated1RMs.count()).toBe(2);

    await act(() => hook.result.current.discard());

    expect(await db.workouts.get(sessionId)).toBeUndefined();
    expect(await db.sets.count()).toBe(0);
    expect((await db.estimated1RMs.toArray()).map((e) => e.id)).toEqual(["older"]);
    expect(useWorkoutStore.getState().sessionId).toBeNull();
    await waitFor(() => expect(hook.result.current.status).toBe("missing"));
  });
});
