import { afterEach, describe, it, expect } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, SetLog, VariantState, WorkoutSession } from "@/types";
import { buildWorkoutPlan } from "./buildPlan";
import { seedVariantState } from "./variant";
import { computeCompletion } from "./completeWorkout";
import { createSetLog } from "./logSet";
import { applyPlanEdits } from "./planEdits";
import type { CompletionInput, WorkoutPlan } from "./types";
import {
  EQUIPMENT,
  SETTINGS,
  makeSession,
  makeSet,
  makeSets,
  seedLiftStates,
} from "./testFixtures";

const START = new Date("2026-11-11T09:00:00Z");
const NOW = new Date("2026-11-11T09:47:30Z"); // 47 min 30 s later

function planFor(session: WorkoutSession, liftStates: LiftState[]): WorkoutPlan {
  return buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[session.templateId],
    liftStates,
    location: session.location,
    equipment: EQUIPMENT,
    includeWarmUps: session.includeWarmUps,
    selectedAccessories: session.selectedAccessories,
  });
}

function completion(overrides: Partial<CompletionInput> & { sets: SetLog[] }): CompletionInput {
  const session = overrides.session ?? makeSession();
  const liftStates = overrides.liftStates ?? seedLiftStates();
  const plan = overrides.plan ?? planFor(session, liftStates);
  return {
    session,
    plan,
    liftStates,
    settings: SETTINGS,
    recentE1RMsByExercise: {},
    currentExerciseIndex: plan.length,
    workoutStartTime: START,
    now: NOW,
    ...overrides,
  };
}

/** Squat T1 5x3 @190 with the last set AMRAP. */
function squatT1(amrapReps = 5, overrides: Partial<SetLog> = {}): SetLog[] {
  return [
    ...makeSets("squat", "T1", 4, 3, { weight: 190, ...overrides }),
    makeSet("squat", "T1", {
      setNumber: 5,
      targetReps: 3,
      actualReps: amrapReps,
      weight: 190,
      isAMRAP: true,
      status: amrapReps >= 3 ? "completed" : "failed",
      ...overrides,
    }),
  ];
}

const benchT2 = (overrides: Partial<SetLog> = {}) =>
  makeSets("bench", "T2", 3, 10, { weight: 100, ...overrides });
/** Lat pulldown T3 3x15 @90 with the last set AMRAP. */
function latT3(amrapReps = 15, overrides: Partial<SetLog> = {}): SetLog[] {
  return [
    ...makeSets("lat_pulldown", "T3", 2, 15, { weight: 90, ...overrides }),
    makeSet("lat_pulldown", "T3", {
      setNumber: 3,
      targetReps: 15,
      actualReps: amrapReps,
      weight: 90,
      isAMRAP: true,
      status: amrapReps >= 15 ? "completed" : "failed",
      ...overrides,
    }),
  ];
}

const byId = (updates: LiftState[], id: string) => updates.find((u) => u.exerciseId === id);

