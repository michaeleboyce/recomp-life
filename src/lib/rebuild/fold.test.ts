import { describe, expect, it } from "vitest";
import { SETTINGS, makeSession, makeSet, makeSets } from "@/lib/workout/testFixtures";
import { BACK_TO_PLAN_NOTE } from "@/lib/workout/variant";
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
  variantOf,
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
    const w = runSession(sim, { templateId: "A1", t2: { drop: true, repsInReserve: "1-2" } });
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

  // 2026-11-15 (strength model, decision 1): a home pass used to raise the barbell
  // weight by the dumbbell step (squat 190 -> 195). It now raises the home exercise's own
  // weight and leaves the barbell lift as it was; the session still counts for the rotation.
  // 2026-11-16 (H3): the split squat's first weight is its starting ratio times the
  // barbell weight, 0.5 x 190 = 95, 47.5 a hand, rounded to 50 (it was 80% of it, 75).
  it("a home session progresses the home exercise's own weight and leaves the barbell lift alone (H1)", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", location: "home" });
    const squatSets = w.sets.filter((s) => s.exerciseId === "squat");
    expect(squatSets.every((s) => s.isSubstituted && s.weight === 50)).toBe(true);
    const { liftStates, e1rms, variantStates, variantOutcomes, outcomes } = rebuilt(sim);
    expect(stateOf(liftStates, "squat")).toMatchObject({ t1Weight: 190, t1Stage: "5x3", t1LastWorkoutDate: null });
    expect(variantOf(variantStates, "squat|bulgarian_split_squat|T1")).toMatchObject({
      weight: 55,
      perHand: true,
      stage: "5x3",
      current: true,
      passesSinceGym: 1,
      lastSessionDate: w.completedAt,
    });
    expect(outcomes.get(w.id)![0]).toMatchObject({ exerciseId: "squat", kind: "held", from: { weight: 190 }, to: { weight: 190 } });
    expect(variantOutcomes.get(w.id)![0]).toMatchObject({ variantId: "squat|bulgarian_split_squat|T1", kind: "passed", from: { weight: 50 }, to: { weight: 55 } });
    // A substitute's weight says nothing about the barbell lift.
    expect(e1rms).toEqual([]);
    // It counts for the rotation: B1 is next.
    expect(rebuilt(sim).snapshots.size).toBe(1);
  });

  it("two split squat passes raise it one dumbbell step each; the barbell weight does not move (H1)", () => {
    // The heaviest pair is 55: 50 -> 55 reaches it, and the second pass adds a rep instead.
    const sim = startSim({ ...SETTINGS, equipment: { ...SETTINGS.equipment, maxDumbbellWeight: 55 } });
    runSession(sim, { templateId: "A1", location: "home", t1: { lastReps: 6 } });
    runSession(sim, { templateId: "A1", location: "home", t1: { lastReps: 5 } });
    const { liftStates, variantStates, variantSnapshots } = rebuilt(sim);
    const split = "squat|bulgarian_split_squat|T1";
    expect(variantOf(variantSnapshots.get("w1")!, split).weight).toBe(55);
    expect(variantOf(variantStates, split)).toMatchObject({ weight: 55, extraReps: 1, recentLastSetReps: [6, 5], passesSinceGym: 2 });
    expect(stateOf(liftStates, "squat").t1Weight).toBe(190);

    const heavier = startSim({ ...SETTINGS, equipment: { ...SETTINGS.equipment, maxDumbbellWeight: 100 } });
    runSession(heavier, { templateId: "A1", location: "home" });
    runSession(heavier, { templateId: "A1", location: "home" });
    expect(variantOf(rebuilt(heavier).variantStates, split).weight).toBe(60);
    expect(stateOf(rebuilt(heavier).liftStates, "squat").t1Weight).toBe(190);
  });

  it("squat 245 with 80 lb dumbbells never plans goblet squat at 80 after a split squat pass at 80 a hand (H2)", () => {
    const sim = startSim();
    adjust(sim, "squat", { t1Weight: 245 }, new Date(SIM_START.getTime() + 1000));
    // The split squat set to 80 a hand by hand (a home exercise's own adjustment): its
    // seed from the ratio would be 60.
    sim.adjustments.push(
      makeAdjustment("squat", { t1Weight: 80 }, new Date(SIM_START.getTime() + 2000), {
        id: "adj-split",
        clientId: "adj-split",
        source: "manual",
        variant: { exerciseId: "bulgarian_split_squat", tier: "T1" },
      })
    );
    sim.variants = rebuilt(sim).variantStates;
    expect(stateOf(rebuilt(sim).liftStates, "squat").t1Weight).toBe(245);
    const first = runSession(sim, { templateId: "A1", location: "home" });
    expect(first.sets.find((s) => s.tier === "T1")).toMatchObject({ substituteExerciseId: "bulgarian_split_squat", weight: 80 });
    const second = runSession(sim, { templateId: "A1", location: "home" });
    const t1 = second.sets.filter((s) => s.tier === "T1");
    expect(t1.every((s) => s.substituteExerciseId === "bulgarian_split_squat" && s.weight === 80)).toBe(true);
    // The cap policy: 5x3 -> 5x4 at the heaviest pair.
    expect(t1.map((s) => s.targetReps)).toEqual([4, 4, 4, 4, 4]);
    expect(rebuilt(sim).variantOutcomes.get(first.id)![0].cap).toEqual({ policy: "reps", maxDumbbellWeight: 80, repsFrom: 3, repsTo: 4 });
  });

  it("an adjustment for a home exercise sets that exercise's own state, not the barbell lift's", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", location: "home" });
    runSession(sim, { templateId: "B1" });
    runSession(sim, { templateId: "A2" });
    runSession(sim, { templateId: "B2" });
    runSession(sim, { templateId: "A1" }); // a squat T1 pass at the gym: one step for the split squat
    const split = "squat|bulgarian_split_squat|T1";
    expect(variantOf(rebuilt(sim).variantStates, split)).toMatchObject({ weight: 55, gymPassesSinceHome: 1 });
    const at = new Date(sim.workouts.at(-1)!.completedAt!.getTime() + 60_000);
    sim.adjustments.push(
      makeAdjustment("squat", { t1Weight: 70, t1Stage: "6x2" }, at, {
        id: "adj-v",
        clientId: "adj-v",
        source: "manual",
        variant: { exerciseId: "bulgarian_split_squat", tier: "T1" },
      })
    );
    const after = rebuilt(sim);
    const state = variantOf(after.variantStates, split);
    expect(state).toMatchObject({ weight: 70, stage: "6x2" });
    // The weight is the user's: the gym steps are not added on top of it.
    expect(state.gymPassesSinceHome).toBeUndefined();
    expect(stateOf(after.liftStates, "squat")).toMatchObject({ t1Weight: 200, t1Stage: "5x3" });

    // One for a home exercise never done is seeded first, then set.
    sim.adjustments.push(
      makeAdjustment("squat", { t2Weight: 40 }, at, {
        id: "adj-w",
        clientId: "adj-w",
        source: "manual",
        variant: { exerciseId: "db_lunge", tier: "T2" },
      })
    );
    // The weight set for it makes it the lift's current home exercise at that tier.
    const final = rebuilt(sim).variantStates;
    expect(variantOf(final, "squat|db_lunge|T2")).toMatchObject({ weight: 40, current: true });
    expect(final.filter((v) => v.liftId === "squat" && v.tier === "T2" && v.current).map((v) => v.id)).toEqual([
      "squat|db_lunge|T2",
    ]);
    // And the split squat, whose weight was set last at T1, is current there.
    expect(variantOf(final, split)).toMatchObject({ current: true });
  });

  it("records when a weight was set by hand, for a home exercise and for a barbell tier", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", location: "home" });
    const at = new Date(sim.workouts[0].completedAt!.getTime() + 60_000);
    sim.adjustments.push(
      makeAdjustment("squat", { t1Weight: 65 }, at, {
        id: "adj-hand",
        clientId: "adj-hand",
        source: "manual",
        variant: { exerciseId: "bulgarian_split_squat", tier: "T1" },
      }),
      makeAdjustment("bench", { t2Weight: 120 }, at, { id: "adj-bench", clientId: "adj-bench", source: "manual" })
    );
    const after = rebuilt(sim);
    expect(variantOf(after.variantStates, "squat|bulgarian_split_squat|T1").setByHandAt).toEqual(at);
    expect(stateOf(after.liftStates, "bench").t2SetByHandAt).toEqual(at);
    // Starting weights are set by hand too; the sim's are dated at its start.
    expect(stateOf(after.liftStates, "squat").t1SetByHandAt).toEqual(SIM_START);
    // A time-off reduction is not.
    sim.adjustments.push(
      makeAdjustment("deadlift", { t1Weight: 200 }, new Date(at.getTime() + 1000), {
        id: "adj-decay",
        clientId: "adj-decay",
        source: "decay",
      })
    );
    expect(stateOf(rebuilt(sim).liftStates, "deadlift").t1SetByHandAt).toEqual(SIM_START);
    // Seeded starting weights, dated before everything, carry no date to record.
    const seeded = rebuildDerived({
      workouts: [],
      adjustments: [makeAdjustment("squat", { t1Weight: 190 }, new Date(0), { source: "start" })],
      settings: SETTINGS,
    });
    expect(stateOf(seeded.liftStates, "squat").t1SetByHandAt).toBeUndefined();
  });

  it("keeps the plan's weight beside a home weight set by hand until it is lifted or put back", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", location: "home" });
    const split = "squat|bulgarian_split_squat|T1";
    const plan = variantOf(rebuilt(sim).variantStates, split).weight;
    const at = (minutes: number) => new Date(sim.workouts.at(-1)!.completedAt!.getTime() + minutes * 60_000);
    const hand = (id: string, weight: number, minutes: number, note?: string) =>
      sim.adjustments.push(
        makeAdjustment("squat", { t1Weight: weight }, at(minutes), {
          id,
          clientId: id,
          source: "manual",
          variant: { exerciseId: "bulgarian_split_squat", tier: "T1" },
          ...(note ? { note } : {}),
        })
      );

    hand("adj-1", plan + 15, 1);
    expect(variantOf(rebuilt(sim).variantStates, split)).toMatchObject({ weight: plan + 15, plannedWeight: plan });
    // A second change keeps the plan's weight from before the first.
    hand("adj-2", plan + 20, 2);
    expect(variantOf(rebuilt(sim).variantStates, split)).toMatchObject({ weight: plan + 20, plannedWeight: plan });
    // Back to the plan's weight ends the override.
    hand("adj-3", plan, 3, BACK_TO_PLAN_NOTE);
    const back = variantOf(rebuilt(sim).variantStates, split);
    expect(back.plannedWeight).toBeUndefined();
    expect(back.setByHandAt).toBeUndefined();

    // Lifted: the hand-set weight is the plan's from then on.
    hand("adj-4", plan + 15, 4);
    runSession(sim, { templateId: "A1", location: "home" });
    expect(variantOf(rebuilt(sim).variantStates, split).plannedWeight).toBeUndefined();
  });

  it("keeps the plan's weight beside a barbell weight set by hand until the tier is lifted or put back (E7)", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const plan = stateOf(rebuilt(sim).liftStates, "squat").t1Weight;
    const at = (minutes: number) => new Date(sim.workouts.at(-1)!.completedAt!.getTime() + minutes * 60_000);
    const hand = (id: string, set: Record<string, number>, minutes: number, note?: string) =>
      sim.adjustments.push(
        makeAdjustment("squat", set, at(minutes), {
          id,
          clientId: id,
          source: "manual",
          ...(note ? { note } : {}),
        })
      );

    hand("adj-1", { t1Weight: plan + 15 }, 1);
    let squat = stateOf(rebuilt(sim).liftStates, "squat");
    expect(squat).toMatchObject({ t1Weight: plan + 15, t1PlannedWeight: plan });
    expect(squat.t1SetByHandAt).toBeDefined();
    expect(squat.t2PlannedWeight).toBeUndefined();
    // A second change keeps the plan's weight from before the first.
    hand("adj-2", { t1Weight: plan + 20 }, 2);
    expect(stateOf(rebuilt(sim).liftStates, "squat")).toMatchObject({ t1Weight: plan + 20, t1PlannedWeight: plan });
    // Back to the plan's weight ends the override.
    hand("adj-3", { t1Weight: plan }, 3, BACK_TO_PLAN_NOTE);
    squat = stateOf(rebuilt(sim).liftStates, "squat");
    expect(squat.t1PlannedWeight).toBeUndefined();
    expect(squat.t1SetByHandAt).toBeUndefined();
    // So does setting the plan's own weight, without the note.
    hand("adj-4", { t1Weight: plan + 10 }, 4);
    hand("adj-5", { t1Weight: plan }, 5);
    squat = stateOf(rebuilt(sim).liftStates, "squat");
    expect(squat.t1PlannedWeight).toBeUndefined();
    expect(squat.t1SetByHandAt).toBeUndefined();

    // Lifted at that tier: the hand-set weight is the plan's from then on.
    hand("adj-6", { t1Weight: plan + 15 }, 6);
    runSession(sim, { templateId: "B1" }); // squat not trained: still set by hand
    expect(stateOf(rebuilt(sim).liftStates, "squat").t1PlannedWeight).toBe(plan);
    runSession(sim, { templateId: "A2" }); // squat at T2 only: T1 still set by hand
    expect(stateOf(rebuilt(sim).liftStates, "squat").t1PlannedWeight).toBe(plan);
    runSession(sim, { templateId: "B2" });
    runSession(sim, { templateId: "A1" });
    expect(stateOf(rebuilt(sim).liftStates, "squat").t1PlannedWeight).toBeUndefined();
  });

  it("keeps the plan's weight per tier: T2 and T3 on their own", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const before = stateOf(rebuilt(sim).liftStates, "lat_pulldown");
    const squatBefore = stateOf(rebuilt(sim).liftStates, "squat");
    const at = new Date(sim.workouts.at(-1)!.completedAt!.getTime() + 60_000);
    sim.adjustments.push(
      makeAdjustment("squat", { t2Weight: squatBefore.t2Weight + 10 }, at, { id: "a-sq", clientId: "a-sq" }),
      makeAdjustment("lat_pulldown", { t3Weight: before.t3Weight + 10 }, at, { id: "a-lp", clientId: "a-lp" })
    );
    let after = rebuilt(sim);
    expect(stateOf(after.liftStates, "squat")).toMatchObject({ t2PlannedWeight: squatBefore.t2Weight });
    expect(stateOf(after.liftStates, "squat").t1PlannedWeight).toBeUndefined();
    expect(stateOf(after.liftStates, "lat_pulldown")).toMatchObject({
      t3Weight: before.t3Weight + 10,
      t3PlannedWeight: before.t3Weight,
    });

    // A home exercise's adjustment leaves the barbell lift's plan alone.
    sim.adjustments.push(
      makeAdjustment("squat", { t1Weight: 60 }, new Date(at.getTime() + 1000), {
        id: "a-bss",
        clientId: "a-bss",
        variant: { exerciseId: "bulgarian_split_squat", tier: "T1" },
      })
    );
    expect(stateOf(rebuilt(sim).liftStates, "squat").t1PlannedWeight).toBeUndefined();

    // Starting weights are not an override.
    const start = startSim();
    expect(rebuilt(start).liftStates.every((ls) => ls.t1PlannedWeight === undefined && ls.t3PlannedWeight === undefined)).toBe(true);

    // Logging the T3 (A2 has lat_pulldown at T3) clears it; the squat T2 too.
    runSession(sim, { templateId: "B1" });
    runSession(sim, { templateId: "A2" });
    after = rebuilt(sim);
    expect(stateOf(after.liftStates, "lat_pulldown").t3PlannedWeight).toBeUndefined();
    expect(stateOf(after.liftStates, "squat").t2PlannedWeight).toBeUndefined();
  });

  it("a barbell weight done at home as its home exercise does not lift the barbell's own override", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const plan = stateOf(rebuilt(sim).liftStates, "squat").t1Weight;
    const at = new Date(sim.workouts.at(-1)!.completedAt!.getTime() + 60_000);
    sim.adjustments.push(makeAdjustment("squat", { t1Weight: plan + 20 }, at, { id: "a-1", clientId: "a-1" }));
    runSession(sim, { templateId: "B1" });
    runSession(sim, { templateId: "A2" });
    runSession(sim, { templateId: "B2" });
    runSession(sim, { templateId: "A1", location: "home" });
    expect(stateOf(rebuilt(sim).liftStates, "squat").t1PlannedWeight).toBe(plan);
  });

  it("a barbell weight set by hand replaces the steps the home passes earned at that tier", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", location: "home" });
    const split = "squat|bulgarian_split_squat|T1";
    expect(variantOf(rebuilt(sim).variantStates, split).passesSinceGym).toBe(1);
    adjust(sim, "squat", { t2Weight: 150 }, new Date(sim.workouts[0].completedAt!.getTime() + 60_000));
    expect(variantOf(rebuilt(sim).variantStates, split).passesSinceGym).toBe(1);
    adjust(sim, "squat", { t1Weight: 210 }, new Date(sim.workouts[0].completedAt!.getTime() + 120_000));
    expect(variantOf(rebuilt(sim).variantStates, split).passesSinceGym).toBe(0);
    expect(variantOf(sim.variants, split).passesSinceGym).toBe(0);
  });

  it("a session of the barbell lift itself uses up the steps earned at home", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", location: "home" });
    runSession(sim, { templateId: "B1" });
    runSession(sim, { templateId: "A2" }); // squat T2 at the gym: T1's steps stay
    const split = "squat|bulgarian_split_squat|T1";
    expect(variantOf(rebuilt(sim).variantStates, split).passesSinceGym).toBe(1);
    runSession(sim, { templateId: "B2" });
    runSession(sim, { templateId: "A1" });
    const after = rebuilt(sim);
    // The gym pass in turn earns the split squat a step for its next home session (H6).
    expect(variantOf(after.variantStates, split)).toMatchObject({ passesSinceGym: 0, gymPassesSinceHome: 1, weight: 55, current: true });
    // The barbell weight moved only by its own pass at the gym.
    expect(stateOf(after.liftStates, "squat").t1Weight).toBe(200);
  });

  it("editing or deleting a home session rebuilds its variant", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", location: "home" });
    const split = "squat|bulgarian_split_squat|T1";
    const log = { workouts: sim.workouts, adjustments: sim.adjustments };
    const lastSet = w.sets.filter((s) => s.tier === "T1").at(-1)!;
    const missed = applyChange(log, { kind: "editSet", workoutId: w.id, setId: lastSet.id, patch: { actualReps: 1 } });
    expect(variantOf(rebuildDerived({ ...missed, settings: SETTINGS }).variantStates, split)).toMatchObject({ weight: 50, stage: "6x2" });
    const gone = applyChange(log, { kind: "deleteWorkout", workoutId: w.id });
    expect(rebuildDerived({ ...gone, settings: SETTINGS }).variantStates).toEqual([]);
  });

  it("rebuilds a past home session with the heaviest dumbbell stored with it, else today's", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", location: "home" });
    expect(w.completionContext?.maxDumbbellWeight).toBe(80);
    const split = "squat|bulgarian_split_squat|T1";
    const lighter = { ...SETTINGS, equipment: { ...SETTINGS.equipment, maxDumbbellWeight: 50 } };
    expect(variantOf(rebuilt(sim, lighter).variantStates, split).weight).toBe(55);
    // A session from before the setting was stored is rebuilt with today's: 50 a hand is
    // today's heaviest (50), so the pass cannot add weight and the cap policy adds a rep.
    const old = { ...w, completionContext: { ...w.completionContext!, maxDumbbellWeight: undefined } };
    const rebuiltOld = rebuildDerived({ workouts: [old], adjustments: sim.adjustments, settings: lighter });
    expect(variantOf(rebuiltOld.variantStates, split)).toMatchObject({ weight: 50, extraReps: 1 });
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
    // The increments stored when the session was finished decide its outcome, not the
    // doubled ones in the current settings.
    runSession(sim, { templateId: "A1", t3: { lastReps: 24 } });
    const { liftStates } = rebuilt(sim, changed);
    expect(stateOf(liftStates, "squat").t1Weight).toBe(200);
    expect(stateOf(liftStates, "bench").t2Weight).toBe(105);
  });

  it("falls back to the current settings when no context is stored", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", t3: { lastReps: 24 } });
    const workouts = sim.workouts.map((w) => ({ ...w, completionContext: undefined }));
    const { liftStates } = rebuildDerived({ ...rebuildInput(sim, changed), workouts });
    expect(stateOf(liftStates, "squat").t1Weight).toBe(210);
    expect(stateOf(liftStates, "bench").t2Weight).toBe(110);
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
    const w = runSession(sim, { templateId: "A1", t1: { lastReps: 5, repsInReserve: "1-2" } });
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

  it("skips ramp, back-off and drop sets: only working sets estimate the max", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", t1: { lastReps: 6 } });
    const amrap = w.sets.find((s) => s.isAMRAP && s.tier === "T1")!;
    expect(e1rmsForWorkout(w)).toHaveLength(1);
    for (const role of ["ramp", "backoff", "drop"] as const) {
      const extra = { ...amrap, id: `extra-${role}`, role, ...(role === "drop" ? { dropOf: amrap.id } : {}) };
      expect(e1rmsForWorkout({ ...w, sets: [...w.sets, extra] }), role).toHaveLength(1);
    }
    const work = { ...amrap, id: "extra-work", role: "work" as const };
    expect(e1rmsForWorkout({ ...w, sets: [...w.sets, work] })).toHaveLength(2);
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
