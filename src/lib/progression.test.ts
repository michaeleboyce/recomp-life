import { describe, it, expect } from "vitest";
import {
  roundToNearest5,
  getIncrement,
  shouldFreezeProgression,
  evaluateT1Progression,
  evaluateT2Progression,
  evaluateT3Progression,
  evaluateT2AutoRegulation,
  t3IncreaseThreshold,
  T3_INCREASE_REPS_MAX,
  T3_INCREASE_REPS_MIN,
  T3_TARGET_REPS,
} from "./progression";
import type {
  LiftState,
  SetLog,
  EquipmentProfile,
  WorkoutLocation,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers for building test data
// ---------------------------------------------------------------------------

function makeLiftState(overrides: Partial<LiftState> = {}): LiftState {
  return {
    exerciseId: "squat",
    clientId: "test-client",
    t1Weight: 200,
    t1Stage: "5x3",
    t1FailCount: 0,
    t2Weight: 150,
    t2Stage: "3x10",
    t2FailCount: 0,
    t3Weight: 0,
    t1LastResetWeight: null,
    t2LastResetWeight: null,
    t1LastWorkoutDate: null,
    t2LastWorkoutDate: null,
    deloadActive: false,
    deloadSessionsRemaining: 0,
    preDeloadT1Weight: null,
    preDeloadT2Weight: null,
    t2LoadDropCount: 0,
    recentE1RMs: [],
    recentAvgRPEs: [],
    recentAMRAPReps: [],
    synced: false,
    ...overrides,
  };
}

function makeEquipment(overrides: Partial<EquipmentProfile> = {}): EquipmentProfile {
  return {
    maxDumbbellWeight: 50,
    dumbbellIncrementLbs: 5,
    hasBench: true,
    hasResistanceBands: false,
    hasPullUpBar: true,
    gymBarbellIncrementLbs: 5,
    availablePlates: [45, 25, 10, 5, 2.5],
    barWeight: 45,
    ...overrides,
  };
}

function makeSetLog(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: "set-1",
    clientId: "client-1",
    exerciseId: "squat",
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 200,
    isAMRAP: false,
    completedAt: new Date(),
    restAfterSeconds: 180,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...overrides,
  };
}

/** Build an array of completed T1 5x3 sets (last set AMRAP with given reps) */
function makeT1_5x3Sets(weight: number, amrapReps: number): SetLog[] {
  const sets: SetLog[] = [];
  for (let i = 1; i <= 5; i++) {
    sets.push(
      makeSetLog({
        id: `set-${i}`,
        setNumber: i,
        targetReps: 3,
        actualReps: i === 5 ? amrapReps : 3,
        weight,
        isAMRAP: i === 5,
        status: "completed",
        tier: "T1",
      })
    );
  }
  return sets;
}

/** Build an array of completed T1 6x2 sets (last set AMRAP with given reps) */
function makeT1_6x2Sets(weight: number, amrapReps: number): SetLog[] {
  const sets: SetLog[] = [];
  for (let i = 1; i <= 6; i++) {
    sets.push(
      makeSetLog({
        id: `set-${i}`,
        setNumber: i,
        targetReps: 2,
        actualReps: i === 6 ? amrapReps : 2,
        weight,
        isAMRAP: i === 6,
        status: "completed",
        tier: "T1",
      })
    );
  }
  return sets;
}

/** Build an array of completed T1 10x1 sets (last set AMRAP with given reps) */
function makeT1_10x1Sets(weight: number, amrapReps: number): SetLog[] {
  const sets: SetLog[] = [];
  for (let i = 1; i <= 10; i++) {
    sets.push(
      makeSetLog({
        id: `set-${i}`,
        setNumber: i,
        targetReps: 1,
        actualReps: i === 10 ? amrapReps : 1,
        weight,
        isAMRAP: i === 10,
        status: "completed",
        tier: "T1",
      })
    );
  }
  return sets;
}

