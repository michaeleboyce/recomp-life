import { describe, it, expect } from "vitest";
import {
  calculateWeightDecay,
  getExerciseDecaySuggestions,
} from "./weightDecay";
import type { LiftState, TrainingPhase } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
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

const maintaining: TrainingPhase = { mode: "maintaining" };
const cutting: TrainingPhase = { mode: "cutting" };
const bulking: TrainingPhase = { mode: "bulking" };

// ---------------------------------------------------------------------------
// calculateWeightDecay
// ---------------------------------------------------------------------------

describe("calculateWeightDecay", () => {
  describe("decay tiers", () => {
    it("0 days — no decay", () => {
      const result = calculateWeightDecay(0, 200, maintaining);
      expect(result.tier).toBe("none");
      expect(result.decayPercent).toBe(0);
      expect(result.decayedWeight).toBe(200);
    });

    it("13 days — still no decay (within grace period)", () => {
      const result = calculateWeightDecay(13, 200, maintaining);
      expect(result.tier).toBe("none");
      expect(result.decayedWeight).toBe(200);
    });

    it("14 days — mild decay (10%)", () => {
      const result = calculateWeightDecay(14, 200, maintaining);
      expect(result.tier).toBe("mild");
      expect(result.decayPercent).toBe(0.1);
      expect(result.decayedWeight).toBe(180);
    });

    it("21 days — still mild", () => {
      const result = calculateWeightDecay(21, 200, maintaining);
      expect(result.tier).toBe("mild");
      expect(result.decayedWeight).toBe(180);
    });

    it("22 days — moderate decay (20%)", () => {
      const result = calculateWeightDecay(22, 200, maintaining);
      expect(result.tier).toBe("moderate");
      expect(result.decayPercent).toBe(0.2);
      expect(result.decayedWeight).toBe(160);
    });

    it("42 days — still moderate", () => {
      const result = calculateWeightDecay(42, 200, maintaining);
      expect(result.tier).toBe("moderate");
      expect(result.decayedWeight).toBe(160);
    });

    it("43 days — significant decay (30%)", () => {
      const result = calculateWeightDecay(43, 200, maintaining);
      expect(result.tier).toBe("significant");
      expect(result.decayPercent).toBe(0.3);
      expect(result.decayedWeight).toBe(140);
    });

    it("60 days — still significant", () => {
      const result = calculateWeightDecay(60, 200, maintaining);
      expect(result.tier).toBe("significant");
      expect(result.decayedWeight).toBe(140);
    });

    it("61 days — severe decay (40%)", () => {
      const result = calculateWeightDecay(61, 200, maintaining);
      expect(result.tier).toBe("severe");
      expect(result.decayPercent).toBe(0.4);
      expect(result.decayedWeight).toBe(120);
    });

    it("1000 days — still severe (capped at 40%)", () => {
      const result = calculateWeightDecay(1000, 200, maintaining);
      expect(result.tier).toBe("severe");
      expect(result.decayPercent).toBe(0.4);
      expect(result.decayedWeight).toBe(120);
    });
  });

  describe("phase multipliers", () => {
    it("cutting: 10% base * 1.25 = 12.5% at mild tier", () => {
      const result = calculateWeightDecay(14, 200, cutting);
      expect(result.decayPercent).toBe(0.125);
      // 200 * 0.875 = 175
      expect(result.decayedWeight).toBe(175);
    });

    it("bulking: 10% base * 0.75 = 7.5% at mild tier", () => {
      const result = calculateWeightDecay(14, 200, bulking);
      expect(result.decayPercent).toBeCloseTo(0.075);
      // 200 * 0.925 = 185
      expect(result.decayedWeight).toBe(185);
    });

    it("cutting at severe tier is capped at 50%", () => {
      // 40% base * 1.25 = 50%, exactly at cap
      const result = calculateWeightDecay(61, 200, cutting);
      expect(result.decayPercent).toBe(0.5);
      expect(result.decayedWeight).toBe(100);
    });

    it("bulking at severe tier: 40% * 0.75 = 30%", () => {
      const result = calculateWeightDecay(61, 200, bulking);
      expect(result.decayPercent).toBeCloseTo(0.3);
      expect(result.decayedWeight).toBe(140);
    });
  });

  describe("weight rounding", () => {
    it("rounds decayed weight to nearest 5", () => {
      // 135 * 0.9 = 121.5 -> rounds to 120
      const result = calculateWeightDecay(14, 135, maintaining);
      expect(result.decayedWeight).toBe(120);
    });
  });

  describe("edge cases", () => {
    it("0 weight returns 0", () => {
      const result = calculateWeightDecay(30, 0, maintaining);
      expect(result.decayedWeight).toBe(0);
    });

    it("negative days returns no decay", () => {
      const result = calculateWeightDecay(-5, 200, maintaining);
      expect(result.tier).toBe("none");
      expect(result.decayedWeight).toBe(200);
    });

    it("message includes weeks and suggested weight", () => {
      const result = calculateWeightDecay(28, 200, maintaining);
      expect(result.message).toContain("4 weeks");
      expect(result.message).toContain("160 lbs");
    });
  });
});

