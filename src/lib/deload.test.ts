import { describe, it, expect } from "vitest";
import type { LiftState, TrainingPhase } from "@/types";
import {
  checkSystemicFatigue,
  generateDeloadPrescription,
  activateDeload,
  completeDeloadSession,
  isConsecutivelyDeclining,
  isConsecutivelyIncreasing,
} from "./deload";

// ---------------------------------------------------------------------------
// Factory helpers
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
    t3Weight: 50,
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

const CUTTING: TrainingPhase = { mode: "cutting" };
const MAINTAINING: TrainingPhase = { mode: "maintaining" };
const BULKING: TrainingPhase = { mode: "bulking" };

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

describe("isConsecutivelyDeclining", () => {
  it("returns true for consecutive drops meeting threshold", () => {
    // threshold=2 => need 3 entries with 2 consecutive drops
    expect(isConsecutivelyDeclining([300, 290, 280], 2)).toBe(true);
  });

  it("returns false when not enough entries", () => {
    expect(isConsecutivelyDeclining([300, 290], 2)).toBe(false);
  });

  it("returns false when trend is not declining", () => {
    expect(isConsecutivelyDeclining([280, 290, 300], 2)).toBe(false);
  });

  it("returns false for equal values", () => {
    expect(isConsecutivelyDeclining([300, 300, 300], 2)).toBe(false);
  });

  it("only checks the last threshold+1 entries", () => {
    // Earlier data is irrelevant; last 3 entries (threshold=2) are 310 > 300 > 290
    expect(isConsecutivelyDeclining([100, 200, 310, 300, 290], 2)).toBe(true);
  });
});

describe("isConsecutivelyIncreasing", () => {
  it("returns true for consecutive increases meeting threshold", () => {
    expect(isConsecutivelyIncreasing([7, 8, 9], 2)).toBe(true);
  });

  it("returns false when not enough entries", () => {
    expect(isConsecutivelyIncreasing([7, 8], 2)).toBe(false);
  });

  it("returns false when trend is not increasing", () => {
    expect(isConsecutivelyIncreasing([9, 8, 7], 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkSystemicFatigue
// ---------------------------------------------------------------------------

describe("checkSystemicFatigue", () => {
  it("returns null when no fatigue signals are present", () => {
    const lifts = [makeLiftState({ recentE1RMs: [300, 305, 310] })];
    expect(checkSystemicFatigue(lifts, CUTTING)).toBeNull();
  });

  it("returns null for empty recentE1RMs arrays", () => {
    const lifts = [
      makeLiftState({ exerciseId: "squat" }),
      makeLiftState({ exerciseId: "bench" }),
      makeLiftState({ exerciseId: "deadlift" }),
      makeLiftState({ exerciseId: "ohp" }),
    ];
    expect(checkSystemicFatigue(lifts, CUTTING)).toBeNull();
  });

  it("e1RM dropping 2 consecutive sessions on cut triggers systemic alert when combined with another signal", () => {
    // Cutting threshold = 2. Two signals across lifts = systemic.
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentE1RMs: [300, 290, 280], // 2 consecutive drops
      }),
      makeLiftState({
        exerciseId: "bench",
        recentE1RMs: [200, 195, 190], // 2 consecutive drops
      }),
    ];
    const alert = checkSystemicFatigue(lifts, CUTTING);
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe("systemic");
    expect(alert!.signals).toHaveLength(2);
    expect(alert!.signals[0].type).toBe("e1rm_decline");
    expect(alert!.signals[1].type).toBe("e1rm_decline");
  });

  it("e1RM dropping 2 sessions on bulk produces only watch (needs 3)", () => {
    // Bulking e1rm threshold = 3. Two drops = not enough.
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentE1RMs: [300, 290, 280], // only 2 consecutive drops, need 3
      }),
    ];
    const alert = checkSystemicFatigue(lifts, BULKING);
    // 2 drops doesn't meet bulking threshold of 3 => no signal
    expect(alert).toBeNull();
  });

  it("e1RM dropping 3 sessions on bulk produces a signal", () => {
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentE1RMs: [310, 300, 290, 280], // 3 consecutive drops
      }),
    ];
    const alert = checkSystemicFatigue(lifts, BULKING);
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe("watch"); // only 1 signal = watch
  });

  it("RPE increasing at same weight 2 sessions on cut triggers signal", () => {
    // Cutting RPE threshold = 2
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentAvgRPEs: [7, 8, 9], // 2 consecutive increases
      }),
      makeLiftState({
        exerciseId: "bench",
        recentAvgRPEs: [7.5, 8, 8.5], // 2 consecutive increases
      }),
    ];
    const alert = checkSystemicFatigue(lifts, CUTTING);
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe("systemic");
    expect(alert!.signals.every((s) => s.type === "rpe_increase")).toBe(true);
  });

  it("AMRAP reps declining 2 sessions triggers signal (cut, no RPE required)", () => {
    // Cutting AMRAP threshold = 2
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentAMRAPReps: [10, 8, 6], // 2 consecutive drops
      }),
      makeLiftState({
        exerciseId: "bench",
        recentAMRAPReps: [12, 10, 8], // 2 consecutive drops
      }),
    ];
    const alert = checkSystemicFatigue(lifts, CUTTING);
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe("systemic");
    expect(alert!.signals.every((s) => s.type === "amrap_decline")).toBe(true);
  });

  it("1 signal from 1 lift returns watch level, not systemic", () => {
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentE1RMs: [300, 290, 280], // 2 consecutive drops on cut threshold
      }),
    ];
    const alert = checkSystemicFatigue(lifts, CUTTING);
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe("watch");
    expect(alert!.signals).toHaveLength(1);
  });

  it("2+ signals across lifts returns systemic fatigue alert", () => {
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentE1RMs: [300, 290, 280], // e1rm_decline signal
      }),
      makeLiftState({
        exerciseId: "bench",
        recentAMRAPReps: [12, 10, 8], // amrap_decline signal
      }),
    ];
    const alert = checkSystemicFatigue(lifts, CUTTING);
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe("systemic");
    expect(alert!.signals).toHaveLength(2);
    const types = alert!.signals.map((s) => s.type);
    expect(types).toContain("e1rm_decline");
    expect(types).toContain("amrap_decline");
  });

  it("multiple signals from the same lift still count towards systemic", () => {
    // A single lift with both e1rm decline and amrap decline = 2 signals = systemic
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentE1RMs: [300, 290, 280],
        recentAMRAPReps: [10, 8, 6],
      }),
    ];
    const alert = checkSystemicFatigue(lifts, CUTTING);
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe("systemic");
    expect(alert!.signals).toHaveLength(2);
  });

  it("bulking RPE threshold is 4 (not 3)", () => {
    // Bulking RPE threshold = 4. Three increases is not enough.
    const lifts = [
      makeLiftState({
        exerciseId: "squat",
        recentAvgRPEs: [6, 7, 8, 9], // 3 consecutive increases, need 4
      }),
    ];
    expect(checkSystemicFatigue(lifts, BULKING)).toBeNull();

    // 4 consecutive increases should trigger
    const lifts2 = [
      makeLiftState({
        exerciseId: "squat",
        recentAvgRPEs: [5, 6, 7, 8, 9], // 4 consecutive increases
      }),
    ];
    const alert = checkSystemicFatigue(lifts2, BULKING);
    expect(alert).not.toBeNull();
    expect(alert!.signals[0].type).toBe("rpe_increase");
  });
});

