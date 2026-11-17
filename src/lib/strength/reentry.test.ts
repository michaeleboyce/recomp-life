import { describe, it, expect } from "vitest";
import { calculateE1RM } from "@/lib/e1rm";
import {
  barbellReentryWeight,
  homeReentryWeight,
  impliedWeightForReps,
  roundDownToDumbbell,
  roundDownToPlates,
} from "./reentry";

const GYM = { barWeight: 45, availablePlates: [45, 35, 25, 10, 5, 2.5] };
const HOME = { maxDumbbellWeight: 80, dumbbellIncrementLbs: 5 };

describe("impliedWeightForReps", () => {
  it("inverts the app's formula: the heaviest weight for that many reps", () => {
    expect(impliedWeightForReps(calculateE1RM(225, 3)!, 3)).toBeCloseTo(225, 0);
    expect(impliedWeightForReps(300, 1)).toBeCloseTo(300 / (1 + 1 / 30), 10);
  });
});

describe("rounding", () => {
  it("rounds down to a load the plates can make, never under the bar", () => {
    expect(roundDownToPlates(231.8, GYM)).toBe(230);
    expect(roundDownToPlates(229, GYM)).toBe(225);
    expect(roundDownToPlates(30, GYM)).toBe(45);
  });

  it("rounds down to the dumbbell increment, never under one increment", () => {
    expect(roundDownToDumbbell(56.8, 5)).toBe(55);
    expect(roundDownToDumbbell(55, 5)).toBe(55);
    expect(roundDownToDumbbell(2, 5)).toBe(5);
  });
});

describe("barbellReentryWeight", () => {
  const base = { lastWeight: 225, stepsEarned: 0, stepLbs: 10, targetReps: 3, equipment: GYM };

  it("with no home passes and an estimate that supports it, returns the last weight", () => {
    const result = barbellReentryWeight({ ...base, estimate: calculateE1RM(225, 8)! })!;
    expect(result.weight).toBe(225);
    expect(result.rule).toBe("steps");
  });

  it("adds the steps home passes earned when the estimate supports them", () => {
    const result = barbellReentryWeight({ ...base, stepsEarned: 2, estimate: 285 })!;
    expect(result.fromSteps).toBe(245);
    expect(result.fromEstimate).toBe(255); // 285 / 1.1 = 259.1, down to plates
    expect(result.weight).toBe(245);
    expect(result.rule).toBe("steps");
  });

  it("takes the estimate's weight when it is smaller, rounded down to plates", () => {
    const result = barbellReentryWeight({ ...base, stepsEarned: 2, estimate: 255 })!;
    expect(result.fromEstimate).toBe(230); // 255 / 1.1 = 231.8
    expect(result.weight).toBe(230);
    expect(result.rule).toBe("estimate");
  });

  it("uses whichever rule exists when the other is missing", () => {
    expect(barbellReentryWeight({ ...base, lastWeight: null, estimate: 255 })?.weight).toBe(230);
    expect(barbellReentryWeight({ ...base, stepsEarned: 1, estimate: null })?.weight).toBe(235);
    expect(barbellReentryWeight({ ...base, lastWeight: null, estimate: null })).toBeNull();
  });

  it("ignores an estimate that is not a positive number", () => {
    for (const estimate of [0, -5, Number.NaN]) {
      const result = barbellReentryWeight({ ...base, stepsEarned: 1, estimate })!;
      expect(result.weight).toBe(235);
      expect(result.fromEstimate).toBeNull();
    }
    expect(barbellReentryWeight({ ...base, lastWeight: null, estimate: 0 })).toBeNull();
  });

  it("uses the current stage's reps", () => {
    const fiveByThree = barbellReentryWeight({ ...base, lastWeight: null, estimate: 270 })!;
    const tenByOne = barbellReentryWeight({ ...base, lastWeight: null, estimate: 270, targetReps: 1 })!;
    expect(tenByOne.weight).toBeGreaterThan(fiveByThree.weight);
  });
});

describe("homeReentryWeight", () => {
  const base = {
    lastWeight: 50,
    stepsEarned: 2,
    targetReps: 3,
    exerciseId: "bulgarian_split_squat",
    equipment: HOME,
  };

  it("adds dumbbell steps to the last home weight when the estimate supports them", () => {
    // 300 × 0.5 = 150 total; 150 / 1.1 = 136.4 total; 68.2 a hand -> 65.
    const result = homeReentryWeight({ ...base, estimate: 300, ratio: 0.5 })!;
    expect(result.fromSteps).toBe(60);
    expect(result.fromEstimate).toBe(65);
    expect(result.weight).toBe(60);
    expect(result.rule).toBe("steps");
  });

  it("ignores an estimate that is not a positive number", () => {
    for (const estimate of [0, -5, Number.NaN]) {
      const result = homeReentryWeight({ ...base, estimate, ratio: 0.5 })!;
      expect(result.weight).toBe(60);
      expect(result.fromEstimate).toBeNull();
    }
  });

  it("takes the estimate's weight per hand when it is smaller", () => {
    // 250 × 0.5 = 125 total; 113.6 total; 56.8 a hand -> 55.
    const result = homeReentryWeight({ ...base, estimate: 250, ratio: 0.5 })!;
    expect(result.weight).toBe(55);
    expect(result.rule).toBe("estimate");
  });

  it("keeps a one-dumbbell exercise's weight whole", () => {
    const result = homeReentryWeight({
      ...base,
      exerciseId: "goblet_squat",
      lastWeight: null,
      estimate: 250,
      ratio: 0.45,
    })!;
    // 112.5 total; / 1.1 = 102.3 -> capped at 80.
    expect(result.fromEstimate).toBe(100);
    expect(result.weight).toBe(80);
    expect(result.rule).toBe("cap");
  });

  it("is capped by the heaviest dumbbell", () => {
    const result = homeReentryWeight({ ...base, lastWeight: 80, stepsEarned: 3, estimate: 500, ratio: 0.5 })!;
    expect(result.weight).toBe(HOME.maxDumbbellWeight);
    expect(result.rule).toBe("cap");
  });

  it("needs a last weight or an estimate with a ratio", () => {
    expect(homeReentryWeight({ ...base, lastWeight: null, estimate: 250, ratio: null })).toBeNull();
    expect(homeReentryWeight({ ...base, estimate: null, ratio: 0.5 })?.weight).toBe(60);
  });
});