describe("computeCompletion: pass", () => {
  it("progresses T1 and T2 and fills the tracking arrays", () => {
    const sets = [
      ...squatT1(5, { repsInReserve: "1-2" }),
      ...benchT2({ repsInReserve: "3+" }),
      ...latT3(),
    ];
    const seeded = seedLiftStates();
    const result = computeCompletion(
      completion({
        sets,
        recentE1RMsByExercise: { squat: [214, 216, 218, 220, 222], bench: [130] },
      })
    );

    expect(result.liftStateUpdates.map((u) => u.exerciseId)).toEqual(["squat", "bench"]);

    // Gym, lower body: 2 x the 5 lb barbell increment.
    expect(byId(result.liftStateUpdates, "squat")).toEqual({
      ...seeded.find((s) => s.exerciseId === "squat"),
      t1Weight: 200,
      t1FailCount: 0,
      t1LastWorkoutDate: NOW,
      recentE1RMs: [214, 216, 218, 220, 222],
      recentAvgRepsInReserve: [1.5],
      recentAMRAPReps: [5],
      synced: false,
    });
    // Gym, upper body: the 5 lb barbell increment. A T2 day adds nothing to the
    // effort history, which holds T1 sessions only.
    expect(byId(result.liftStateUpdates, "bench")).toEqual({
      ...seeded.find((s) => s.exerciseId === "bench"),
      t2Weight: 105,
      t2FailCount: 0,
      t2LastWorkoutDate: NOW,
      recentE1RMs: [130],
      recentAvgRepsInReserve: [],
      recentAMRAPReps: [],
      synced: false,
    });
  });

  it("accessories never change lift state, nor does a T3 that stayed under 25 reps", () => {
    const session = makeSession({ selectedAccessories: ["face_pulls"] });
    const result = computeCompletion(
      completion({
        session,
        sets: [...latT3(), ...makeSets("face_pulls", "accessory", 3, 30)],
      })
    );
    expect(result.liftStateUpdates).toEqual([]);
  });

  it("warm-up sets are not counted as T1 sets", () => {
    const session = makeSession({ includeWarmUps: true });
    const warmUps = makeSets("squat", "warmup", 4, 5, { weight: 45, repsInReserve: "3+" });
    const result = computeCompletion(
      completion({ session, sets: [...warmUps, ...squatT1(4, { repsInReserve: "1-2" })] })
    );
    const squat = byId(result.liftStateUpdates, "squat")!;
    expect(squat.t1Weight).toBe(200);
    expect(squat.recentAvgRepsInReserve).toEqual([1.5]);
  });

  it("averages reps left over only the sets that have one, and keeps the last 5 entries", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat"
        ? { ...ls, recentAvgRepsInReserve: [0, 1, 1.5, 2, 3], recentAMRAPReps: [3, 4, 5, 6, 7] }
        : ls
    );
    const sets = squatT1(4);
    sets[0] = { ...sets[0], repsInReserve: "3+" };
    sets[4] = { ...sets[4], repsInReserve: "1-2" };
    const squat = byId(computeCompletion(completion({ sets, liftStates })).liftStateUpdates, "squat")!;
    expect(squat.recentAvgRepsInReserve).toEqual([1, 1.5, 2, 3, 2.25]);
    expect(squat.recentAMRAPReps).toEqual([4, 5, 6, 7, 4]);
  });
});

describe("computeCompletion: effort history is T1-only", () => {
  it("a T2 day leaves recentAvgRepsInReserve and recentAMRAPReps exactly as stored", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "bench"
        ? { ...ls, recentAvgRepsInReserve: [1.5, 1], recentAMRAPReps: [5, 4] }
        : ls
    );
    // Even a T2 set flagged AMRAP (no real template has one) is not recorded.
    const sets = benchT2({ repsInReserve: "3+" });
    sets[2] = { ...sets[2], isAMRAP: true, actualReps: 14 };
    const bench = byId(computeCompletion(completion({ sets, liftStates })).liftStateUpdates, "bench")!;
    expect(bench).toMatchObject({
      t2Weight: 105,
      t2LastWorkoutDate: NOW,
      recentAvgRepsInReserve: [1.5, 1],
      recentAMRAPReps: [5, 4],
    });
  });

  it("a T2 day still stores the e1RM series the caller looked up (it is built from T1 sets only)", () => {
    const bench = byId(
      computeCompletion(
        completion({ sets: benchT2({ repsInReserve: "3+" }), recentE1RMsByExercise: { bench: [160, 162] } })
      ).liftStateUpdates,
      "bench"
    )!;
    expect(bench.recentE1RMs).toEqual([160, 162]);
  });

  it("a T2 day tolerates a lift state stored without tracking arrays", () => {
    const liftStates = seedLiftStates().map((ls) => {
      if (ls.exerciseId !== "bench") return ls;
      const legacy = { ...ls } as Partial<LiftState>;
      delete legacy.recentAvgRepsInReserve;
      delete legacy.recentAMRAPReps;
      return legacy as LiftState;
    });
    const bench = byId(
      computeCompletion(completion({ sets: benchT2({ repsInReserve: "3+" }), liftStates })).liftStateUpdates,
      "bench"
    )!;
    expect(bench.recentAvgRepsInReserve).toEqual([]);
    expect(bench.recentAMRAPReps).toEqual([]);
  });
});

