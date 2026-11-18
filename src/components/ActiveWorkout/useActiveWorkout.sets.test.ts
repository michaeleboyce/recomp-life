// H10 and H11 in the workout in progress: a weight per set (planned in Edit workout, or
// changed on the spot) and drop sets. Everything goes through the real data layer on
// fake-indexeddb.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { startWorkout, type StartWorkoutInput } from "@/lib/data/workouts";
import { getRestSeconds } from "@/lib/restTimes";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { PlanEdit, PlannedSet, SetLog } from "@/types";
import { useActiveWorkout } from "./useActiveWorkout";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/projection", () => ({ describePrOpportunity: () => null }));

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  useWorkoutStore.getState().reset();
});

/** Two ramp sets in front of the program's 5x3 at 190 (the A1 squat). */
const RAMP: PlannedSet[] = [
  { weight: 150, reps: 3, role: "ramp" },
  { weight: 170, reps: 3, role: "ramp" },
  ...Array.from({ length: 5 }, () => ({ weight: 190, reps: 3 })),
];
const RAMP_EDIT: PlanEdit = { kind: "setWeights", exerciseId: "squat", tier: "T1", sets: RAMP };

async function start(overrides: Partial<StartWorkoutInput> = {}): Promise<string> {
  return startWorkout({
    templateId: "A1",
    location: "gym",
    includeWarmUps: false,
    selectedAccessories: [],
    ...overrides,
  });
}

async function mount(sessionId: string, tapGuardMs = 0) {
  const hook = renderHook(() => useActiveWorkout(sessionId, { tapGuardMs }));
  await waitFor(() => expect(hook.result.current.status).toBe("active"));
  return hook;
}

type Hook = Awaited<ReturnType<typeof mount>>;

const resting = () => useWorkoutStore.getState().isRestTimerActive;

async function waitForSets(hook: Hook, count: number) {
  await waitFor(() => expect(hook.result.current.sets).toHaveLength(count));
  await waitFor(() => expect(hook.result.current.isSaving).toBe(false));
}

async function logSet(hook: Hook, options: { reps?: number; keepResting?: boolean } = {}) {
  const before = hook.result.current.sets.length;
  if (options.reps != null) act(() => hook.result.current.setSelectedReps(options.reps!));
  await act(() => hook.result.current.logSet());
  await waitForSets(hook, before + 1);
  if (!options.keepResting) act(() => useWorkoutStore.getState().skipRest());
}

async function logDrop(hook: Hook, options: { weight?: number; reps?: number } = {}) {
  const before = hook.result.current.sets.length;
  if (options.weight != null) act(() => hook.result.current.setDropWeight(options.weight!));
  if (options.reps != null) act(() => hook.result.current.setDropReps(options.reps!));
  await act(() => hook.result.current.logDropSet());
  await waitForSets(hook, before + 1);
}

const squatRows = (hook: Hook): SetLog[] =>
  hook.result.current.sets.filter((s) => s.exerciseId === "squat" && s.tier === "T1");

async function reload(hook: Hook, sessionId: string): Promise<Hook> {
  hook.unmount();
  useWorkoutStore.getState().reset();
  return mount(sessionId);
}