/** Build T2 sets for a given stage */
function makeT2Sets(
  stage: "3x10" | "3x8" | "3x6",
  weight: number,
  status: "completed" | "failed" = "completed"
): SetLog[] {
  const reps = stage === "3x10" ? 10 : stage === "3x8" ? 8 : 6;
  const sets: SetLog[] = [];
  for (let i = 1; i <= 3; i++) {
    sets.push(
      makeSetLog({
        id: `set-${i}`,
        setNumber: i,
        targetReps: reps,
        actualReps: status === "completed" ? reps : reps - 2,
        weight,
        isAMRAP: false,
        status,
        tier: "T2",
      })
    );
  }
  return sets;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("roundToNearest5", () => {
  it("rounds 172 to 170", () => {
    expect(roundToNearest5(172)).toBe(170);
  });

  it("rounds 173 to 175", () => {
    expect(roundToNearest5(173)).toBe(175);
  });

  it("rounds 170 to 170 (exact)", () => {
    expect(roundToNearest5(170)).toBe(170);
  });

  it("rounds 2.5 to 5", () => {
    expect(roundToNearest5(2.5)).toBe(5);
  });

  it("rounds 0 to 0", () => {
    expect(roundToNearest5(0)).toBe(0);
  });
});

describe("getIncrement", () => {
  it("gym upper with 2.5 plates -> 2.5", () => {
    const eq = makeEquipment({ gymBarbellIncrementLbs: 2.5 });
    expect(getIncrement("upper", "gym", eq)).toBe(2.5);
  });

  it("gym upper with 5 plates -> 5", () => {
    const eq = makeEquipment({ gymBarbellIncrementLbs: 5 });
    expect(getIncrement("upper", "gym", eq)).toBe(5);
  });

  it("gym lower with 2.5 plates -> 5", () => {
    const eq = makeEquipment({ gymBarbellIncrementLbs: 2.5 });
    expect(getIncrement("lower", "gym", eq)).toBe(5);
  });

  it("gym lower with 5 plates -> 10", () => {
    const eq = makeEquipment({ gymBarbellIncrementLbs: 5 });
    expect(getIncrement("lower", "gym", eq)).toBe(10);
  });

  it("home anything -> 5 (dumbbell increment)", () => {
    const eq = makeEquipment({ dumbbellIncrementLbs: 5 });
    expect(getIncrement("upper", "home", eq)).toBe(5);
    expect(getIncrement("lower", "home", eq)).toBe(5);
  });
});

describe("shouldFreezeProgression", () => {
  it("returns true when 0 sets completed (skipped)", () => {
    expect(shouldFreezeProgression(0, 5)).toBe(true);
  });

  it("returns true when partially completed", () => {
    expect(shouldFreezeProgression(2, 5)).toBe(true);
  });

  it("returns false when all sets completed", () => {
    expect(shouldFreezeProgression(5, 5)).toBe(false);
  });

  it("returns false when more than target sets completed", () => {
    expect(shouldFreezeProgression(6, 5)).toBe(false);
  });
});

describe("evaluateT1Progression", () => {
  const defaultEquipment = makeEquipment({ gymBarbellIncrementLbs: 5 });

  describe("pass scenarios", () => {
    it("passes 5x3 -> weight increases by configured increment (lower, gym, 5lb plates)", () => {
      const state = makeLiftState({ t1Weight: 200, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(200, 5); // AMRAP last set >= target of 3
      const result = evaluateT1Progression(state, sets, "gym", defaultEquipment, "lower");
      // lower gym with 5lb plates => increment = 10
      expect(result.t1Weight).toBe(210);
      expect(result.t1Stage).toBe("5x3");
    });

    it("gym with 2.5 lb plates: upper body increments by 2.5", () => {
      const eq = makeEquipment({ gymBarbellIncrementLbs: 2.5 });
      const state = makeLiftState({ t1Weight: 135, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(135, 3);
      const result = evaluateT1Progression(state, sets, "gym", eq, "upper");
      expect(result.t1Weight).toBe(137.5);
    });

    it("gym with 5 lb plates: upper body increments by 5", () => {
      const eq = makeEquipment({ gymBarbellIncrementLbs: 5 });
      const state = makeLiftState({ t1Weight: 135, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(135, 3);
      const result = evaluateT1Progression(state, sets, "gym", eq, "upper");
      expect(result.t1Weight).toBe(140);
    });

    it("home: always increments by dumbbell step size (5 lbs)", () => {
      const eq = makeEquipment({ dumbbellIncrementLbs: 5 });
      const state = makeLiftState({ t1Weight: 50, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(50, 4);
      const result = evaluateT1Progression(state, sets, "home", eq, "lower");
      expect(result.t1Weight).toBe(55);
    });

    it("completed DB-adapted workout counts as pass", () => {
      const eq = makeEquipment({ dumbbellIncrementLbs: 5 });
      const state = makeLiftState({ t1Weight: 40, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(40, 5).map((s) => ({
        ...s,
        isSubstituted: true,
        substituteExerciseId: "db-squat",
        location: "home" as WorkoutLocation,
      }));
      const result = evaluateT1Progression(state, sets, "home", eq, "lower");
      expect(result.t1Weight).toBe(45);
    });
  });

  describe("failure cascade", () => {
    it("fails 5x3 -> moves to 6x2 at same weight", () => {
      const state = makeLiftState({ t1Weight: 200, t1Stage: "5x3" });
      // Fail: AMRAP last set only got 2 reps (less than target of 3)
      const sets = makeT1_5x3Sets(200, 2);
      sets[4].status = "failed";
      const result = evaluateT1Progression(state, sets, "gym", defaultEquipment, "lower");
      expect(result.t1Weight).toBe(200);
      expect(result.t1Stage).toBe("6x2");
    });

    it("fails 6x2 -> moves to 10x1 at same weight", () => {
      const state = makeLiftState({ t1Weight: 200, t1Stage: "6x2" });
      const sets = makeT1_6x2Sets(200, 1);
      sets[5].status = "failed";
      const result = evaluateT1Progression(state, sets, "gym", defaultEquipment, "lower");
      expect(result.t1Weight).toBe(200);
      expect(result.t1Stage).toBe("10x1");
    });

    it("fails 10x1 -> resets to 85%, returns to 5x3", () => {
      const state = makeLiftState({ t1Weight: 200, t1Stage: "10x1" });
      const sets = makeT1_10x1Sets(200, 0);
      sets[9].status = "failed";
      const result = evaluateT1Progression(state, sets, "gym", defaultEquipment, "lower");
      // 200 * 0.85 = 170, already nearest 5
      expect(result.t1Weight).toBe(170);
      expect(result.t1Stage).toBe("5x3");
    });
  });

  describe("freeze scenarios (no state change)", () => {
    it("pain-modified session does NOT trigger failure cascade", () => {
      const state = makeLiftState({ t1Weight: 200, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(200, 1).map((s) => ({
        ...s,
        status: "skipped_pain" as const,
      }));
      const result = evaluateT1Progression(state, sets, "gym", defaultEquipment, "lower");
      expect(result.t1Weight).toBe(200);
      expect(result.t1Stage).toBe("5x3");
    });

    it("run-fatigue-reduced session does NOT trigger failure cascade", () => {
      const state = makeLiftState({ t1Weight: 200, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(200, 1).map((s) => ({
        ...s,
        status: "reduced_run_fatigue" as const,
      }));
      const result = evaluateT1Progression(state, sets, "gym", defaultEquipment, "lower");
      expect(result.t1Weight).toBe(200);
      expect(result.t1Stage).toBe("5x3");
    });

    it("equipment-limited skip does NOT trigger failure cascade", () => {
      const state = makeLiftState({ t1Weight: 200, t1Stage: "5x3" });
      const sets = makeT1_5x3Sets(200, 1).map((s) => ({
        ...s,
        status: "reduced_equipment" as const,
      }));
      const result = evaluateT1Progression(state, sets, "gym", defaultEquipment, "lower");
      expect(result.t1Weight).toBe(200);
      expect(result.t1Stage).toBe("5x3");
    });
  });
});

describe("evaluateT2Progression", () => {
  const defaultEquipment = makeEquipment({ gymBarbellIncrementLbs: 5 });

  describe("pass scenarios", () => {
    it("completes 3x10 -> weight increases by increment", () => {
      const state = makeLiftState({ t2Weight: 100, t2Stage: "3x10" });
      const sets = makeT2Sets("3x10", 100, "completed");
      const result = evaluateT2Progression(state, sets, "gym", defaultEquipment, "upper");
      // upper gym 5lb plates => increment = 5
      expect(result.t2Weight).toBe(105);
      expect(result.t2Stage).toBe("3x10");
    });
  });

  describe("failure cascade", () => {
    it("3x10 -> 3x8 -> 3x6 -> reset (standard cascade)", () => {
      // Fail 3x10 -> move to 3x8
      const state1 = makeLiftState({ t2Weight: 100, t2Stage: "3x10" });
      const sets1 = makeT2Sets("3x10", 100, "failed");
      const result1 = evaluateT2Progression(state1, sets1, "gym", defaultEquipment, "upper");
      expect(result1.t2Weight).toBe(100);
      expect(result1.t2Stage).toBe("3x8");

      // Fail 3x8 -> move to 3x6
      const state2 = makeLiftState({ t2Weight: 100, t2Stage: "3x8" });
      const sets2 = makeT2Sets("3x8", 100, "failed");
      const result2 = evaluateT2Progression(state2, sets2, "gym", defaultEquipment, "upper");
      expect(result2.t2Weight).toBe(100);
      expect(result2.t2Stage).toBe("3x6");

      // Fail 3x6 -> reset to 85%, back to 3x10
      const state3 = makeLiftState({ t2Weight: 100, t2Stage: "3x6" });
      const sets3 = makeT2Sets("3x6", 100, "failed");
      const result3 = evaluateT2Progression(state3, sets3, "gym", defaultEquipment, "upper");
      expect(result3.t2Weight).toBe(85);
      expect(result3.t2Stage).toBe("3x10");
    });
  });

  describe("autoregulated_load_drop", () => {
    it("counts as pass but freezes weight (no increment)", () => {
      const state = makeLiftState({ t2Weight: 100, t2Stage: "3x10" });
      const sets = makeT2Sets("3x10", 100, "completed").map((s) => ({
        ...s,
        status: "autoregulated_load_drop" as const,
      }));
      const result = evaluateT2Progression(state, sets, "gym", defaultEquipment, "upper");
      // Should NOT advance weight, but also should NOT cascade
      expect(result.t2Weight).toBe(100);
      expect(result.t2Stage).toBe("3x10");
    });
  });

  describe("freeze scenarios (no state change)", () => {
    it("pain-modified session does NOT trigger failure cascade", () => {
      const state = makeLiftState({ t2Weight: 100, t2Stage: "3x10" });
      const sets = makeT2Sets("3x10", 100).map((s) => ({
        ...s,
        status: "skipped_pain" as const,
      }));
      const result = evaluateT2Progression(state, sets, "gym", defaultEquipment, "upper");
      expect(result.t2Weight).toBe(100);
      expect(result.t2Stage).toBe("3x10");
    });

    it("run-fatigue-reduced session does NOT trigger failure cascade", () => {
      const state = makeLiftState({ t2Weight: 100, t2Stage: "3x10" });
      const sets = makeT2Sets("3x10", 100).map((s) => ({
        ...s,
        status: "reduced_run_fatigue" as const,
      }));
      const result = evaluateT2Progression(state, sets, "gym", defaultEquipment, "upper");
      expect(result.t2Weight).toBe(100);
      expect(result.t2Stage).toBe("3x10");
    });

    it("equipment-limited skip does NOT trigger failure cascade", () => {
      const state = makeLiftState({ t2Weight: 100, t2Stage: "3x10" });
      const sets = makeT2Sets("3x10", 100).map((s) => ({
        ...s,
        status: "reduced_equipment" as const,
      }));
      const result = evaluateT2Progression(state, sets, "gym", defaultEquipment, "upper");
      expect(result.t2Weight).toBe(100);
      expect(result.t2Stage).toBe("3x10");
    });
  });
});

describe("t3IncreaseThreshold", () => {
  // The spec's table (docs/plans/2026-11-18-t3-jump-threshold-design.md).
  it.each([
    ["lat pulldown 120 → 125 (4%): the floor; the formula alone says 17", 120, 125, 18],
    ["dumbbell 50 → 55 (10%)", 50, 55, 20],
    ["dumbbell 25 → 30 (20%)", 25, 30, 24],
    ["dumbbell 15 → 20 (33%): the ceiling", 15, 20, 25],
  ])("%s", (_label, weight, nextWeight, expected) => {
    expect(t3IncreaseThreshold({ weight, nextWeight, targetReps: T3_TARGET_REPS })).toBe(expected);
  });

  it("keeps between the bounds, which are the stock 25 and 18", () => {
    expect(T3_INCREASE_REPS_MAX).toBe(25);
    expect(T3_INCREASE_REPS_MIN).toBe(18);
    expect(t3IncreaseThreshold({ weight: 1000, nextWeight: 1001, targetReps: 15 })).toBe(T3_INCREASE_REPS_MIN);
    expect(t3IncreaseThreshold({ weight: 5, nextWeight: 10, targetReps: 15 })).toBe(T3_INCREASE_REPS_MAX);
    for (let weight = 5; weight <= 300; weight += 2.5) {
      const t = t3IncreaseThreshold({ weight, nextWeight: weight + 5, targetReps: 15 });
      expect(t).toBeGreaterThanOrEqual(T3_INCREASE_REPS_MIN);
      expect(t).toBeLessThanOrEqual(T3_INCREASE_REPS_MAX);
    }
  });

  it("asks for at least the formula's reps: the lifter is good for the target at the next weight", () => {
    for (let weight = 20; weight <= 200; weight += 5) {
      const t = t3IncreaseThreshold({ weight, nextWeight: weight + 5, targetReps: 15 });
      if (t === T3_INCREASE_REPS_MAX) continue;
      expect(weight * (1 + t / 30)).toBeGreaterThanOrEqual((weight + 5) * (1 + 15 / 30) - 1e-9);
    }
  });

  it("is the maximum for bodyweight work and when there is no next step", () => {
    expect(t3IncreaseThreshold({ weight: 0, nextWeight: 5, targetReps: 15 })).toBe(T3_INCREASE_REPS_MAX);
    expect(t3IncreaseThreshold({ weight: 50, nextWeight: null, targetReps: 15 })).toBe(T3_INCREASE_REPS_MAX);
    expect(t3IncreaseThreshold({ weight: 50, nextWeight: 50, targetReps: 15 })).toBe(T3_INCREASE_REPS_MAX);
  });

  it("asks for more when the target is higher", () => {
    expect(t3IncreaseThreshold({ weight: 120, nextWeight: 125, targetReps: 20 })).toBeGreaterThan(
      t3IncreaseThreshold({ weight: 120, nextWeight: 125, targetReps: 15 })
    );
  });
});

describe("evaluateT3Progression", () => {
  it("goes up when the last set reaches the threshold for a 5 lb step", () => {
    // 30 → 35 is a 17% step: 23 reps.
    expect(evaluateT3Progression(23, 30)).toEqual({ newWeight: 35, increased: true, threshold: 23 });
    expect(evaluateT3Progression(31, 30)).toEqual({ newWeight: 35, increased: true, threshold: 23 });
  });

  it("stays the same when the last set is short of it", () => {
    expect(evaluateT3Progression(22, 30)).toEqual({ newWeight: 30, increased: false, threshold: 23 });
    expect(evaluateT3Progression(15, 30)).toEqual({ newWeight: 30, increased: false, threshold: 23 });
  });

  it("a heavy T3 goes up at the floor", () => {
    expect(evaluateT3Progression(18, 120)).toMatchObject({ newWeight: 125, increased: true });
    expect(evaluateT3Progression(17, 120)).toMatchObject({ newWeight: 120, increased: false });
  });

  it("never goes down", () => {
    expect(evaluateT3Progression(0, 30).newWeight).toBe(30);
  });
});

describe("evaluateT2AutoRegulation", () => {
  it("RPE 9.0 on T2 Set 1 in cutting -> suggests 5% drop", () => {
    const result = evaluateT2AutoRegulation(9.0, { mode: "cutting" }, 100);
    expect(result.action).toBe("suggest_drop");
    expect(result.reducedWeight).toBe(95);
    expect(result.progressionEffect).toBe("freeze");
  });

  it("RPE 10 on T2 Set 1 in cutting -> suggests 10% drop", () => {
    const result = evaluateT2AutoRegulation(10, { mode: "cutting" }, 100);
    expect(result.action).toBe("suggest_drop");
    expect(result.reducedWeight).toBe(90);
    expect(result.progressionEffect).toBe("freeze");
  });

  it("RPE 9.0 in bulking -> no suggestion (threshold is 10)", () => {
    const result = evaluateT2AutoRegulation(9.0, { mode: "bulking" }, 100);
    expect(result.action).toBe("continue");
  });

  it("RPE not logged -> no intervention", () => {
    const result = evaluateT2AutoRegulation(null, { mode: "cutting" }, 100);
    expect(result.action).toBe("continue");
  });

  it("reduced weight rounds to nearest 5", () => {
    // 5% of 135 = 6.75, 135 - 6.75 = 128.25, round to 130
    const result = evaluateT2AutoRegulation(9.0, { mode: "cutting" }, 135);
    expect(result.action).toBe("suggest_drop");
    expect(result.reducedWeight).toBe(130);
  });

  it("RPE 9.5 in maintaining -> suggests 5% drop (threshold 9.5)", () => {
    const result = evaluateT2AutoRegulation(9.5, { mode: "maintaining" }, 200);
    expect(result.action).toBe("suggest_drop");
    expect(result.reducedWeight).toBe(190);
    expect(result.progressionEffect).toBe("freeze");
  });

  it("RPE 9.0 in maintaining -> no suggestion (below 9.5 threshold)", () => {
    const result = evaluateT2AutoRegulation(9.0, { mode: "maintaining" }, 200);
    expect(result.action).toBe("continue");
  });

  it("RPE 10 in maintaining -> suggests 10% drop", () => {
    const result = evaluateT2AutoRegulation(10, { mode: "maintaining" }, 200);
    expect(result.action).toBe("suggest_drop");
    expect(result.reducedWeight).toBe(180);
  });

  it("RPE 10 in bulking -> suggests 10% drop (at threshold)", () => {
    const result = evaluateT2AutoRegulation(10, { mode: "bulking" }, 200);
    expect(result.action).toBe("suggest_drop");
    expect(result.reducedWeight).toBe(180);
  });
});

import { getPerformedStage, NEXT_STAGE_LABEL } from "./progression";

describe("getPerformedStage", () => {
  it("identifies the T1 stage from the target reps", () => {
    expect(getPerformedStage("T1", 3)).toEqual({ stage: "5x3", sets: 5 });
    expect(getPerformedStage("T1", 2)).toEqual({ stage: "6x2", sets: 6 });
    expect(getPerformedStage("T1", 1)).toEqual({ stage: "10x1", sets: 10 });
  });

  it("identifies the T2 stage from the target reps", () => {
    expect(getPerformedStage("T2", 10)).toEqual({ stage: "3x10", sets: 3 });
    expect(getPerformedStage("T2", 8)).toEqual({ stage: "3x8", sets: 3 });
    expect(getPerformedStage("T2", 6)).toEqual({ stage: "3x6", sets: 3 });
  });

  it("returns null for reps that match no stage", () => {
    expect(getPerformedStage("T1", 7)).toBeNull();
  });

  it("a failed stage moves to the next one in the cascade", () => {
    expect(NEXT_STAGE_LABEL["5x3"]).toBe("6x2");
    expect(NEXT_STAGE_LABEL["3x10"]).toBe("3x8");
    expect(NEXT_STAGE_LABEL["10x1"]).toBe("reset to 85%");
    expect(NEXT_STAGE_LABEL["3x6"]).toBe("reset to 85%");
  });
});