// ---------------------------------------------------------------------------
// generateDeloadPrescription
// ---------------------------------------------------------------------------

describe("generateDeloadPrescription", () => {
  it("cutting: -15% weight, half T3 volume, drop all accessories", () => {
    const rx = generateDeloadPrescription(CUTTING);
    expect(rx.weightReductionPercent).toBe(15);
    expect(rx.t3VolumeReduction).toBe(0.5);
    expect(rx.dropAllAccessories).toBe(true);
    expect(rx.maxAccessories).toBe(0);
    expect(rx.rpeTarget).toBe("6-7");
  });

  it("maintaining: -10% weight, -25% T3 volume, max 1 accessory", () => {
    const rx = generateDeloadPrescription(MAINTAINING);
    expect(rx.weightReductionPercent).toBe(10);
    expect(rx.t3VolumeReduction).toBe(0.25);
    expect(rx.dropAllAccessories).toBe(false);
    expect(rx.maxAccessories).toBe(1);
    expect(rx.rpeTarget).toBe("6-7");
  });

  it("bulking: -10% weight, keep T3 volume, max 1 accessory", () => {
    const rx = generateDeloadPrescription(BULKING);
    expect(rx.weightReductionPercent).toBe(10);
    expect(rx.t3VolumeReduction).toBe(0);
    expect(rx.dropAllAccessories).toBe(false);
    expect(rx.maxAccessories).toBe(1);
    expect(rx.rpeTarget).toBe("6-7");
  });
});

// ---------------------------------------------------------------------------
// activateDeload
// ---------------------------------------------------------------------------