describe("a weight per set, planned before the workout", () => {
  it("logs a ramp set by set at each one's own weight and role, and judges the pass on the working sets", async () => {
    const sessionId = await start({ planEdits: [RAMP_EDIT] });
    const hook = await mount(sessionId);
    expect(hook.result.current.planEntry).toMatchObject({ targetSets: 7, weight: 190 });
    expect(hook.result.current.setChips.map((c) => `${c.weight}:${c.role}`)).toEqual([
      "150:ramp",
      "170:ramp",
      "190:work",
      "190:work",
      "190:work",
      "190:work",
      "190:work",
    ]);

    const shown: number[] = [];
    for (let i = 0; i < 7; i++) {
      shown.push(hook.result.current.entry!.weight);
      await logSet(hook);
    }
    expect(shown).toEqual([150, 170, 190, 190, 190, 190, 190]);
    expect(squatRows(hook).map((s) => [s.setNumber, s.weight, s.role ?? "work", s.isAMRAP])).toEqual([
      [1, 150, "ramp", false],
      [2, 170, "ramp", false],
      [3, 190, "work", false],
      [4, 190, "work", false],
      [5, 190, "work", false],
      [6, 190, "work", false],
      [7, 190, "work", true],
    ]);

    while (hook.result.current.status === "active") await logSet(hook);
    await act(async () => {
      await hook.result.current.finish();
    });
    const squat = await db.liftStates.get("squat");
    // Passed at 190: up a step, same stage.
    expect(squat).toMatchObject({ t1Weight: 200, t1Stage: "5x3" });
  });

  it("does not offer the T2 load drop on a lift whose sets the lifter set one by one", async () => {
    const sessionId = await start({
      planEdits: [
        {
          kind: "setWeights",
          exerciseId: "bench",
          tier: "T2",
          sets: [
            { weight: 100, reps: 10 },
            { weight: 100, reps: 10 },
            { weight: 100, reps: 10 },
          ],
        },
      ],
    });
    const hook = await mount(sessionId);
    while (hook.result.current.entry?.exerciseId !== "bench") await logSet(hook);
    act(() => hook.result.current.setSelectedRepsInReserve("0"));
    await logSet(hook);
    expect(hook.result.current.dropSuggestion).toBeNull();
  });
});

describe("the next set's weight, changed on the spot", () => {
  it("changes that set alone on a per-set lift", async () => {
    const hook = await mount(await start({ planEdits: [RAMP_EDIT] }));
    act(() => hook.result.current.setNextWeight(155));
    expect(hook.result.current.entry!.weight).toBe(155);
    expect(hook.result.current.setChips[0]).toMatchObject({ weight: 155, state: "current" });
    await logSet(hook);
    expect(squatRows(hook)[0]).toMatchObject({ weight: 155, role: "ramp" });
    expect(hook.result.current.entry!.weight).toBe(170);
    expect(hook.result.current.weightOverride).toBeNull();
  });

  it("changes that set alone on a lift with one weight for every set: the next is back at the plan's", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.setNextWeight(185));
    await logSet(hook);
    expect(squatRows(hook)[0].weight).toBe(185);
    expect(hook.result.current.entry!.weight).toBe(190);
    expect(hook.result.current.setChips.map((c) => c.weight)).toEqual([185, 190, 190, 190, 190]);
  });

  it("still carries on at a weight corrected after logging", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.setNextWeight(185));
    await logSet(hook);
    await act(async () => {
      await hook.result.current.correctSet({
        kind: "editSet",
        workoutId: hook.result.current.session!.id,
        setId: squatRows(hook)[0].id,
        patch: { weight: 180 },
      });
    });
    await waitFor(() => expect(hook.result.current.entry!.weight).toBe(180));
  });

  it("goes back to the planned weight and never below the empty bar", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.setNextWeight(20));
    expect(hook.result.current.entry!.weight).toBe(45);
    act(() => hook.result.current.setNextWeight(null));
    expect(hook.result.current.entry!.weight).toBe(190);
  });

  it("never above the heaviest dumbbell at home", async () => {
    const hook = await mount(await start({ location: "home" }));
    const max = (await db.userProfile.toCollection().first())!.settings.equipment.maxDumbbellWeight;
    expect(hook.result.current.maxWeight).toBe(max);
    act(() => hook.result.current.setNextWeight(max + 50));
    expect(hook.result.current.entry!.weight).toBe(max);
  });
});

