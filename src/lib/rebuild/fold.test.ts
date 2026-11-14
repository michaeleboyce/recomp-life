import { describe, expect, it } from "vitest";
import { SETTINGS, makeSession, makeSet, makeSets } from "@/lib/workout/testFixtures";
import type { UserSettings } from "@/types";
import { anchorToPrescription, applyChange, e1rmsForWorkout, emptyLiftState, rebuildDerived } from "./index";
import {
  FAIL,
  PARTIAL,
  SIM_START,
  adjust,
  makeAdjustment,
  rebuildInput,
  runSession,
  startAdjustments,
  startSim,
  stateOf,
} from "./testHelpers";

const rebuilt = (sim: ReturnType<typeof startSim>, settings?: UserSettings) =>
  rebuildDerived(rebuildInput(sim, settings));

describe("rebuildDerived: starting point", () => {
  it("gives every program lift an empty state when the log is empty", () => {
    const { liftStates, e1rms, snapshots } = rebuildDerived({
      workouts: [],
      adjustments: [],
      settings: SETTINGS,
    });
    expect(liftStates.map((ls) => ls.exerciseId)).toEqual([
      "bench",
      "db_row",
      "deadlift",
      "lat_pulldown",
      "ohp",
      "squat",
    ]);
    expect(stateOf(liftStates, "squat")).toEqual(emptyLiftState("squat"));
    expect(liftStates.every((ls) => ls.synced && ls.clientId === ls.exerciseId)).toBe(true);
    expect(e1rms).toEqual([]);
    expect(snapshots.size).toBe(0);
  });

  it("starts from the start adjustments and adds lifts an adjustment names", () => {
    const { liftStates } = rebuildDerived({
      workouts: [],
      adjustments: [
        ...startAdjustments(),
        makeAdjustment("goblet_squat", { t3Weight: 40 }, SIM_START),
      ],
      settings: SETTINGS,
    });
    expect(stateOf(liftStates, "squat")).toMatchObject({ t1Weight: 190, t2Weight: 135 });
    expect(stateOf(liftStates, "lat_pulldown").t3Weight).toBe(90);
    expect(stateOf(liftStates, "goblet_squat").t3Weight).toBe(40);
    expect(liftStates.map((ls) => ls.exerciseId)).toEqual(
      [...liftStates.map((ls) => ls.exerciseId)].sort()
    );
  });
});

describe("rebuildDerived: T1", () => {
  it("adds twice the barbell increment to a lower-body lift on a pass", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1" });
    const squat = stateOf(rebuilt(sim).liftStates, "squat");
    expect(squat).toMatchObject({ t1Weight: 200, t1Stage: "5x3", t1FailCount: 0 });
    expect(squat.t1LastWorkoutDate).toEqual(w.completedAt);
    expect(squat.recentAMRAPReps).toEqual([3]);
  });

  it("adds one barbell increment to an upper-body lift on a pass", () => {
    const sim = startSim();
    runSession(sim, { templateId: "B1" });
    expect(stateOf(rebuilt(sim).liftStates, "ohp").t1Weight).toBe(90);
  });

  it("walks the fail cascade 5x3 -> 6x2 -> 10x1 -> reset", () => {
    const sim = startSim();
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      runSession(sim, { templateId: "A1", t1: FAIL });
      const s = stateOf(rebuilt(sim).liftStates, "squat");
      seen.push([s.t1Weight, s.t1Stage, s.t1FailCount, s.t1LastResetWeight]);
    }
    expect(seen).toEqual([
      [190, "6x2", 1, null],
      [190, "10x1", 2, null],
      [160, "5x3", 0, 190],
      [160, "6x2", 1, 190],
    ]);
  });
});

describe("rebuildDerived: T2", () => {
  it("adds the increment on a pass", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    expect(stateOf(rebuilt(sim).liftStates, "bench")).toMatchObject({
      t2Weight: 105,
      t2Stage: "3x10",
    });
  });

  it("walks the fail cascade 3x10 -> 3x8 -> 3x6 -> reset", () => {
    const sim = startSim();
    const seen: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      runSession(sim, { templateId: "A1", t2: FAIL });
      const s = stateOf(rebuilt(sim).liftStates, "bench");
      seen.push([s.t2Weight, s.t2Stage, s.t2FailCount, s.t2LastResetWeight]);
    }
    expect(seen).toEqual([
      [100, "3x8", 1, null],
      [100, "3x6", 2, null],
      [85, "3x10", 0, 100],
    ]);
  });

  it("freezes the weight when a load drop was accepted", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", t2: { drop: true, rpe: 9.5 } });
    expect(w.sets.filter((s) => s.status === "autoregulated_load_drop")).toHaveLength(2);
    const bench = stateOf(rebuilt(sim).liftStates, "bench");
    expect(bench).toMatchObject({ t2Weight: 100, t2Stage: "3x10", t2FailCount: 0 });
    expect(bench.t2LastWorkoutDate).toEqual(w.completedAt);
  });
});

