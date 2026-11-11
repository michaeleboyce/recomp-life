import { describe, it, expect } from "vitest";
import {
  calculateMuscleGroupVolume,
  calculateGroupVolume,
  getWeeklyVolumeSummary,
} from "./volumeTracking";
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
    synced: false,
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "w1",
    clientId: "c1",
    templateId: "A1",
    location: "gym",
    startedAt: new Date("2026-02-10"),
    completedAt: new Date("2026-02-10"),
    totalDurationSeconds: 3600,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [makeSet()],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
    ...overrides,
  };
}

describe("calculateMuscleGroupVolume (per muscle, R2)", () => {
  it("returns empty object for no sets", () => {
    expect(calculateMuscleGroupVolume([])).toEqual({});
  });

  it("counts primary muscles as direct sets", () => {
    const result = calculateMuscleGroupVolume([makeSet({ exerciseId: "squat" })]);
    expect(result["quads"]?.directSets).toBe(1);
    expect(result["quads"]?.totalFractional).toBe(1.0);
    expect(result["glutes"]?.directSets).toBe(1);
  });

  it("counts secondary muscles as indirect sets with 0.5 fractional", () => {
    const result = calculateMuscleGroupVolume([makeSet({ exerciseId: "squat" })]);
    expect(result["adductors"]?.indirectSets).toBe(1);
    expect(result["adductors"]?.totalFractional).toBe(0.5);
    expect(result["lower_back"]?.indirectSets).toBe(1);
  });

  it("gives stabilisers no volume credit", () => {
    const result = calculateMuscleGroupVolume([makeSet({ exerciseId: "squat" })]);
    expect(result["abs"]).toBeUndefined();
    expect(result["hamstrings"]).toBeUndefined();
  });

  it("keys volume by muscle, never by pain region", () => {
    const result = calculateMuscleGroupVolume([
      makeSet({ exerciseId: "squat" }),
      makeSet({ exerciseId: "bicep_curls" }),
      makeSet({ exerciseId: "calf_raises" }),
    ]);
    for (const key of Object.keys(result)) {
      expect(key).not.toMatch(/^(left|right)_/);
    }
    expect(result["biceps"]?.directSets).toBe(1);
    expect(result["calves"]?.directSets).toBe(1);
  });

  it("skips warm-up sets", () => {
    expect(calculateMuscleGroupVolume([makeSet({ tier: "warmup" })])).toEqual({});
  });

  it("skips pain-skipped sets", () => {
    expect(
      calculateMuscleGroupVolume([makeSet({ status: "skipped_pain" })])
    ).toEqual({});
  });

  it("accumulates volume across multiple sets", () => {
    const result = calculateMuscleGroupVolume([
      makeSet({ exerciseId: "squat", id: "s1" }),
      makeSet({ exerciseId: "squat", id: "s2" }),
      makeSet({ exerciseId: "squat", id: "s3" }),
    ]);
    expect(result["quads"]?.directSets).toBe(3);
    expect(result["quads"]?.totalFractional).toBe(3.0);
  });

  it("uses the substitute exercise when present", () => {
    const result = calculateMuscleGroupVolume([
      makeSet({ exerciseId: "bench", substituteExerciseId: "db_floor_press" }),
    ]);
    // Floor press has triceps as a primary; bench does not.
    expect(result["triceps"]?.directSets).toBe(1);
  });

  it("handles bench press muscles correctly", () => {
    const result = calculateMuscleGroupVolume([makeSet({ exerciseId: "bench" })]);
    expect(result["chest"]?.directSets).toBe(1);
    expect(result["front_delts"]?.indirectSets).toBe(1);
    expect(result["front_delts"]?.totalFractional).toBe(0.5);
    expect(result["triceps"]?.indirectSets).toBe(1);
  });
});

describe("calculateGroupVolume (display groups, R2)", () => {
  it("returns empty object for no sets", () => {
    expect(calculateGroupVolume([])).toEqual({});
  });

  it("counts one squat set as one Quads set, not two", () => {
    const result = calculateGroupVolume([makeSet({ exerciseId: "squat" })]);
    expect(result["Quads"]?.directSets).toBe(1);
    expect(result["Glutes"]?.directSets).toBe(1);
  });

  it("credits curls to Biceps and not Triceps", () => {
    const result = calculateGroupVolume([makeSet({ exerciseId: "bicep_curls" })]);
    expect(result["Biceps"]?.directSets).toBe(1);
    expect(result["Triceps"]).toBeUndefined();
  });

  it("credits a group once per set even with several member muscles", () => {
    // OHP: front_delts primary, side_delts secondary, both in Shoulders.
    const result = calculateGroupVolume([makeSet({ exerciseId: "ohp" })]);
    expect(result["Shoulders"]?.directSets).toBe(1);
    expect(result["Shoulders"]?.indirectSets).toBe(0);
    expect(result["Shoulders"]?.totalFractional).toBe(1.0);
  });

  it("gives a group with only secondary members one indirect set at 0.5", () => {
    // Bench: front_delts secondary only in Shoulders.
    const result = calculateGroupVolume([makeSet({ exerciseId: "bench" })]);
    expect(result["Shoulders"]?.directSets).toBe(0);
    expect(result["Shoulders"]?.indirectSets).toBe(1);
    expect(result["Shoulders"]?.totalFractional).toBe(0.5);
  });

  it("shows calves and lower back", () => {
    const result = calculateGroupVolume([
      makeSet({ exerciseId: "calf_raises" }),
      makeSet({ exerciseId: "back_extensions" }),
    ]);
    expect(result["Calves"]?.directSets).toBe(1);
    expect(result["Lower Back"]?.directSets).toBe(1);
  });

  it("applies the same skip rules as per-muscle volume", () => {
    expect(
      calculateGroupVolume([
        makeSet({ tier: "warmup" }),
        makeSet({ status: "skipped_pain" }),
      ])
    ).toEqual({});
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
    const workouts = [
      makeWorkout({
        startedAt: new Date("2026-02-08"),
        completedAt: new Date("2026-02-08"),
      }),
    ];
    const result = getWeeklyVolumeSummary(workouts, weekStart);
    expect(Object.keys(result.muscleGroups)).toHaveLength(0);
  });

  it("includes workouts within the week", () => {
    const weekStart = new Date("2026-02-09");
    const result = getWeeklyVolumeSummary([makeWorkout()], weekStart);
    expect(result.muscleGroups["quads"]?.directSets).toBe(1);
  });
});