describe("computeCompletion: no reps left logged, no AMRAP set", () => {
  it("leaves recentAvgRepsInReserve as it was when no set has an answer", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, recentAvgRepsInReserve: [1.5] } : ls
    );
    const squat = byId(
      computeCompletion(completion({ sets: squatT1(5), liftStates })).liftStateUpdates,
      "squat"
    )!;
    expect(squat.recentAvgRepsInReserve).toEqual([1.5]);
    expect(squat.t1Weight).toBe(200);
  });

  it("leaves recentAMRAPReps as it was when no set is flagged AMRAP", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, recentAMRAPReps: [6, 5] } : ls
    );
    const sets = makeSets("squat", "T1", 5, 3, { weight: 190 });
    const squat = byId(computeCompletion(completion({ sets, liftStates })).liftStateUpdates, "squat")!;
    expect(squat.recentAMRAPReps).toEqual([6, 5]);
  });

  it("sets recentE1RMs to [] when the caller reports nothing stored for the exercise", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, recentE1RMs: [200] } : ls
    );
    const squat = byId(
      computeCompletion(
        completion({ sets: squatT1(), liftStates, recentE1RMsByExercise: { squat: [] } })
      ).liftStateUpdates,
      "squat"
    )!;
    expect(squat.recentE1RMs).toEqual([]);
  });

  it("keeps the stored recentE1RMs when the caller did not look the exercise up", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, recentE1RMs: [200] } : ls
    );
    const squat = byId(
      computeCompletion(completion({ sets: squatT1(), liftStates })).liftStateUpdates,
      "squat"
    )!;
    expect(squat.recentE1RMs).toEqual([200]);
  });

  it("tolerates lift states stored without tracking arrays", () => {
    const liftStates = seedLiftStates().map((ls) => {
      if (ls.exerciseId !== "squat") return ls;
      const legacy = { ...ls } as Partial<LiftState>;
      delete legacy.recentAvgRepsInReserve;
      delete legacy.recentAMRAPReps;
      return legacy as LiftState;
    });
    const sets = makeSets("squat", "T1", 5, 3, { weight: 190 });
    const squat = byId(computeCompletion(completion({ sets, liftStates })).liftStateUpdates, "squat")!;
    expect(squat.recentAvgRepsInReserve).toEqual([]);
    expect(squat.recentAMRAPReps).toEqual([]);
  });
});

describe("computeCompletion: fail", () => {
  it("a failed T1 moves to the next stage at the same weight", () => {
    const squat = byId(
      computeCompletion(completion({ sets: squatT1(2, { repsInReserve: "0" }) })).liftStateUpdates,
      "squat"
    )!;
    expect(squat).toMatchObject({
      t1Weight: 190,
      t1Stage: "6x2",
      t1FailCount: 1,
      t1LastWorkoutDate: NOW,
      recentAMRAPReps: [2],
      recentAvgRepsInReserve: [0],
      synced: false,
    });
  });

  it("a failed T2 moves to the next stage at the same weight", () => {
    const sets = benchT2();
    sets[2] = { ...sets[2], actualReps: 7, status: "failed" };
    const bench = byId(computeCompletion(completion({ sets })).liftStateUpdates, "bench")!;
    expect(bench).toMatchObject({
      t2Weight: 100,
      t2Stage: "3x8",
      t2FailCount: 1,
      t2LastWorkoutDate: NOW,
    });
  });

  it("a failed 10x1 resets to 85% at 5x3", () => {
    const liftStates = seedLiftStates().map((ls): LiftState =>
      ls.exerciseId === "squat" ? { ...ls, t1Stage: "10x1", t1FailCount: 2 } : ls
    );
    const session = makeSession();
    const sets = makeSets("squat", "T1", 10, 1, { weight: 190 });
    sets[9] = { ...sets[9], actualReps: 0, status: "failed", isAMRAP: true };
    const squat = byId(
      computeCompletion(completion({ session, liftStates, sets })).liftStateUpdates,
      "squat"
    )!;
    expect(squat).toMatchObject({
      t1Weight: 160,
      t1Stage: "5x3",
      t1FailCount: 0,
      t1LastResetWeight: 190,
    });
  });

  it("an accepted T2 load drop freezes the T2 weight but still records the date", () => {
    const sets = benchT2({ status: "autoregulated_load_drop", repsInReserve: "1-2" });
    const bench = byId(computeCompletion(completion({ sets })).liftStateUpdates, "bench")!;
    expect(bench).toMatchObject({
      t2Weight: 100,
      t2Stage: "3x10",
      t2FailCount: 0,
      t2LastWorkoutDate: NOW,
      recentAvgRepsInReserve: [],
      synced: false,
    });
  });
});