describe("any set still to come, changed on its own (E8)", () => {
  it("changes a later set alone, shows it on its chip, and logs it at that weight when it comes", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.setSetWeight(2, 200));
    expect(hook.result.current.entry!.weight).toBe(190);
    expect(hook.result.current.weightOverride).toBeNull();
    expect(hook.result.current.setChips.map((c) => [c.weight, c.changed])).toEqual([
      [190, false],
      [190, false],
      [200, true],
      [190, false],
      [190, false],
    ]);

    await logSet(hook);
    await logSet(hook);
    expect(hook.result.current.entry!.weight).toBe(200);
    expect(hook.result.current.weightOverride).toBe(200);
    await logSet(hook);
    expect(hook.result.current.entry!.weight).toBe(190);
    await logSet(hook);
    await logSet(hook);
    expect(squatRows(hook).map((s) => s.weight)).toEqual([190, 190, 200, 190, 190]);
  });

  it("changes several sets each on its own, and puts one back to plan", async () => {
    const hook = await mount(await start({ planEdits: [RAMP_EDIT] }));
    act(() => hook.result.current.setSetWeight(1, 175));
    act(() => hook.result.current.setSetWeight(6, 200));
    act(() => hook.result.current.setSetWeight(1, null));
    expect(hook.result.current.setChips.map((c) => c.weight)).toEqual([150, 170, 190, 190, 190, 190, 200]);
    for (let i = 0; i < 7; i++) await logSet(hook);
    expect(squatRows(hook).map((s) => [s.weight, s.role ?? "work"])).toEqual([
      [150, "ramp"],
      [170, "ramp"],
      [190, "work"],
      [190, "work"],
      [190, "work"],
      [190, "work"],
      [200, "work"],
    ]);
    expect(squatRows(hook).at(-1)?.isAMRAP).toBe(true);
  });

  it("never sets a weight below the lightest, and leaves done sets alone", async () => {
    const hook = await mount(await start());
    await logSet(hook);
    act(() => hook.result.current.setSetWeight(0, 100));
    act(() => hook.result.current.setSetWeight(3, 20));
    expect(hook.result.current.setChips.map((c) => c.weight)).toEqual([190, 190, 190, 45, 190]);
  });

  it("keeps each entry's changes to that entry", async () => {
    const hook = await mount(await start());
    act(() => hook.result.current.setSetWeight(1, 200));
    act(() => hook.result.current.jumpTo(1));
    await waitFor(() => expect(hook.result.current.activeIndex).toBe(1));
    expect(hook.result.current.setChips.some((c) => c.changed)).toBe(false);
    act(() => hook.result.current.jumpTo(0));
    await waitFor(() => expect(hook.result.current.activeIndex).toBe(0));
    expect(hook.result.current.setChips[1]).toMatchObject({ weight: 200, changed: true });
  });
});