describe("activateDeload", () => {
  it("correctly stores pre-deload weights and applies reduction (cutting)", () => {
    const state = makeLiftState({ t1Weight: 200, t2Weight: 150 });
    const result = activateDeload(state, CUTTING);

    expect(result.deloadActive).toBe(true);
    expect(result.deloadSessionsRemaining).toBe(4);
    expect(result.preDeloadT1Weight).toBe(200);
    expect(result.preDeloadT2Weight).toBe(150);
    // -15% of 200 = 170, rounded to nearest 5 = 170
    expect(result.t1Weight).toBe(170);
    // -15% of 150 = 127.5, rounded to nearest 5 = 130
    expect(result.t2Weight).toBe(130);
  });

  it("correctly applies -10% reduction for maintaining phase", () => {
    const state = makeLiftState({ t1Weight: 200, t2Weight: 150 });
    const result = activateDeload(state, MAINTAINING);

    expect(result.preDeloadT1Weight).toBe(200);
    expect(result.preDeloadT2Weight).toBe(150);
    // -10% of 200 = 180
    expect(result.t1Weight).toBe(180);
    // -10% of 150 = 135
    expect(result.t2Weight).toBe(135);
  });

  it("correctly applies -10% reduction for bulking phase", () => {
    const state = makeLiftState({ t1Weight: 225, t2Weight: 175 });
    const result = activateDeload(state, BULKING);

    expect(result.preDeloadT1Weight).toBe(225);
    expect(result.preDeloadT2Weight).toBe(175);
    // -10% of 225 = 202.5, rounded = 205
    expect(result.t1Weight).toBe(205);
    // -10% of 175 = 157.5, rounded = 160
    expect(result.t2Weight).toBe(160);
  });

  it("does not mutate the original state", () => {
    const state = makeLiftState({ t1Weight: 200, t2Weight: 150 });
    activateDeload(state, CUTTING);
    expect(state.t1Weight).toBe(200);
    expect(state.deloadActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// completeDeloadSession
// ---------------------------------------------------------------------------

describe("completeDeloadSession", () => {
  it("decrements deloadSessionsRemaining", () => {
    const state = makeLiftState({
      deloadActive: true,
      deloadSessionsRemaining: 4,
      preDeloadT1Weight: 200,
      preDeloadT2Weight: 150,
      t1Weight: 170,
      t2Weight: 130,
    });

    const result = completeDeloadSession(state);
    expect(result.deloadSessionsRemaining).toBe(3);
    expect(result.deloadActive).toBe(true);
    // Weights remain at deload levels
    expect(result.t1Weight).toBe(170);
    expect(result.t2Weight).toBe(130);
  });

  it("deload week tracks sessions remaining across multiple calls", () => {
    let state = makeLiftState({
      deloadActive: true,
      deloadSessionsRemaining: 4,
      preDeloadT1Weight: 200,
      preDeloadT2Weight: 150,
      t1Weight: 170,
      t2Weight: 130,
    });

    state = completeDeloadSession(state); // 4 -> 3
    expect(state.deloadSessionsRemaining).toBe(3);
    expect(state.deloadActive).toBe(true);

    state = completeDeloadSession(state); // 3 -> 2
    expect(state.deloadSessionsRemaining).toBe(2);
    expect(state.deloadActive).toBe(true);

    state = completeDeloadSession(state); // 2 -> 1
    expect(state.deloadSessionsRemaining).toBe(1);
    expect(state.deloadActive).toBe(true);

    state = completeDeloadSession(state); // 1 -> 0, deload ends
    expect(state.deloadSessionsRemaining).toBe(0);
    expect(state.deloadActive).toBe(false);
  });

  it("post-deload: weights revert to pre-deload values", () => {
    let state = makeLiftState({
      deloadActive: true,
      deloadSessionsRemaining: 1,
      preDeloadT1Weight: 200,
      preDeloadT2Weight: 150,
      t1Weight: 170,
      t2Weight: 130,
    });

    state = completeDeloadSession(state);
    expect(state.deloadActive).toBe(false);
    expect(state.t1Weight).toBe(200);
    expect(state.t2Weight).toBe(150);
    expect(state.preDeloadT1Weight).toBeNull();
    expect(state.preDeloadT2Weight).toBeNull();
  });

  it("full deload cycle: activate then complete all sessions", () => {
    let state = makeLiftState({ t1Weight: 200, t2Weight: 150 });

    // Activate deload
    state = activateDeload(state, CUTTING);
    expect(state.deloadActive).toBe(true);
    expect(state.t1Weight).toBe(170); // -15%
    expect(state.t2Weight).toBe(130); // -15%

    // Complete 4 sessions
    for (let i = 0; i < 3; i++) {
      state = completeDeloadSession(state);
      expect(state.deloadActive).toBe(true);
    }
    state = completeDeloadSession(state);

    // After deload: weights restored
    expect(state.deloadActive).toBe(false);
    expect(state.deloadSessionsRemaining).toBe(0);
    expect(state.t1Weight).toBe(200);
    expect(state.t2Weight).toBe(150);
  });

  it("does not mutate the original state", () => {
    const state = makeLiftState({
      deloadActive: true,
      deloadSessionsRemaining: 4,
      preDeloadT1Weight: 200,
      preDeloadT2Weight: 150,
      t1Weight: 170,
      t2Weight: 130,
    });

    completeDeloadSession(state);
    expect(state.deloadSessionsRemaining).toBe(4);
  });
});