// ---------------------------------------------------------------------------
// getExerciseDecaySuggestions
// ---------------------------------------------------------------------------

describe("getExerciseDecaySuggestions", () => {
  const now = new Date("2026-02-14T12:00:00Z");

  it("returns empty for recent workouts", () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const ls = makeLiftState({
      exerciseId: "squat",
      t1LastWorkoutDate: twoDaysAgo,
    });
    const result = getExerciseDecaySuggestions(
      [{ exerciseId: "squat", tier: "T1" }],
      [ls],
      maintaining,
      now
    );
    expect(result).toHaveLength(0);
  });

  it("returns suggestion for stale T1 workout", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ls = makeLiftState({
      exerciseId: "squat",
      t1Weight: 200,
      t1LastWorkoutDate: thirtyDaysAgo,
    });
    const result = getExerciseDecaySuggestions(
      [{ exerciseId: "squat", tier: "T1" }],
      [ls],
      maintaining,
      now
    );
    expect(result).toHaveLength(1);
    expect(result[0].exerciseId).toBe("squat");
    expect(result[0].tier).toBe("T1");
    expect(result[0].suggestedWeight).toBe(160);
    expect(result[0].decayTier).toBe("moderate");
  });

  it("uses independent T1/T2 dates", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const ls = makeLiftState({
      exerciseId: "squat",
      t1Weight: 200,
      t2Weight: 150,
      t1LastWorkoutDate: thirtyDaysAgo,
      t2LastWorkoutDate: fiveDaysAgo,
    });
    const result = getExerciseDecaySuggestions(
      [
        { exerciseId: "squat", tier: "T1" },
        { exerciseId: "squat", tier: "T2" },
      ],
      [ls],
      maintaining,
      now
    );
    // Only T1 should have a suggestion (T2 is recent)
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe("T1");
  });

  it("skips T3 and accessory exercises", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ls = makeLiftState({
      exerciseId: "lat-pulldown",
      t1LastWorkoutDate: thirtyDaysAgo,
    });
    const result = getExerciseDecaySuggestions(
      [{ exerciseId: "lat-pulldown", tier: "T3" }],
      [ls],
      maintaining,
      now
    );
    expect(result).toHaveLength(0);
  });

  it("skips exercises with deloadActive", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ls = makeLiftState({
      exerciseId: "squat",
      t1Weight: 200,
      t1LastWorkoutDate: thirtyDaysAgo,
      deloadActive: true,
    });
    const result = getExerciseDecaySuggestions(
      [{ exerciseId: "squat", tier: "T1" }],
      [ls],
      maintaining,
      now
    );
    expect(result).toHaveLength(0);
  });

  it("skips exercises with null last workout date", () => {
    const ls = makeLiftState({
      exerciseId: "squat",
      t1LastWorkoutDate: null,
    });
    const result = getExerciseDecaySuggestions(
      [{ exerciseId: "squat", tier: "T1" }],
      [ls],
      maintaining,
      now
    );
    expect(result).toHaveLength(0);
  });
});
