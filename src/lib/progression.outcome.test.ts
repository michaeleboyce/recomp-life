// What the program rules report about each decision: the outcome that comes back with
// the new lift state. The state itself is covered by progression.test.ts; here the
// outcome must agree with it and the old exports must be thin wrappers.
import { describe, expect, it } from "vitest";
import { isRuleId } from "@/lib/evidence";
import type { EquipmentProfile, LiftState, SetLog, SetStatus, T1Stage, T2Stage } from "@/types";
import {
  OUTCOME_RULE_IDS,
  RESET_FACTOR,
  T3_INCREMENT_LBS,
  t3IncreaseThreshold,
  evaluateT1,
  evaluateT1Progression,
  evaluateT2,
  evaluateT2Progression,
  evaluateT3,
  evaluateT3Progression,
  getHoldReason,
  roundToNearest5,
} from "./progression";

const EQUIPMENT: EquipmentProfile = {
  maxDumbbellWeight: 50,
  dumbbellIncrementLbs: 5,
  hasBench: true,
  hasResistanceBands: false,
  hasPullUpBar: true,
  gymBarbellIncrementLbs: 5,
  availablePlates: [45, 25, 10, 5, 2.5],
  barWeight: 45,
};

function lift(overrides: Partial<LiftState> = {}): LiftState {
  return {
    exerciseId: "squat",
    clientId: "squat",
    t1Weight: 200,
    t1Stage: "5x3",
    t1FailCount: 0,
    t2Weight: 150,
    t2Stage: "3x10",
    t2FailCount: 0,
    t3Weight: 90,
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
    recentAvgRepsInReserve: [],
    recentAMRAPReps: [],
    synced: false,
    ...overrides,
  };
}

/** `count` sets at `reps`; the last one gets `lastReps` when given. */
function sets(
  tier: SetLog["tier"],
  count: number,
  reps: number,
  lastReps?: number,
  statuses: Partial<Record<number, SetStatus>> = {}
): SetLog[] {
  return Array.from({ length: count }, (_, i) => {
    const actualReps = i === count - 1 && lastReps !== undefined ? lastReps : reps;
    return {
      id: `set-${i + 1}`,
      clientId: `set-${i + 1}`,
      exerciseId: "squat",
      tier,
      setNumber: i + 1,
      targetReps: reps,
      actualReps,
      weight: 200,
      isAMRAP: i === count - 1,
      completedAt: new Date(2026, 10, 14, 9, i),
      restAfterSeconds: 0,
      status: statuses[i] ?? (actualReps >= reps ? "completed" : "failed"),
      isSubstituted: false,
      location: "gym",
      synced: false,
    };
  });
}

const T1_SCHEME: Record<T1Stage, [number, number]> = { "5x3": [5, 3], "6x2": [6, 2], "10x1": [10, 1] };
const T2_SCHEME: Record<T2Stage, [number, number]> = { "3x10": [3, 10], "3x8": [3, 8], "3x6": [3, 6] };

describe("evaluateT1", () => {
  it("a pass adds the step and says so", () => {
    const { state, outcome } = evaluateT1(lift(), sets("T1", 5, 3, 5), "gym", EQUIPMENT, "lower");
    expect(state.t1Weight).toBe(210);
    expect(outcome).toEqual({
      exerciseId: "squat",
      tier: "T1",
      kind: "passed",
      from: { weight: 200, stage: "5x3" },
      to: { weight: 210, stage: "5x3" },
      ruleId: "gzclp-progression",
    });
  });

  it("a miss moves one stage down at the same weight", () => {
    const { state, outcome } = evaluateT1(lift(), sets("T1", 5, 3, 2), "gym", EQUIPMENT, "lower");
    expect(state).toMatchObject({ t1Weight: 200, t1Stage: "6x2", t1FailCount: 1 });
    expect(outcome).toMatchObject({
      kind: "stageDown",
      from: { weight: 200, stage: "5x3" },
      to: { weight: 200, stage: "6x2" },
    });
    expect(outcome.reason).toBeUndefined();
  });

  it("a miss at the last stage resets the weight and returns to the first stage", () => {
    const { state, outcome } = evaluateT1(
      lift({ t1Stage: "10x1", t1FailCount: 2 }),
      sets("T1", 10, 1, 0),
      "gym",
      EQUIPMENT,
      "lower"
    );
    const reset = roundToNearest5(200 * RESET_FACTOR);
    expect(state).toMatchObject({ t1Weight: reset, t1Stage: "5x3", t1LastResetWeight: 200 });
    expect(outcome).toMatchObject({
      kind: "reset",
      from: { weight: 200, stage: "10x1" },
      to: { weight: reset, stage: "5x3" },
    });
  });

  it.each([
    ["skipped_pain", "pain"],
    ["reduced_run_fatigue", "run"],
    ["reduced_equipment", "equipment"],
  ] as const)("a set marked %s holds the lift: neither a pass nor a miss", (status, reason) => {
    const before = lift();
    // The last set also missed its reps: without the hold this would be a stage change.
    const { state, outcome } = evaluateT1(before, sets("T1", 5, 3, 1, { 1: status }), "gym", EQUIPMENT, "lower");
    expect(state).toEqual(before);
    expect(state).not.toBe(before);
    expect(outcome).toMatchObject({
      kind: "held",
      reason,
      from: { weight: 200, stage: "5x3" },
      to: { weight: 200, stage: "5x3" },
      ruleId: "gzclp-progression",
    });
  });

  it("the first held set in logging order gives the reason", () => {
    const { outcome } = evaluateT1(
      lift(),
      sets("T1", 5, 3, 3, { 2: "reduced_run_fatigue", 4: "skipped_pain" }),
      "gym",
      EQUIPMENT,
      "lower"
    );
    expect(outcome.reason).toBe("run");
  });
});