describe("computeCompletion: partial completion freezes progression", () => {
  it("only the matching last-workout date changes", () => {
    const seeded = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, synced: true, recentAvgRepsInReserve: [2] } : ls
    );
    const sets = [
      ...makeSets("squat", "T1", 3, 3, { weight: 190, repsInReserve: "1-2" }),
      ...makeSets("bench", "T2", 2, 10, { weight: 100 }),
    ];
    const result = computeCompletion(
      completion({ sets, liftStates: seeded, recentE1RMsByExercise: { squat: [222] } })
    );
    expect(byId(result.liftStateUpdates, "squat")).toEqual({
      ...seeded.find((s) => s.exerciseId === "squat"),
      t1LastWorkoutDate: NOW,
      synced: false,
    });
    expect(byId(result.liftStateUpdates, "bench")).toEqual({
      ...seeded.find((s) => s.exerciseId === "bench"),
      t2LastWorkoutDate: NOW,
      synced: false,
    });
  });

  it("a partial set that missed its reps is still a freeze, not a failure", () => {
    const sets = [makeSet("squat", "T1", { actualReps: 1, status: "failed", weight: 190 })];
    const squat = byId(computeCompletion(completion({ sets })).liftStateUpdates, "squat")!;
    expect(squat).toMatchObject({ t1Weight: 190, t1Stage: "5x3", t1FailCount: 0 });
  });

  it("compares against the plan's target sets (the stage), not the template's", () => {
    // At stage 6x2 the template still says 5 sets; 5 logged sets is partial.
    const liftStates = seedLiftStates().map((ls): LiftState =>
      ls.exerciseId === "squat" ? { ...ls, t1Stage: "6x2", t1FailCount: 1 } : ls
    );
    const sets = makeSets("squat", "T1", 5, 2, { weight: 190 });
    const squat = byId(computeCompletion(completion({ sets, liftStates })).liftStateUpdates, "squat")!;
    expect(squat).toMatchObject({ t1Weight: 190, t1Stage: "6x2", t1FailCount: 1 });
  });

  it("falls back to the template's set count when the plan has no matching entry", () => {
    const passed = computeCompletion(completion({ sets: squatT1(), plan: [] }));
    expect(byId(passed.liftStateUpdates, "squat")!.t1Weight).toBe(200);

    const partial = computeCompletion(
      completion({ sets: makeSets("squat", "T1", 4, 3, { weight: 190 }), plan: [] })
    );
    expect(byId(partial.liftStateUpdates, "squat")!.t1Weight).toBe(190);
  });
});

describe("computeCompletion: ended early", () => {
  it("flags the session and leaves untouched exercises out of the updates", () => {
    const sets = squatT1();
    const session = makeSession();
    const plan = planFor(session, seedLiftStates());
    const result = computeCompletion(
      completion({ session, plan, sets, currentExerciseIndex: 1 })
    );
    expect(result.sessionPatch).toEqual({
      completedAt: NOW,
      totalDurationSeconds: 2850,
      sets,
      endedEarly: true,
    });
    expect(result.liftStateUpdates.map((u) => u.exerciseId)).toEqual(["squat"]);
    expect(byId(result.liftStateUpdates, "squat")!.t1Weight).toBe(200);
  });

  it("ending with nothing logged changes no lift state", () => {
    const result = computeCompletion(completion({ sets: [], currentExerciseIndex: 0 }));
    expect(result.liftStateUpdates).toEqual([]);
    expect(result.sessionPatch.endedEarly).toBe(true);
    expect(result.sessionPatch.sets).toEqual([]);
  });
});

