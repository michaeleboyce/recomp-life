import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { EXERCISES } from "@/lib/exercises";
import {
  homeSubstitutesOf,
  homeVersionWeight,
  isPerHand,
  programLiftFor,
  validHomeSubstitute,
} from "./homeVersion";

const equipment = DEFAULT_USER_PROFILE.settings.equipment;

describe("home substitutes", () => {
  it("lists the dumbbell alternative and the fallback chain", () => {
    expect(homeSubstitutesOf("squat")).toEqual(["goblet_squat", "bulgarian_split_squat", "db_lunge"]);
    expect(homeSubstitutesOf("bench")).toContain("db_floor_press");
  });

  it("accepts only a known substitute of this lift", () => {
    expect(validHomeSubstitute("squat", "goblet_squat")).toBe("goblet_squat");
    expect(validHomeSubstitute("squat", "db_bench")).toBeUndefined();
    expect(validHomeSubstitute("squat", "nonsense")).toBeUndefined();
    expect(validHomeSubstitute("squat", null)).toBeUndefined();
  });

  it("finds the program lift a substitute counts toward", () => {
    expect(programLiftFor("goblet_squat")).toBe("squat");
    expect(programLiftFor("db_floor_press")).toBe("bench");
    expect(programLiftFor("single_leg_db_rdl")).toBe("deadlift");
    expect(programLiftFor("hammer_curls")).toBeUndefined();
  });
});

describe("homeVersionWeight", () => {
  it("matches the plan's adaptation when it chose this substitute", () => {
    const adaptation = adaptExerciseForHome(EXERCISES.squat, 190, equipment, EXERCISES.goblet_squat);
    expect(homeVersionWeight("squat", adaptation.adaptedExercise.id, 190, equipment)).toBe(
      adaptation.adaptedWeight
    );
  });

  it("converts for a substitute the plan did not choose, capped at the heaviest dumbbell", () => {
    // 100 x 0.8 = 80 total, 40 a hand: the floor press is not offered when DB bench fits.
    expect(homeVersionWeight("bench", "db_floor_press", 100, equipment)).toBe(40);
    expect(homeVersionWeight("squat", "goblet_squat", 300, equipment)).toBe(equipment.maxDumbbellWeight);
  });

  it("is 0 with no barbell weight", () => {
    expect(homeVersionWeight("squat", "goblet_squat", 0, equipment)).toBe(0);
  });

  it("knows per-hand weights", () => {
    expect(isPerHand("db_bench")).toBe(true);
    expect(isPerHand("goblet_squat")).toBe(false);
  });
});