describe("evaluateT2", () => {
  it("pass, stage change and reset, in that order down the cascade", () => {
    const pass = evaluateT2(lift(), sets("T2", 3, 10), "gym", EQUIPMENT, "upper");
    expect(pass.outcome).toMatchObject({
      tier: "T2",
      kind: "passed",
      from: { weight: 150, stage: "3x10" },
      to: { weight: 155, stage: "3x10" },
      ruleId: "gzclp-progression",
    });

    const down = evaluateT2(lift(), sets("T2", 3, 10, 7), "gym", EQUIPMENT, "upper");
    expect(down.outcome).toMatchObject({ kind: "stageDown", to: { weight: 150, stage: "3x8" } });

    const reset = evaluateT2(lift({ t2Stage: "3x6" }), sets("T2", 3, 6, 4), "gym", EQUIPMENT, "upper");
    expect(reset.outcome).toMatchObject({
      kind: "reset",
      from: { weight: 150, stage: "3x6" },
      to: { weight: roundToNearest5(150 * RESET_FACTOR), stage: "3x10" },
    });
  });

  it("an accepted load drop holds the lift and points at the rule that suggested it", () => {
    const before = lift();
    const dropped = sets("T2", 3, 10, 10, { 1: "autoregulated_load_drop", 2: "autoregulated_load_drop" });
    const { state, outcome } = evaluateT2(before, dropped, "gym", EQUIPMENT, "upper");
    expect(state).toEqual(before);
    expect(outcome).toMatchObject({
      kind: "held",
      reason: "loadDrop",
      from: { weight: 150, stage: "3x10" },
      to: { weight: 150, stage: "3x10" },
      ruleId: "t2-autoregulation",
    });
  });

  it("pain, a run or equipment is checked before a load drop", () => {
    const mixed = sets("T2", 3, 10, 10, { 1: "autoregulated_load_drop", 2: "skipped_pain" });
    expect(evaluateT2(lift(), mixed, "gym", EQUIPMENT, "upper").outcome).toMatchObject({
      kind: "held",
      reason: "pain",
      ruleId: "gzclp-progression",
    });
  });
});

describe("evaluateT3", () => {
  // 90 → 95 is a 6% step: the floor.
  const AT_90 = t3IncreaseThreshold({ weight: 90, nextWeight: 95, targetReps: 15 });
  it("asks 18 of a 90 lb T3", () => expect(AT_90).toBe(18));

  it("goes up when the last set reaches the target, and says it was the last set", () => {
    const { state, outcome } = evaluateT3(lift(), sets("T3", 3, 15, AT_90));
    expect(state.t3Weight).toBe(90 + T3_INCREMENT_LBS);
    expect(outcome).toEqual({
      exerciseId: "squat",
      tier: "T3",
      kind: "t3Up",
      reason: "lastSet",
      from: { weight: 90 },
      to: { weight: 90 + T3_INCREMENT_LBS },
      ruleId: "t3-progression",
    });
  });

  it("stays when the last set is short, however many reps the sets total", () => {
    const { state, outcome } = evaluateT3(lift(), sets("T3", 3, 24, AT_90 - 1));
    expect(state.t3Weight).toBe(90);
    expect(outcome).toMatchObject({ kind: "t3Same", reason: "lastSet", from: { weight: 90 }, to: { weight: 90 } });
  });

  it("a set held for pain keeps the weight even with 30 on the last set", () => {
    const { state, outcome } = evaluateT3(lift(), sets("T3", 3, 15, 30, { 0: "skipped_pain" }));
    expect(state.t3Weight).toBe(90);
    expect(outcome).toMatchObject({ kind: "held", reason: "pain", ruleId: "t3-progression" });
  });

  it("agrees with evaluateT3Progression on the weight", () => {
    for (let reps = 0; reps <= 40; reps++) {
      const { state, outcome } = evaluateT3(lift(), sets("T3", 3, 15, reps));
      const plain = evaluateT3Progression(reps, 90);
      expect(state.t3Weight).toBe(plain.newWeight);
      expect(outcome.kind === "t3Up").toBe(plain.increased);
      expect(outcome.to.weight).toBe(plain.newWeight);
    }
  });
});

