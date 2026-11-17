import { describe, expect, it } from "vitest";
import { clampWeight, differsFromPlan, setDiffers, weightUnit, withSet } from "./setPlanModel";

const plan = [
  { weight: 150, reps: 3, role: "ramp" as const },
  { weight: 190, reps: 3 },
];

describe("setPlanModel", () => {
  it("says whether a set differs from the plan's set at its place", () => {
    expect(setDiffers({ weight: 190, reps: 3 }, plan[1])).toBe(false);
    expect(setDiffers({ weight: 185, reps: 3 }, plan[1])).toBe(true);
    expect(setDiffers({ weight: 190, reps: 5 }, plan[1])).toBe(true);
    expect(setDiffers({ weight: 190, reps: 5 }, undefined)).toBe(false);
  });

  it("says whether the sets as a whole are the plan's", () => {
    expect(differsFromPlan(plan, plan)).toBe(false);
    expect(differsFromPlan([plan[0]], plan)).toBe(true);
    expect(differsFromPlan(withSet(plan, 1, { weight: 200 }), plan)).toBe(true);
  });

  it("keeps a weight within its limits", () => {
    expect(clampWeight(30, 45)).toBe(45);
    expect(clampWeight(80, 0, 50)).toBe(50);
    expect(clampWeight(40, 0, 50)).toBe(40);
  });

  it("changes one set and leaves the others alone", () => {
    const next = withSet(plan, 0, { reps: 5 });
    expect(next[0]).toEqual({ weight: 150, reps: 5, role: "ramp" });
    expect(next[1]).toBe(plan[1]);
  });

  it("names the unit, per dumbbell where it is per hand", () => {
    expect(weightUnit(false)).toBe("lbs");
    expect(weightUnit(true)).toBe("lbs a hand");
  });
});
