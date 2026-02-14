import { describe, it, expect } from "vitest";
import {
  roundToNearest5,
  getIncrement,
  evaluateT1Progression,
  evaluateT2Progression,
  evaluateT3Progression,
  evaluateT2AutoRegulation,
} from "./progression";
import type {
  LiftState,
  SetLog,
  EquipmentProfile,
  TrainingPhase,
  WorkoutLocation,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers for building test data
// ---------------------------------------------------------------------------

function makeLiftState(overrides: Partial<LiftState> = {}): LiftState {
  return {
    exerciseId: "squat",
    t1Weight: 200,
    t1Stage: "5x3",
    t1FailCount: 0,
    t2Weight: 150,
    t2Stage: "3x10",
    t2FailCount: 0,
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

describe("evaluateT3Progression", () => {
  describe("v3.2 critical fix: weight increases when AMRAP last set >= 25", () => {
    it("3x15 (45 total reps) does NOT trigger weight increase", () => {
      const result = evaluateT3Progression(45, 15, 30, { mode: "maintaining" });
      expect(result.newWeight).toBe(30);
    });

    it("last set AMRAP >= 25 -> weight increases", () => {
      // total = 15 + 15 + 25 = 55, AMRAP last set = 25
      const result = evaluateT3Progression(55, 25, 30, { mode: "maintaining" });
      expect(result.newWeight).toBe(35);
    });

    it("total reps >= 50 (e.g., 15+15+20) -> weight increases", () => {
      // total = 50, AMRAP last set = 20 (< 25)
      const result = evaluateT3Progression(50, 20, 30, { mode: "maintaining" });
      expect(result.newWeight).toBe(35);
    });

    it("last set AMRAP 24 with total 49 -> no increase", () => {
      const result = evaluateT3Progression(49, 24, 30, { mode: "maintaining" });
      expect(result.newWeight).toBe(30);
    });
  });

  describe("phase-adjusted behavior", () => {
    it("cutting: only AMRAP trigger counts (ignores total >= 50)", () => {
      // total = 50 but AMRAP last set = 20 -> should NOT increase in cutting
      const result = evaluateT3Progression(50, 20, 30, { mode: "cutting" });
      expect(result.newWeight).toBe(30);
    });

    it("cutting: AMRAP >= 25 still triggers increase", () => {
      const result = evaluateT3Progression(55, 25, 30, { mode: "cutting" });
      expect(result.newWeight).toBe(35);
    });

    it("maintaining: either trigger works - total >= 50", () => {
      const result = evaluateT3Progression(50, 20, 30, { mode: "maintaining" });
      expect(result.newWeight).toBe(35);
    });

    it("maintaining: either trigger works - AMRAP >= 25", () => {
      const result = evaluateT3Progression(40, 25, 30, { mode: "maintaining" });
      expect(result.newWeight).toBe(35);
    });

    it("bulking: either trigger works - total >= 50", () => {
      const result = evaluateT3Progression(50, 20, 30, { mode: "bulking" });
      expect(result.newWeight).toBe(35);
    });

    it("bulking: either trigger works - AMRAP >= 25", () => {
      const result = evaluateT3Progression(40, 25, 30, { mode: "bulking" });
      expect(result.newWeight).toBe(35);
    });
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