describe("computeCompletion: session patch", () => {
  it("a finished workout has no endedEarly key at all", () => {
    const sets = [...squatT1(), ...benchT2(), ...latT3()];
    const { sessionPatch } = computeCompletion(completion({ sets }));
    expect(sessionPatch).toEqual({ completedAt: NOW, totalDurationSeconds: 2850, sets });
    expect("endedEarly" in sessionPatch).toBe(false);
  });

  it("keeps every set, warm-ups included", () => {
    const session = makeSession({ includeWarmUps: true });
    const sets = [...makeSets("squat", "warmup", 4, 5), ...squatT1()];
    expect(computeCompletion(completion({ session, sets })).sessionPatch.sets).toEqual(sets);
  });

  it("duration is floored whole seconds, and 0 without a start time", () => {
    const sets = squatT1();
    expect(
      computeCompletion(
        completion({ sets, workoutStartTime: new Date(NOW.getTime() - 61_900) })
      ).sessionPatch.totalDurationSeconds
    ).toBe(61);
    expect(
      computeCompletion(completion({ sets, workoutStartTime: null })).sessionPatch
        .totalDurationSeconds
    ).toBe(0);
  });
});

describe("computeCompletion: home-adapted workout", () => {
  // 2026-11-15 (strength model, decision 1): substituted sets used to raise the barbell
  // lift by the dumbbell increment (squat 190 -> 195, bench 100 -> 105). They now raise
  // each home exercise's own weight; the lift states do not change at all. 2026-11-16
  // (H3): the split squat starts at its ratio, 0.5 x 190 = 95, 47.5 a hand, rounded to 50.
  it("substituted sets progress the home exercises by the dumbbell step, not the lift states", () => {
    const session = makeSession({ location: "home" });
    const liftStates = seedLiftStates();
    const plan = planFor(session, liftStates);
    expect(plan[0]).toMatchObject({
      substituteExerciseId: "bulgarian_split_squat",
      weight: 50,
      variantId: "squat|bulgarian_split_squat|T1",
      perHand: true,
    });

    const home = {
      location: "home" as const,
      isSubstituted: true,
    };
    const sets = [
      ...squatT1(6, { ...home, weight: 50, originalWeight: 190, substituteExerciseId: "bulgarian_split_squat" }),
      ...benchT2({ ...home, weight: 40, originalWeight: 100, substituteExerciseId: "db_bench" }),
    ];
    const result = computeCompletion(completion({ session, liftStates, plan, sets }));

    expect(result.liftStateUpdates).toEqual([]);
    expect(result.variantStateUpdates.map((v) => [v.id, v.weight, v.recentLastSetReps])).toEqual([
      ["squat|bulgarian_split_squat|T1", 55, [6]],
      ["bench|db_bench|T2", 45, [10]],
    ]);
    expect(result.variantStateUpdates.every((v) => v.current && v.lastSessionDate === NOW)).toBe(true);
    expect(result.outcomes.map((o) => `${o.exerciseId} ${o.kind}`)).toEqual([
      "squat held",
      "bench held",
      "lat_pulldown notDone",
    ]);
    expect(result.variantOutcomes.map((o) => `${o.exerciseId} ${o.kind}`)).toEqual([
      "bulgarian_split_squat passed",
      "db_bench passed",
      "db_row notDone",
    ]);
  });

  it("a home exercise done lighter than its own prescription is only logged", () => {
    const session = makeSession({
      location: "home",
      prescribed: [{ exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" }],
    });
    const liftStates = seedLiftStates();
    const plan = planFor(session, liftStates);
    const sets = squatT1(5, { location: "home", isSubstituted: true, weight: 45, originalWeight: 171, substituteExerciseId: "bulgarian_split_squat" });
    const result = computeCompletion(completion({ session, liftStates, plan, sets }));
    expect(result.outcomes[0]).toMatchObject({ kind: "loggedOnly", reason: "edited" });
    expect(result.variantOutcomes[0]).toMatchObject({ kind: "loggedOnly", from: { weight: 50 } });
    expect(result.variantStateUpdates).toEqual([]);
  });
});

describe("computeCompletion: the steps each location earns for re-entry (H6)", () => {
  const split = (overrides: Partial<VariantState> = {}): VariantState => ({
    ...seedVariantState({
      liftId: "squat",
      exerciseId: "bulgarian_split_squat",
      tier: "T1",
      liftState: seedLiftStates().find((ls) => ls.exerciseId === "squat"),
      equipment: EQUIPMENT,
    }),
    current: true,
    lastSessionDate: START,
    ...overrides,
  });
  const updated = (result: ReturnType<typeof computeCompletion>) =>
    result.variantStateUpdates.find((v) => v.id === "squat|bulgarian_split_squat|T1");

  it("a barbell pass at the gym earns the lift's home exercise at that tier one step, and uses up its home steps", () => {
    const result = computeCompletion(
      completion({ sets: squatT1(5), variantStates: [split({ passesSinceGym: 2, gymPassesSinceHome: 1 })] })
    );
    expect(updated(result)).toMatchObject({ passesSinceGym: 0, gymPassesSinceHome: 2 });
  });

  it("a barbell miss earns nothing", () => {
    const result = computeCompletion(completion({ sets: squatT1(2), variantStates: [split({ passesSinceGym: 2 })] }));
    expect(updated(result)?.gymPassesSinceHome).toBeUndefined();
  });

  it("a stored barbell prescription at the gym uses up the home steps even when the lift is not done", () => {
    const session = makeSession({
      prescribed: [{ exerciseId: "squat", tier: "T1", weight: 210, sets: 5, reps: 3, stage: "5x3" }],
    });
    const result = computeCompletion(completion({ session, sets: [], variantStates: [split({ passesSinceGym: 2 })] }));
    expect(updated(result)?.passesSinceGym).toBe(0);
  });

  it("a stored home prescription uses up the gym steps, and so does doing the exercise", () => {
    const session = makeSession({
      location: "home",
      prescribed: [
        {
          exerciseId: "squat",
          tier: "T1",
          weight: 190,
          sets: 5,
          reps: 3,
          stage: "5x3",
          home: { exerciseId: "bulgarian_split_squat", weight: 60, perHand: true, stage: "5x3", sets: 5, reps: 3 },
        },
      ],
    });
    const notDone = computeCompletion(completion({ session, sets: [], variantStates: [split({ gymPassesSinceHome: 2 })] }));
    expect(updated(notDone)).toBeDefined();
    expect(updated(notDone)!.gymPassesSinceHome).toBeUndefined();

    const done = computeCompletion(
      completion({
        session: makeSession({ location: "home" }),
        sets: squatT1(5, { location: "home", isSubstituted: true, weight: 50, originalWeight: 190, substituteExerciseId: "bulgarian_split_squat" }),
        variantStates: [split({ weight: 50, gymPassesSinceHome: 2 })],
      })
    );
    expect(updated(done)).toMatchObject({ weight: 55 });
    expect(updated(done)!.gymPassesSinceHome).toBeUndefined();
  });
});

describe("computeCompletion: working sets only (H12)", () => {
  const ramp = (weight: number, reps: number, overrides: Partial<SetLog> = {}) =>
    makeSet("squat", "T1", { weight, targetReps: 3, actualReps: reps, role: "ramp", ...overrides });

  it("a pass with a missed drop set is still a pass", () => {
    const working = squatT1(5);
    const last = working[working.length - 1];
    const drop = makeSet("squat", "T1", {
      weight: 150,
      targetReps: 5,
      actualReps: 2,
      status: "failed",
      role: "drop",
      dropOf: last.id,
    });
    const result = computeCompletion(completion({ sets: [...working, drop] }));
    expect(byId(result.liftStateUpdates, "squat")).toMatchObject({ t1Weight: 200, recentAMRAPReps: [5] });
    expect(result.outcomes[0].kind).toBe("passed");
  });

  it("ramp sets before the working sets neither fail the lift, make it lighter, nor make it partial", () => {
    const sets = [ramp(135, 3), ramp(165, 1, { status: "failed" }), ...squatT1(4)];
    const session = makeSession({
      prescribed: [{ exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" }],
    });
    const result = computeCompletion(completion({ session, sets }));
    expect(result.outcomes[0]).toMatchObject({ kind: "passed", to: { weight: 200 } });
  });

  it("a back-off set after the working sets does not change the pass or the last-set reps", () => {
    const sets = [
      ...squatT1(6),
      makeSet("squat", "T1", { weight: 160, targetReps: 8, actualReps: 5, status: "failed", role: "backoff" }),
    ];
    const result = computeCompletion(completion({ sets }));
    expect(byId(result.liftStateUpdates, "squat")).toMatchObject({ t1Weight: 200, recentAMRAPReps: [6] });
  });

  it("a per-set plan with a ramp and a back-off logs each set at its own weight and passes on the working sets (H10)", () => {
    const session = makeSession({
      prescribed: [{ exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" }],
      planEdits: [
        {
          kind: "setWeights",
          exerciseId: "squat",
          tier: "T1",
          sets: [
            { weight: 150, reps: 3, role: "ramp" },
            { weight: 170, reps: 3, role: "ramp" },
            ...Array.from({ length: 5 }, () => ({ weight: 190, reps: 3 })),
            { weight: 160, reps: 6, role: "backoff" as const },
          ],
        },
      ],
    });
    const liftStates = seedLiftStates();
    const plan = applyPlanEdits(planFor(session, liftStates), session.planEdits);
    const entry = plan.find((e) => e.exerciseId === "squat" && e.tier === "T1")!;
    expect(entry).toMatchObject({ targetSets: 8, targetReps: 3, weight: 190 });
    const sets = Array.from({ length: entry.targetSets }, (_, i) =>
      createSetLog({
        exercise: { ...entry, completedSets: i },
        // The back-off set falls short; the last working set is the AMRAP one.
        actualReps: i === 7 ? 4 : i === 6 ? 5 : 3,
        repsInReserve: null,
        location: "gym",
        autoRegulated: false,
        now: NOW,
        id: `ramp-${i}`,
        clientId: `ramp-${i}`,
      })
    );
    expect(sets.map((s) => s.weight)).toEqual([150, 170, 190, 190, 190, 190, 190, 160]);
    expect(sets.map((s) => s.role ?? "work")).toEqual(["ramp", "ramp", "work", "work", "work", "work", "work", "backoff"]);
    expect(sets.findIndex((s) => s.isAMRAP)).toBe(6);
    const result = computeCompletion(completion({ session, liftStates, plan, sets }));
    expect(result.outcomes[0]).toMatchObject({ kind: "passed", to: { weight: 200 } });
    expect(byId(result.liftStateUpdates, "squat")!.recentAMRAPReps).toEqual([5]);
  });
});

describe("computeCompletion: T3 progression", () => {
  const maintaining = { ...SETTINGS, trainingPhase: { ...SETTINGS.trainingPhase, mode: "maintaining" as const } };

  it("adds 5 lb when the last set reaches 25 reps, and changes nothing else", () => {
    const seeded = seedLiftStates();
    const result = computeCompletion(completion({ sets: latT3(25) }));
    expect(result.liftStateUpdates).toEqual([
      { ...seeded.find((s) => s.exerciseId === "lat_pulldown"), t3Weight: 95, synced: false },
    ]);
  });

  it("24 reps on the last set is not enough", () => {
    expect(computeCompletion(completion({ sets: latT3(24) })).liftStateUpdates).toEqual([]);
  });

  it("50 total reps without a 25-rep last set does not progress, in any phase", () => {
    expect(SETTINGS.trainingPhase.mode).toBe("cutting");
    expect(computeCompletion(completion({ sets: latT3(20) })).liftStateUpdates).toEqual([]);
    const result = computeCompletion(completion({ sets: latT3(20), settings: maintaining }));
    expect(byId(result.liftStateUpdates, "lat_pulldown")).toBeUndefined();
  });

  it("uses the last set logged, not the best set", () => {
    const sets = latT3(15);
    sets[0] = { ...sets[0], actualReps: 25 };
    expect(computeCompletion(completion({ sets })).liftStateUpdates).toEqual([]);
  });

  it("a partially completed T3 changes nothing, whatever the reps", () => {
    const sets = makeSets("lat_pulldown", "T3", 2, 30, { weight: 90 });
    expect(
      computeCompletion(completion({ sets, settings: maintaining })).liftStateUpdates
    ).toEqual([]);
  });

  it.each(["skipped_pain", "reduced_run_fatigue", "reduced_equipment"] as const)(
    "a %s set freezes T3 progression",
    (status) => {
      const sets = latT3(25);
      sets[1] = { ...sets[1], status };
      expect(computeCompletion(completion({ sets })).liftStateUpdates).toEqual([]);
    }
  );

  // 2026-11-15 (strength model): it used to raise the lat pulldown to 95. Now the dumbbell
  // row standing in for it goes up by one dumbbell step and the pulldown stays at 90.
  it("a home-substituted T3 raises the home exercise by one dumbbell step", () => {
    const session = makeSession({ location: "home" });
    const sets = latT3(25, {
      location: "home",
      isSubstituted: true,
      substituteExerciseId: "db_row",
      weight: 35,
      originalWeight: 90,
    });
    const result = computeCompletion(completion({ session, sets }));
    expect(byId(result.liftStateUpdates, "lat_pulldown")).toBeUndefined();
    expect(result.variantStateUpdates).toEqual([
      expect.objectContaining({ id: "lat_pulldown|db_row|T3", weight: 40, stage: null, passesSinceGym: 1 }),
    ]);
    expect(result.variantOutcomes.find((o) => o.tier === "T3")).toMatchObject({ kind: "t3Up", from: { weight: 35 }, to: { weight: 40 } });
  });

  it("progresses alongside T1 and T2, after them in the update order", () => {
    const result = computeCompletion(
      completion({ sets: [...squatT1(), ...benchT2(), ...latT3(26)] })
    );
    expect(result.liftStateUpdates.map((u) => u.exerciseId)).toEqual([
      "squat",
      "bench",
      "lat_pulldown",
    ]);
  });
});

describe("computeCompletion: guards", () => {
  it("skips template exercises with no lift state", () => {
    const liftStates = seedLiftStates().filter((ls) => ls.exerciseId !== "squat");
    const result = computeCompletion(
      completion({ liftStates, sets: [...squatT1(), ...benchT2()] })
    );
    expect(result.liftStateUpdates.map((u) => u.exerciseId)).toEqual(["bench"]);
  });

  it("an unknown template changes no lift state but still completes the session", () => {
    const session = makeSession({ templateId: "ZZ" });
    const sets = squatT1();
    const result = computeCompletion(completion({ session, sets, plan: [] }));
    expect(result.liftStateUpdates).toEqual([]);
    expect(result.sessionPatch).toEqual({ completedAt: NOW, totalDurationSeconds: 2850, sets });
  });

  it("does not mutate its inputs", () => {
    const liftStates = seedLiftStates();
    const snapshot = structuredClone(liftStates);
    const sets = [...squatT1(5, { repsInReserve: "1-2" }), ...benchT2()];
    const setsSnapshot = structuredClone(sets);
    computeCompletion(completion({ liftStates, sets }));
    expect(liftStates).toEqual(snapshot);
    expect(sets).toEqual(setsSnapshot);
  });
});

describe("computeCompletion: one exercise as both T1 and T2", () => {
  afterEach(() => {
    delete WORKOUT_TEMPLATES.TEST_DOUBLE;
  });

  it("the second update builds on the first and one row is returned", () => {
    // No real template does this; it guards the shared code path.
    WORKOUT_TEMPLATES.TEST_DOUBLE = {
      id: "TEST_DOUBLE",
      name: "Squat twice",
      exercises: [
        { exerciseId: "squat", tier: "T1", sets: 5, reps: 3, isAMRAP: true },
        { exerciseId: "squat", tier: "T2", sets: 3, reps: 10, isAMRAP: false },
      ],
    };
    const session = makeSession({ templateId: "TEST_DOUBLE" });
    const sets = [
      ...squatT1(5, { repsInReserve: "1-2" }),
      ...makeSets("squat", "T2", 3, 10, { weight: 135, repsInReserve: "3+" }),
    ];
    const result = computeCompletion(completion({ session, sets }));

    expect(result.liftStateUpdates).toHaveLength(1);
    expect(result.liftStateUpdates[0]).toMatchObject({
      exerciseId: "squat",
      t1Weight: 200,
      t2Weight: 145,
      t1LastWorkoutDate: NOW,
      t2LastWorkoutDate: NOW,
      recentAvgRepsInReserve: [1.5],
      recentAMRAPReps: [5],
      synced: false,
    });
  });
});