describe("rebuildDerived: partial, home, T3, late sets", () => {
  it("moves only the date for a partially completed exercise", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", t1: PARTIAL, t2: PARTIAL, t3: PARTIAL });
    const { liftStates } = rebuilt(sim);
    const squat = stateOf(liftStates, "squat");
    expect(squat).toMatchObject({ t1Weight: 190, t1Stage: "5x3", t1FailCount: 0 });
    expect(squat.t1LastWorkoutDate).toEqual(w.completedAt);
    expect(squat.recentAMRAPReps).toEqual([]);
    expect(stateOf(liftStates, "bench").t2Weight).toBe(100);
    expect(stateOf(liftStates, "lat_pulldown").t3Weight).toBe(90);
  });

  it("counts a home substitute session as a pass, with the dumbbell increment", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", location: "home" });
    const squatSets = w.sets.filter((s) => s.exerciseId === "squat");
    expect(squatSets.every((s) => s.isSubstituted)).toBe(true);
    const { liftStates, e1rms } = rebuilt(sim);
    expect(stateOf(liftStates, "squat")).toMatchObject({ t1Weight: 195, t1Stage: "5x3" });
    // A substitute's weight says nothing about the barbell lift.
    expect(e1rms).toEqual([]);
  });

  it("raises T3 when the last AMRAP set reaches 25, and not otherwise", () => {
    const hit = startSim();
    runSession(hit, { templateId: "A1", t3: { lastReps: 25 } });
    expect(stateOf(rebuilt(hit).liftStates, "lat_pulldown").t3Weight).toBe(95);

    // Cutting (the fixture phase): 15 + 15 + 24 = 54 total reps is not enough.
    const miss = startSim();
    runSession(miss, { templateId: "A1", t3: { lastReps: 24 } });
    expect(stateOf(rebuilt(miss).liftStates, "lat_pulldown").t3Weight).toBe(90);
  });

  it("counts a set added to the workout row after it was finished", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", t1: { sets: 4 } });
    expect(stateOf(rebuilt(sim).liftStates, "squat").t1Weight).toBe(190);

    const late = makeSet("squat", "T1", {
      id: "late",
      setNumber: 5,
      targetReps: 3,
      actualReps: 4,
      weight: 190,
      isAMRAP: true,
      completedAt: new Date(w.completedAt!.getTime() + 3_600_000),
    });
    const log = applyChange(sim, { kind: "addSet", workoutId: w.id, set: late });
    const { liftStates, e1rms } = rebuildDerived({ ...log, settings: SETTINGS });
    const squat = stateOf(liftStates, "squat");
    expect(squat.t1Weight).toBe(200);
    expect(squat.recentAMRAPReps).toEqual([4]);
    expect(e1rms.map((row) => row.id)).toEqual([`e1rm:${w.id}:late`]);
    // The late set's own estimate is part of the series stored at that workout.
    expect(squat.recentE1RMs).toEqual([e1rms[0].estimated1RM]);
  });
});

describe("rebuildDerived: what is ignored", () => {
  it("ignores a deleted workout and a deleted adjustment", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const w2 = runSession(sim, { templateId: "A1" });
    const input = rebuildInput(sim);
    const result = rebuildDerived({
      ...input,
      workouts: input.workouts.map((w) => (w.id === w2.id ? { ...w, deletedAt: 5 } : w)),
      adjustments: [
        ...input.adjustments,
        makeAdjustment("squat", { t1Weight: 500 }, new Date("2027-01-01T00:00:00Z"), {
          deletedAt: 9,
        }),
      ],
    });
    expect(stateOf(result.liftStates, "squat").t1Weight).toBe(200);
    expect(result.snapshots.has(w2.id)).toBe(false);
    expect(result.e1rms.every((row) => row.workoutSessionId !== w2.id)).toBe(true);
  });

  it("takes e1RM rows from an unfinished workout but no lift-state change", () => {
    const open = makeSession({
      id: "open",
      startedAt: new Date("2026-02-01T09:00:00Z"),
      sets: makeSets("squat", "T1", 5, 3, { weight: 190 }).map((s, i) => ({
        ...s,
        id: `open-${i + 1}`,
        isAMRAP: i === 4,
      })),
    });
    const { liftStates, e1rms, snapshots } = rebuildDerived({
      workouts: [open],
      adjustments: startAdjustments(),
      settings: SETTINGS,
    });
    expect(e1rms.map((row) => row.id)).toEqual(["e1rm:open:open-5"]);
    expect(stateOf(liftStates, "squat")).toMatchObject({
      t1Weight: 190,
      t1LastWorkoutDate: null,
    });
    expect(snapshots.size).toBe(0);
  });
});