describe("getHoldReason", () => {
  it("is null for an ordinary session, passed or missed", () => {
    expect(getHoldReason("T1", sets("T1", 5, 3))).toBeNull();
    expect(getHoldReason("T2", sets("T2", 3, 10, 4))).toBeNull();
  });

  it("only T2 can be held by a load drop", () => {
    const dropped = sets("T2", 3, 10, 10, { 1: "autoregulated_load_drop" });
    expect(getHoldReason("T2", dropped)).toBe("loadDrop");
    expect(getHoldReason("T1", dropped)).toBeNull();
    expect(getHoldReason("T3", dropped)).toBeNull();
  });
});

describe("the old exports are thin wrappers", () => {
  const STATUSES: SetStatus[] = [
    "completed",
    "failed",
    "skipped_pain",
    "reduced_run_fatigue",
    "reduced_equipment",
    "autoregulated_load_drop",
  ];

  it("evaluateT1Progression and evaluateT2Progression return exactly the new state", () => {
    let cases = 0;
    for (const location of ["gym", "home"] as const) {
      for (const liftType of ["upper", "lower"] as const) {
        for (const lastReps of [0, 1, 2, 3, 5, 8, 10, 12]) {
          for (const status of STATUSES) {
            for (const stage of Object.keys(T1_SCHEME) as T1Stage[]) {
              const [count, reps] = T1_SCHEME[stage];
              const state = lift({ t1Stage: stage, t1Weight: 205 });
              const done = sets("T1", count, reps, lastReps, { 0: status });
              const args = [state, done, location, EQUIPMENT, liftType] as const;
              expect(evaluateT1Progression(...args)).toEqual(evaluateT1(...args).state);
              cases += 1;
            }
            for (const stage of Object.keys(T2_SCHEME) as T2Stage[]) {
              const [count, reps] = T2_SCHEME[stage];
              const state = lift({ t2Stage: stage, t2Weight: 155 });
              const done = sets("T2", count, reps, lastReps, { 0: status });
              const args = [state, done, location, EQUIPMENT, liftType] as const;
              expect(evaluateT2Progression(...args)).toEqual(evaluateT2(...args).state);
              cases += 1;
            }
          }
        }
      }
    }
    expect(cases).toBe(2 * 2 * 8 * 6 * 6);
  });

  it("the outcome always describes the state change it came with", () => {
    for (const lastReps of [0, 2, 3, 6, 10]) {
      for (const status of STATUSES) {
        for (const stage of Object.keys(T1_SCHEME) as T1Stage[]) {
          const [count, reps] = T1_SCHEME[stage];
          const before = lift({ t1Stage: stage });
          const { state, outcome } = evaluateT1(before, sets("T1", count, reps, lastReps, { 0: status }), "gym", EQUIPMENT, "lower");
          expect(outcome.from).toEqual({ weight: before.t1Weight, stage: before.t1Stage });
          expect(outcome.to).toEqual({ weight: state.t1Weight, stage: state.t1Stage });
          expect(outcome.kind === "held").toBe(outcome.reason !== undefined);
        }
        for (const stage of Object.keys(T2_SCHEME) as T2Stage[]) {
          const [count, reps] = T2_SCHEME[stage];
          const before = lift({ t2Stage: stage });
          const { state, outcome } = evaluateT2(before, sets("T2", count, reps, lastReps, { 0: status }), "gym", EQUIPMENT, "lower");
          expect(outcome.from).toEqual({ weight: before.t2Weight, stage: before.t2Stage });
          expect(outcome.to).toEqual({ weight: state.t2Weight, stage: state.t2Stage });
          expect(outcome.kind === "held").toBe(outcome.reason !== undefined);
        }
      }
    }
  });
});

describe("outcome rule ids", () => {
  it("every id names a rule in the evidence registry", () => {
    for (const id of Object.values(OUTCOME_RULE_IDS)) {
      expect(isRuleId(id), id).toBe(true);
    }
  });
});