describe("drop sets", () => {
  it("one set plus three drops logs four rows, each continuing the one before, and starts no rest timer", async () => {
    const hook = await mount(await start());
    await logSet(hook, { keepResting: true });
    expect(resting()).toBe(true);
    // 190 x 0.8 = 152 -> 150.
    expect(hook.result.current.dropPreview).toBe(150);

    act(() => hook.result.current.startDropSet());
    expect(resting()).toBe(false);
    expect(hook.result.current.dropSet).toMatchObject({ weight: 150, reps: 3 });

    await logDrop(hook);
    expect(resting()).toBe(false);
    // 150 x 0.8 = 120.
    expect(hook.result.current.dropSet).toMatchObject({ weight: 120 });
    await logDrop(hook, { weight: 125, reps: 5 });
    await logDrop(hook, { reps: 4 });
    expect(resting()).toBe(false);

    const [set, d1, d2, d3] = squatRows(hook);
    expect(squatRows(hook)).toHaveLength(4);
    expect([d1, d2, d3].map((d) => [d.role, d.dropOf, d.weight, d.actualReps, d.setNumber])).toEqual([
      ["drop", set.id, 150, 3, 1],
      ["drop", d1.id, 125, 5, 1],
      ["drop", d2.id, 100, 4, 1],
    ]);
    expect(hook.result.current.dropSet?.drops.map((d) => d.id)).toEqual([d1.id, d2.id, d3.id]);
    // Drops are not sets of the lift: set 2 of 5 is next.
    expect(hook.result.current.planEntry).toMatchObject({ completedSets: 1, weight: 190 });

    act(() => hook.result.current.endDropSets());
    expect(hook.result.current.dropSet).toBeNull();
    expect(resting()).toBe(true);
    expect(useWorkoutStore.getState().restTimerDuration).toBe(
      getRestSeconds("T1", hook.result.current.trainingPhase)
    );
  });

  it("survive a reload, as do the per-set weights", async () => {
    const sessionId = await start({ planEdits: [RAMP_EDIT] });
    let hook = await mount(sessionId);
    await logSet(hook, { keepResting: true });
    act(() => hook.result.current.startDropSet());
    await logDrop(hook);

    hook = await reload(hook, sessionId);
    expect(hook.result.current.planEntry).toMatchObject({ completedSets: 1, targetSets: 7 });
    expect(hook.result.current.entry!.weight).toBe(170);
    expect(hook.result.current.setChips[0]).toMatchObject({ state: "done", weight: 150, drops: 1 });
  });

  it("a missed drop after the last working set does not turn the pass into a fail", async () => {
    const hook = await mount(await start());
    for (let i = 0; i < 4; i++) await logSet(hook);
    await logSet(hook, { reps: 6, keepResting: true });
    act(() => hook.result.current.startDropSet());
    await logDrop(hook, { reps: 0 });
    expect(squatRows(hook).at(-1)).toMatchObject({ role: "drop", status: "failed" });
    act(() => hook.result.current.endDropSets());
    act(() => useWorkoutStore.getState().skipRest());

    while (hook.result.current.status === "active") await logSet(hook);
    await act(async () => {
      await hook.result.current.finish();
    });
    expect(await db.liftStates.get("squat")).toMatchObject({ t1Weight: 200, t1Stage: "5x3" });
  });

  it("can follow the last set of the workout, and then nothing rests", async () => {
    const hook = await mount(await start());
    while (hook.result.current.status === "active") await logSet(hook);
    expect(hook.result.current.status).toBe("complete");
    // Lat pulldown 90: 72 -> 70.
    expect(hook.result.current.dropPreview).toBe(70);
    act(() => hook.result.current.startDropSet());
    await logDrop(hook);
    act(() => hook.result.current.endDropSets());
    expect(resting()).toBe(false);
    expect(hook.result.current.status).toBe("complete");
    expect(hook.result.current.sets.at(-1)).toMatchObject({ role: "drop", exerciseId: "lat_pulldown", weight: 70 });
  });

  it("is offered only after a set that has a lighter load to drop to", async () => {
    const hook = await mount(await start({ includeWarmUps: true }));
    await logSet(hook);
    // The last set was a warm-up.
    expect(hook.result.current.dropPreview).toBeNull();
    act(() => hook.result.current.startDropSet());
    expect(hook.result.current.dropSet).toBeNull();
  });

  it("ignores a Drop tapped straight after logging, as a double tap", async () => {
    const hook = await mount(await start(), 700);
    await act(() => hook.result.current.logSet());
    await waitForSets(hook, 1);
    act(() => hook.result.current.startDropSet());
    expect(hook.result.current.dropSet).toBeNull();
  });

  it("makes the drop the set that can be deleted, not the set it continues", async () => {
    const hook = await mount(await start());
    await logSet(hook, { keepResting: true });
    act(() => hook.result.current.startDropSet());
    await logDrop(hook);
    act(() => hook.result.current.endDropSets());
    const [set, drop] = squatRows(hook);

    const deleteSet = async (target: SetLog) => {
      let saved = false;
      await act(async () => {
        saved = await hook.result.current.correctSet({
          kind: "deleteSet",
          workoutId: hook.result.current.session!.id,
          setId: target.id,
        });
      });
      return saved;
    };
    expect(await deleteSet(set)).toBe(false);
    expect(hook.result.current.correctionError).toMatch(/Only the last set/);
    expect(await deleteSet(drop)).toBe(true);
    await waitFor(() => expect(squatRows(hook)).toHaveLength(1));
  });
});
