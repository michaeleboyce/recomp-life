// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import {
  estimateWorkoutMinutes,
  formatPrChance,
  formatSetsReps,
  formatTodayDate,
  shortLiftName,
} from "./format";

function entry(overrides: Partial<WorkoutExerciseState>): WorkoutExerciseState {
  return {
    exerciseId: "squat",
    tier: "T1",
    targetSets: 5,
    targetReps: 3,
    weight: 200,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 0,
    ...overrides,
  };
}

describe("shortLiftName", () => {
  it("drops the equipment prefix of the main barbell lifts", () => {
    expect(shortLiftName("squat")).toBe("Squat");
    expect(shortLiftName("deadlift")).toBe("Deadlift");
    expect(shortLiftName("ohp")).toBe("OHP");
    expect(shortLiftName("lat_pulldown")).toBe("Lat Pulldown");
  });

  it("falls back to the id for an unknown exercise", () => {
    expect(shortLiftName("mystery")).toBe("mystery");
  });
});

describe("formatSetsReps", () => {
  it("marks AMRAP with a plus", () => {
    expect(formatSetsReps(entry({}))).toBe("5×3+");
    expect(formatSetsReps(entry({ targetSets: 3, targetReps: 10, isAMRAP: false }))).toBe("3×10");
  });
});

describe("estimateWorkoutMinutes", () => {
  it("adds rest and set time for working sets and rounds to 5 minutes", () => {
    const plan = [
      entry({}),
      entry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, isAMRAP: false }),
      entry({ exerciseId: "lat_pulldown", tier: "T3", targetSets: 3, targetReps: 15 }),
    ];
    // 5 x (180 + 45) + 3 x (120 + 45) + 3 x (90 + 45) = 1125 + 495 + 405 = 2025 s = 33.75 min
    expect(estimateWorkoutMinutes(plan)).toBe(35);
  });

  it("counts warm-up sets with their shorter rest", () => {
    const withWarmUps = [entry({ tier: "warmup", isWarmUp: true, targetSets: 1, targetReps: 5 }), entry({})];
    expect(estimateWorkoutMinutes(withWarmUps)).toBeGreaterThanOrEqual(estimateWorkoutMinutes([entry({})]));
  });

  it("is at least 5 minutes", () => {
    expect(estimateWorkoutMinutes([])).toBe(5);
  });
});

describe("formatPrChance", () => {
  it("words each chance and leaves unknown unsaid", () => {
    expect(formatPrChance("likely")).toBe("Likely.");
    expect(formatPrChance("stretch")).toBe("A stretch.");
    expect(formatPrChance("unlikely")).toBe("Unlikely.");
    expect(formatPrChance("unknown")).toBe("");
  });
});

describe("formatTodayDate", () => {
  it("gives weekday, short month and day", () => {
    expect(formatTodayDate(new Date(2026, 10, 11))).toBe("Wednesday, Nov 11");
  });
});
