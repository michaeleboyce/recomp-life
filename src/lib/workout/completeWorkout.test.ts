import { afterEach, describe, it, expect } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, SetLog, WorkoutSession } from "@/types";
import { buildWorkoutPlan } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
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
      ...squatT1(5, { rpe: 8 }),
      ...benchT2({ rpe: 7 }),
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
      recentAvgRPEs: [8],
      recentAMRAPReps: [5],
      synced: false,
    });
    // Gym, upper body: the 5 lb barbell increment. T2 has no AMRAP set.
    expect(byId(result.liftStateUpdates, "bench")).toEqual({
      ...seeded.find((s) => s.exerciseId === "bench"),
      t2Weight: 105,
      t2FailCount: 0,
      t2LastWorkoutDate: NOW,
      recentE1RMs: [130],
      recentAvgRPEs: [7],
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
    const warmUps = makeSets("squat", "warmup", 4, 5, { weight: 45, rpe: 2 });
    const result = computeCompletion(
      completion({ session, sets: [...warmUps, ...squatT1(4, { rpe: 8 })] })
    );
    const squat = byId(result.liftStateUpdates, "squat")!;
    expect(squat.t1Weight).toBe(200);
    expect(squat.recentAvgRPEs).toEqual([8]);
  });

  it("averages RPE over only the sets that have one, and keeps the last 5 entries", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat"
        ? { ...ls, recentAvgRPEs: [6, 6.5, 7, 7.5, 8], recentAMRAPReps: [3, 4, 5, 6, 7] }
        : ls
    );
    const sets = squatT1(4);
    sets[0] = { ...sets[0], rpe: 7 };
    sets[4] = { ...sets[4], rpe: 9 };
    const squat = byId(computeCompletion(completion({ sets, liftStates })).liftStateUpdates, "squat")!;
    expect(squat.recentAvgRPEs).toEqual([6.5, 7, 7.5, 8, 8]);
    expect(squat.recentAMRAPReps).toEqual([4, 5, 6, 7, 4]);
  });
});

describe("computeCompletion: no RPE logged, no AMRAP set", () => {
  it("leaves recentAvgRPEs as it was when no set has an RPE", () => {
    const liftStates = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, recentAvgRPEs: [7.5] } : ls
    );
    const squat = byId(
      computeCompletion(completion({ sets: squatT1(5), liftStates })).liftStateUpdates,
      "squat"
    )!;
    expect(squat.recentAvgRPEs).toEqual([7.5]);
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
      delete legacy.recentAvgRPEs;
      delete legacy.recentAMRAPReps;
      return legacy as LiftState;
    });
    const sets = makeSets("squat", "T1", 5, 3, { weight: 190 });
    const squat = byId(computeCompletion(completion({ sets, liftStates })).liftStateUpdates, "squat")!;
    expect(squat.recentAvgRPEs).toEqual([]);
    expect(squat.recentAMRAPReps).toEqual([]);
  });
});

describe("computeCompletion: fail", () => {
  it("a failed T1 moves to the next stage at the same weight", () => {
    const squat = byId(
      computeCompletion(completion({ sets: squatT1(2, { rpe: 10 }) })).liftStateUpdates,
      "squat"
    )!;
    expect(squat).toMatchObject({
      t1Weight: 190,
      t1Stage: "6x2",
      t1FailCount: 1,
      t1LastWorkoutDate: NOW,
      recentAMRAPReps: [2],
      recentAvgRPEs: [10],
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

  it("an accepted T2 load drop freezes the T2 weight but still records the date and arrays", () => {
    const sets = benchT2({ status: "autoregulated_load_drop", rpe: 9 });
    const bench = byId(computeCompletion(completion({ sets })).liftStateUpdates, "bench")!;
    expect(bench).toMatchObject({
      t2Weight: 100,
      t2Stage: "3x10",
      t2FailCount: 0,
      t2LastWorkoutDate: NOW,
      recentAvgRPEs: [9],
      synced: false,
    });
  });
});

describe("computeCompletion: partial completion freezes progression", () => {
  it("only the matching last-workout date changes", () => {
    const seeded = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, synced: true, recentAvgRPEs: [7] } : ls
    );
    const sets = [
      ...makeSets("squat", "T1", 3, 3, { weight: 190, rpe: 9 }),
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
  it("substituted sets count as passes and progress by the dumbbell increment", () => {
    const session = makeSession({ location: "home" });
    const liftStates = seedLiftStates();
    const plan = planFor(session, liftStates);
    expect(plan[0]).toMatchObject({ substituteExerciseId: "bulgarian_split_squat", weight: 75 });

    const home = {
      location: "home" as const,
      isSubstituted: true,
    };
    const sets = [
      ...squatT1(6, { ...home, weight: 75, originalWeight: 190, substituteExerciseId: "bulgarian_split_squat" }),
      ...benchT2({ ...home, weight: 40, originalWeight: 100, substituteExerciseId: "db_bench" }),
    ];
    const result = computeCompletion(completion({ session, liftStates, plan, sets }));

    // Lift state stays in barbell terms; home uses dumbbellIncrementLbs (5) for both.
    expect(byId(result.liftStateUpdates, "squat")).toMatchObject({
      t1Weight: 195,
      t1LastWorkoutDate: NOW,
      recentAMRAPReps: [6],
    });
    expect(byId(result.liftStateUpdates, "bench")).toMatchObject({
      t2Weight: 105,
      t2LastWorkoutDate: NOW,
    });
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

  it("while cutting, 50 total reps without a 25-rep last set does not progress", () => {
    expect(SETTINGS.trainingPhase.mode).toBe("cutting");
    expect(computeCompletion(completion({ sets: latT3(20) })).liftStateUpdates).toEqual([]);
  });

  it("outside a cut, 50 total reps is enough", () => {
    const result = computeCompletion(completion({ sets: latT3(20), settings: maintaining }));
    expect(byId(result.liftStateUpdates, "lat_pulldown")!.t3Weight).toBe(95);
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

  it("a home-substituted T3 counts as a pass", () => {
    const session = makeSession({ location: "home" });
    const sets = latT3(25, {
      location: "home",
      isSubstituted: true,
      substituteExerciseId: "db_row",
      weight: 35,
      originalWeight: 90,
    });
    const result = computeCompletion(completion({ session, sets }));
    expect(byId(result.liftStateUpdates, "lat_pulldown")!.t3Weight).toBe(95);
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
    const sets = [...squatT1(5, { rpe: 8 }), ...benchT2()];
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
      ...squatT1(5, { rpe: 8 }),
      ...makeSets("squat", "T2", 3, 10, { weight: 135, rpe: 6 }),
    ];
    const result = computeCompletion(completion({ session, sets }));

    expect(result.liftStateUpdates).toHaveLength(1);
    expect(result.liftStateUpdates[0]).toMatchObject({
      exerciseId: "squat",
      t1Weight: 200,
      t2Weight: 145,
      t1LastWorkoutDate: NOW,
      t2LastWorkoutDate: NOW,
      recentAvgRPEs: [8, 6],
      recentAMRAPReps: [5],
      synced: false,
    });
  });
});
