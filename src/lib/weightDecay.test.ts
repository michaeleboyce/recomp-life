import { describe, it, expect } from "vitest";
import {
  calculateWeightDecay,
  getExerciseDecaySuggestions,
  DECAY_TIERS,
  MAX_DECAY,
} from "./weightDecay";
import { LONG_BREAK_DAYS } from "./recovery";
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

    it("14 days — no decay: two weeks off costs little or no strength", () => {
      const result = calculateWeightDecay(14, 200, maintaining);
      expect(result.tier).toBe("none");
      expect(result.decayedWeight).toBe(200);
    });

    it("20 days — still no decay (within grace period)", () => {
      const result = calculateWeightDecay(20, 200, maintaining);
      expect(result.tier).toBe("none");
      expect(result.decayedWeight).toBe(200);
    });

    it("21 days — mild decay (5%)", () => {
      const result = calculateWeightDecay(21, 200, maintaining);
      expect(result.tier).toBe("mild");
      expect(result.decayPercent).toBe(0.05);
      expect(result.decayedWeight).toBe(190);
    });

    it("41 days — still mild", () => {
      const result = calculateWeightDecay(41, 200, maintaining);
      expect(result.tier).toBe("mild");
      expect(result.decayedWeight).toBe(190);
    });

    it("42 days — moderate decay (10%)", () => {
      const result = calculateWeightDecay(42, 200, maintaining);
      expect(result.tier).toBe("moderate");
      expect(result.decayPercent).toBe(0.1);
      expect(result.decayedWeight).toBe(180);
    });

    it("69 days — still moderate", () => {
      const result = calculateWeightDecay(69, 200, maintaining);
      expect(result.tier).toBe("moderate");
      expect(result.decayedWeight).toBe(180);
    });

    it("70 days — significant decay (15%)", () => {
      const result = calculateWeightDecay(70, 200, maintaining);
      expect(result.tier).toBe("significant");
      expect(result.decayPercent).toBe(0.15);
      expect(result.decayedWeight).toBe(170);
    });

    it("1000 days — still significant (15%)", () => {
      const result = calculateWeightDecay(1000, 200, maintaining);
      expect(result.tier).toBe("significant");
      expect(result.decayPercent).toBe(0.15);
      expect(result.decayedWeight).toBe(170);
    });

    it("tiers are contiguous and start at the shared long-break threshold", () => {
      expect(DECAY_TIERS[0].maxDays).toBe(LONG_BREAK_DAYS - 1);
      expect(DECAY_TIERS[DECAY_TIERS.length - 1].maxDays).toBe(Infinity);
      for (let i = 1; i < DECAY_TIERS.length; i++) {
        expect(DECAY_TIERS[i].maxDays).toBeGreaterThan(DECAY_TIERS[i - 1].maxDays);
        expect(DECAY_TIERS[i].baseDecay).toBeGreaterThan(DECAY_TIERS[i - 1].baseDecay);
      }
    });
  });

  describe("phase multipliers", () => {
    it("cutting: 10% base * 1.25 = 12.5% at moderate tier", () => {
      const result = calculateWeightDecay(42, 200, cutting);
      expect(result.decayPercent).toBe(0.125);
      // 200 * 0.875 = 175
      expect(result.decayedWeight).toBe(175);
    });

    it("bulking: 10% base * 0.75 = 7.5% at moderate tier", () => {
      const result = calculateWeightDecay(42, 200, bulking);
      expect(result.decayPercent).toBeCloseTo(0.075);
      // 200 * 0.925 = 185
      expect(result.decayedWeight).toBe(185);
    });

    it("cutting at the longest tier: 15% * 1.25 = 18.75%, under the cap", () => {
      const result = calculateWeightDecay(100, 200, cutting);
      expect(result.decayPercent).toBeCloseTo(0.1875);
      expect(result.decayPercent).toBeLessThanOrEqual(MAX_DECAY);
      // 200 * 0.8125 = 162.5 -> rounds to 165
      expect(result.decayedWeight).toBe(165);
    });

    it("never suggests more than the 20% cap", () => {
      for (const phase of [cutting, maintaining, bulking]) {
        for (const days of [21, 42, 70, 400]) {
          expect(calculateWeightDecay(days, 200, phase).decayPercent).toBeLessThanOrEqual(MAX_DECAY);
        }
      }
    });
  });

  describe("weight rounding", () => {
    it("rounds decayed weight to nearest 5", () => {
      // 135 * 0.9 = 121.5 -> rounds to 120
      const result = calculateWeightDecay(42, 135, maintaining);
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
      expect(result.message).toContain("190 lbs");
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
    expect(result[0].suggestedWeight).toBe(190);
    expect(result[0].decayTier).toBe("mild");
  });

  it("returns nothing for a 2-week gap", () => {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const ls = makeLiftState({
      exerciseId: "squat",
      t1Weight: 200,
      t1LastWorkoutDate: fourteenDaysAgo,
    });
    const result = getExerciseDecaySuggestions(
      [{ exerciseId: "squat", tier: "T1" }],
      [ls],
      maintaining,
      now
    );
    expect(result).toHaveLength(0);
  });

  it("skips a suggestion that rounds back to the current weight", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // 45 * 0.95 = 42.75 -> rounds to 45: no real change to suggest
    const ls = makeLiftState({
      exerciseId: "ohp",
      t1Weight: 45,
      t1LastWorkoutDate: thirtyDaysAgo,
    });
    const result = getExerciseDecaySuggestions(
      [{ exerciseId: "ohp", tier: "T1" }],
      [ls],
      maintaining,
      now
    );
    expect(result).toHaveLength(0);
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
