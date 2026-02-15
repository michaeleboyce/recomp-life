import { describe, it, expect } from "vitest";
import { calculateMuscleGroupVolume, getWeeklyVolumeSummary } from "./volumeTracking";
import type { SetLog, WorkoutSession } from "@/types";

function makeSet(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: "test-set",
    clientId: "test-client",
    exerciseId: "squat",
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 190,
    isAMRAP: false,
    completedAt: new Date(),
    restAfterSeconds: 180,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    ...overrides,
  };
}

describe("calculateMuscleGroupVolume", () => {
  it("returns empty object for no sets", () => {
    expect(calculateMuscleGroupVolume([])).toEqual({});
  });

  it("counts primary muscles as direct sets", () => {
    const sets = [makeSet({ exerciseId: "squat" })];
    const result = calculateMuscleGroupVolume(sets);
    // Squat primary: left_quad, right_quad
    expect(result["left_quad"]?.directSets).toBe(1);
    expect(result["right_quad"]?.directSets).toBe(1);
    expect(result["left_quad"]?.totalFractional).toBe(1.0);
  });

  it("counts secondary muscles as indirect sets with 0.5 fractional", () => {
    const sets = [makeSet({ exerciseId: "squat" })];
    const result = calculateMuscleGroupVolume(sets);
    // Squat secondary: left_hamstring, right_hamstring, core
    expect(result["left_hamstring"]?.indirectSets).toBe(1);
    expect(result["left_hamstring"]?.totalFractional).toBe(0.5);
    expect(result["core"]?.indirectSets).toBe(1);
  });

  it("skips warm-up sets", () => {
    const sets = [makeSet({ tier: "warmup" })];
    expect(calculateMuscleGroupVolume(sets)).toEqual({});
  });

  it("skips pain-skipped sets", () => {
    const sets = [makeSet({ status: "skipped_pain" })];
    expect(calculateMuscleGroupVolume(sets)).toEqual({});
  });

  it("accumulates volume across multiple sets", () => {
    const sets = [
      makeSet({ exerciseId: "squat", id: "s1" }),
      makeSet({ exerciseId: "squat", id: "s2" }),
      makeSet({ exerciseId: "squat", id: "s3" }),
    ];
    const result = calculateMuscleGroupVolume(sets);
    expect(result["left_quad"]?.directSets).toBe(3);
    expect(result["left_quad"]?.totalFractional).toBe(3.0);
  });

  it("uses substitute exercise when isSubstituted", () => {
    const sets = [makeSet({ exerciseId: "squat", substituteExerciseId: "goblet_squat" })];
    const result = calculateMuscleGroupVolume(sets);
    // Goblet squat primary: left_quad, right_quad (same as squat)
    expect(result["left_quad"]?.directSets).toBe(1);
  });

  it("handles bench press muscles correctly", () => {
    const sets = [makeSet({ exerciseId: "bench" })];
    const result = calculateMuscleGroupVolume(sets);
    // Bench primary: chest
    expect(result["chest"]?.directSets).toBe(1);
    // Bench secondary: left_shoulder, right_shoulder
    expect(result["left_shoulder"]?.indirectSets).toBe(1);
    expect(result["left_shoulder"]?.totalFractional).toBe(0.5);
  });
});

describe("getWeeklyVolumeSummary", () => {
  it("returns empty volumes for no workouts", () => {
    const weekStart = new Date("2026-02-09"); // Monday
    const result = getWeeklyVolumeSummary([], weekStart);
    expect(result.weekStartDate).toEqual(weekStart);
    expect(Object.keys(result.muscleGroups)).toHaveLength(0);
  });

  it("excludes workouts outside the week", () => {
    const weekStart = new Date("2026-02-09");
    const workouts: WorkoutSession[] = [{
      id: "w1",
      clientId: "c1",
      templateId: "A1",
      location: "gym",
      startedAt: new Date("2026-02-08"), // Before week
      completedAt: new Date("2026-02-08"),
      totalDurationSeconds: 3600,
      includeWarmUps: false,
      selectedAccessories: [],
      sets: [makeSet()],
      preWorkoutPainEntries: [],
      modifications: [],
      synced: false,
    }];
    const result = getWeeklyVolumeSummary(workouts, weekStart);
    expect(Object.keys(result.muscleGroups)).toHaveLength(0);
  });

  it("includes workouts within the week", () => {
    const weekStart = new Date("2026-02-09");
    const workouts: WorkoutSession[] = [{
      id: "w1",
      clientId: "c1",
      templateId: "A1",
      location: "gym",
      startedAt: new Date("2026-02-10"),
      completedAt: new Date("2026-02-10"),
      totalDurationSeconds: 3600,
      includeWarmUps: false,
      selectedAccessories: [],
      sets: [makeSet({ exerciseId: "squat" })],
      preWorkoutPainEntries: [],
      modifications: [],
      synced: false,
    }];
    const result = getWeeklyVolumeSummary(workouts, weekStart);
    expect(result.muscleGroups["left_quad"]?.directSets).toBe(1);
  });
});