describe("rebuildDerived: adjustments", () => {
  it("applies them in date order between workouts and after the last one", () => {
    const sim = startSim();
    const w1 = runSession(sim, { templateId: "A1" }); // squat 190 -> 200
    adjust(sim, "squat", { t1Weight: 150 }, new Date(w1.completedAt!.getTime() + 60_000));
    const w2 = runSession(sim, { templateId: "A1" }); // 150 -> 160
    expect(w2.sets[0].weight).toBe(150);
    adjust(sim, "squat", { t1Weight: 300, t1Stage: "6x2", t1FailCount: 1 }, new Date("2027-01-01T00:00:00Z"));

    // Rows arrive in no particular order.
    const input = rebuildInput(sim);
    const result = rebuildDerived({
      ...input,
      workouts: [...input.workouts].reverse(),
      adjustments: [...input.adjustments].reverse(),
    });
    expect(stateOf(result.snapshots.get(w1.id)!, "squat").t1Weight).toBe(200);
    expect(stateOf(result.snapshots.get(w2.id)!, "squat").t1Weight).toBe(160);
    expect(stateOf(result.liftStates, "squat")).toMatchObject({
      t1Weight: 300,
      t1Stage: "6x2",
      t1FailCount: 1,
    });
  });

  it("applies an adjustment without a stored prescription too", () => {
    const sim = startSim();
    const w1 = runSession(sim, { templateId: "A1" });
    adjust(sim, "squat", { t1Weight: 150 }, new Date(w1.completedAt!.getTime() + 60_000));
    runSession(sim, { templateId: "A1" });
    const workouts = sim.workouts.map((w) => ({ ...w, prescribed: undefined }));
    const result = rebuildDerived({ ...rebuildInput(sim), workouts });
    expect(stateOf(result.liftStates, "squat").t1Weight).toBe(160);
  });
});

describe("rebuildDerived: completion context", () => {
  const changed: UserSettings = {
    ...SETTINGS,
    trainingPhase: { ...SETTINGS.trainingPhase, mode: "bulking" },
    equipment: { ...SETTINGS.equipment, gymBarbellIncrementLbs: 10, dumbbellIncrementLbs: 10 },
  };

  it("uses the stored context over the current settings", () => {
    const sim = startSim();
    // 15 + 15 + 24 reps: an increase when bulking, none when cutting.
    runSession(sim, { templateId: "A1", t3: { lastReps: 24 } });
    const { liftStates } = rebuilt(sim, changed);
    expect(stateOf(liftStates, "squat").t1Weight).toBe(200);
    expect(stateOf(liftStates, "bench").t2Weight).toBe(105);
    expect(stateOf(liftStates, "lat_pulldown").t3Weight).toBe(90);
  });

  it("falls back to the current settings when no context is stored", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", t3: { lastReps: 24 } });
    const workouts = sim.workouts.map((w) => ({ ...w, completionContext: undefined }));
    const { liftStates } = rebuildDerived({ ...rebuildInput(sim, changed), workouts });
    expect(stateOf(liftStates, "squat").t1Weight).toBe(210);
    expect(stateOf(liftStates, "bench").t2Weight).toBe(110);
    expect(stateOf(liftStates, "lat_pulldown").t3Weight).toBe(95);
  });
});

