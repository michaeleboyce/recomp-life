import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { EXERCISES } from "@/lib/exercises";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState } from "@/types";
import {
  homeConversionText,
  homeNextSession,
  homeScheme,
  homeSubstitutesOf,
  homeVersionWeight,
  isPerHand,
  programLiftFor,
  validHomeSubstitute,
} from "./homeVersion";

function homePlan(templateId: string, squatT1: number, maxDumbbellWeight = equipment.maxDumbbellWeight) {
  const liftState = {
    exerciseId: "squat",
    t1Weight: squatT1,
    t1Stage: "5x3",
    t2Weight: 135,
    t2Stage: "3x10",
    t3Weight: 0,
  } as LiftState;
  return buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[templateId],
    liftStates: [liftState],
    location: "home",
    equipment: { ...equipment, maxDumbbellWeight },
    includeWarmUps: true,
    selectedAccessories: [],
  });
}

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

describe("homeNextSession", () => {
  const t1 = (weight: number) => ({ weight, sets: 5, reps: 3 });

  it("is the plan entry Today shows when the next home workout does the lift as this substitute", () => {
    // 150 x 0.8 = 120 is too heavy for one 80 lb dumbbell; 60 a hand fits.
    const plan = homePlan("A1", 150);
    const entry = plan.find((e) => e.tier === "T1" && e.exerciseId === "squat")!;
    expect(entry.substituteExerciseId).toBe("bulgarian_split_squat");
    expect(homeNextSession("squat", "bulgarian_split_squat", plan, t1(150), equipment)).toEqual({
      tier: "T1",
      weight: entry.weight,
      perHand: true,
      sets: 5,
      reps: 3,
      isAMRAP: true,
      barbellWeight: 150,
    });
  });

  it("takes the tier the lift has that day", () => {
    const plan = homePlan("A2", 150);
    const entry = plan.find((e) => !e.isWarmUp && e.exerciseId === "squat")!;
    expect(entry.tier).toBe("T2");
    const next = homeNextSession("squat", entry.substituteExerciseId!, plan, t1(150), equipment);
    expect(next).toMatchObject({ tier: "T2", weight: entry.weight, sets: 3, reps: 10, isAMRAP: false, barbellWeight: 135 });
    expect(homeScheme(next)).toBe("3×10");
  });

  it("falls back to the next T1, noting the substitute the plan picked instead", () => {
    // 90 x 0.8 = 72: the goblet squat fits, so the plan picks it.
    const plan = homePlan("A1", 90);
    const next = homeNextSession("squat", "bulgarian_split_squat", plan, t1(90), equipment);
    expect(next).toEqual({
      tier: "T1",
      weight: homeVersionWeight("squat", "bulgarian_split_squat", 90, equipment),
      perHand: true,
      sets: 5,
      reps: 3,
      isAMRAP: true,
      barbellWeight: 90,
      plannedAs: "goblet_squat",
    });
    expect(homeScheme(next)).toBe("5×3+");
  });

  it("falls back to the next T1 when the next workout has no such lift or is not known", () => {
    expect(homeNextSession("squat", "goblet_squat", homePlan("B1", 90), t1(90), equipment).plannedAs).toBeUndefined();
    expect(homeNextSession("squat", "goblet_squat", undefined, t1(90), equipment)).toMatchObject({
      tier: "T1",
      weight: homeVersionWeight("squat", "goblet_squat", 90, equipment),
      perHand: false,
    });
  });
});

describe("homeConversionText", () => {
  it("says how the weight follows from the barbell weight", () => {
    expect(homeConversionText("squat", "bulgarian_split_squat", { weight: 60, barbellWeight: 150 })).toBe(
      "80% of the 150 lbs barbell squat, split between two dumbbells and rounded to 5 lbs."
    );
    expect(homeConversionText("squat", "goblet_squat", { weight: 70, barbellWeight: 90 })).toBe(
      "80% of the 90 lbs barbell squat, in one dumbbell, rounded to 5 lbs."
    );
  });

  it("says when the heaviest dumbbell caps it", () => {
    expect(homeConversionText("squat", "bulgarian_split_squat", { weight: 80, barbellWeight: 245 })).toBe(
      "80% of the 245 lbs barbell squat would be 100 lbs a hand, so it is capped at your heaviest dumbbell."
    );
  });

  it("is empty without a barbell weight", () => {
    expect(homeConversionText("squat", "goblet_squat", { weight: 0, barbellWeight: 0 })).toBe("");
  });
});