describe("anchoring to the stored prescription", () => {
  it("resets the fail count to the anchored stage's place in the cascade", () => {
    const running = { ...emptyLiftState("squat"), t1Weight: 190, t1Stage: "6x2" as const, t1FailCount: 1, t1LastResetWeight: 220 };
    const entry = { exerciseId: "squat", tier: "T1" as const, weight: 200, sets: 5, reps: 3 };
    expect(anchorToPrescription(running, { ...entry, stage: "5x3" })).toMatchObject({
      t1Weight: 200,
      t1Stage: "5x3",
      t1FailCount: 0,
      t1LastResetWeight: 220,
    });
    expect(anchorToPrescription(running, { ...entry, sets: 10, reps: 1, stage: "10x1" }).t1FailCount).toBe(2);
    // Same stage: the running fail count is kept.
    expect(anchorToPrescription({ ...running, t1FailCount: 4 }, { ...entry, stage: "6x2" }).t1FailCount).toBe(4);
    // No stage stored: the reps identify it.
    expect(anchorToPrescription(running, { ...entry, sets: 10, reps: 1 }).t1Stage).toBe("10x1");
  });

  it("anchors T2 and T3 the same way", () => {
    const running = { ...emptyLiftState("bench"), t2Weight: 100, t2FailCount: 0, t3Weight: 20 };
    expect(
      anchorToPrescription(running, { exerciseId: "bench", tier: "T2", weight: 90, sets: 3, reps: 6, stage: "3x6" })
    ).toMatchObject({ t2Weight: 90, t2Stage: "3x6", t2FailCount: 2, t2LastResetWeight: null });
    expect(
      anchorToPrescription(running, { exerciseId: "bench", tier: "T3", weight: 35, sets: 3, reps: 15 }).t3Weight
    ).toBe(35);
  });

  it("evaluates a session at the stage it was prescribed, not the running one", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" }); // pass: 200 at 5x3
    const w2 = runSession(sim, { templateId: "A1", t1: FAIL }); // fail at 5x3 -> 6x2
    const w3 = runSession(sim, { templateId: "A1", t1: FAIL }); // fail at 6x2 -> 10x1
    expect(stateOf(rebuilt(sim).liftStates, "squat")).toMatchObject({ t1Stage: "10x1", t1FailCount: 2 });

    // Session 2 is corrected to a pass. Session 3 was still lifted as 6x2 at 200, so it
    // is evaluated as a failed 6x2: the next stage is 10x1 with two fails behind it.
    const lastSet = w2.sets.filter((s) => s.tier === "T1").at(-1)!;
    const log = applyChange(sim, {
      kind: "editSet",
      workoutId: w2.id,
      setId: lastSet.id,
      patch: { actualReps: 3 },
    });
    const result = rebuildDerived({ ...log, settings: SETTINGS });
    expect(stateOf(result.snapshots.get(w2.id)!, "squat")).toMatchObject({ t1Weight: 210, t1Stage: "5x3", t1FailCount: 0 });
    expect(stateOf(result.snapshots.get(w3.id)!, "squat")).toMatchObject({ t1Weight: 200, t1Stage: "10x1", t1FailCount: 2 });
  });

  it("does not anchor when no prescription is stored", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    runSession(sim, { templateId: "A1" });
    const workouts = sim.workouts.map((w) => ({ ...w, prescribed: undefined }));
    // Starting weights change underneath: without anchoring the sessions follow them.
    const adjustments = [makeAdjustment("squat", { t1Weight: 100 }, SIM_START)];
    const { liftStates } = rebuildDerived({ workouts, adjustments, settings: SETTINGS });
    expect(stateOf(liftStates, "squat").t1Weight).toBe(120);
  });
});

describe("e1rmsForWorkout", () => {
  it("writes one row per eligible set, shaped like the live path", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", t1: { lastReps: 5, rpe: 9 } });
    const amrap = w.sets.find((s) => s.tier === "T1" && s.isAMRAP)!;
    const rows = e1rmsForWorkout(w);
    expect(rows).toEqual([
      {
        id: `e1rm:${w.id}:${amrap.id}`,
        clientId: `e1rm:${w.id}:${amrap.id}`,
        date: amrap.completedAt,
        exerciseId: "squat",
        workingWeight: 190,
        repsCompleted: 5,
        estimated1RM: sim.e1rms[0].estimated1RM,
        workoutSessionId: w.id,
        setId: amrap.id,
        synced: true,
      },
    ]);
    expect(sim.e1rms).toHaveLength(1);
  });

  it("skips AMRAP sets under 2 reps, T2/T3 sets and substitutes", () => {
    const sim = startSim();
    const single = runSession(sim, { templateId: "A1", t1: { lastReps: 1 }, t3: { lastReps: 25 } });
    expect(e1rmsForWorkout(single)).toEqual([]);
    const home = runSession(sim, { templateId: "B1", location: "home" });
    expect(e1rmsForWorkout(home)).toEqual([]);
  });

  it("accepts ISO strings for stored dates", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1" });
    const asStored = JSON.parse(JSON.stringify(w));
    expect(e1rmsForWorkout(asStored)).toEqual(e1rmsForWorkout(w));
    expect(
      rebuildDerived({
        workouts: [asStored],
        adjustments: JSON.parse(JSON.stringify(sim.adjustments)),
        settings: SETTINGS,
      })
    ).toEqual(rebuilt(sim));
  });
});
