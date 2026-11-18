import { describe, expect, it } from "vitest";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout";
import { addEditFor } from "./planChanges";

function e(over: Partial<WorkoutExerciseState>): WorkoutExerciseState {
  return {
    exerciseId: "squat",
    tier: "T1",
    targetSets: 5,
    targetReps: 3,
    weight: 190,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 0,
    ...over,
  };
}

const PLAN: WorkoutPlan = [
  e({ exerciseId: "bench", tier: "warmup", isWarmUp: true }),
  e({}),
  e({ exerciseId: "deadlift", substituteExerciseId: "db_rdl", tier: "T2" }),
];
const SCHEME = { sets: 3, reps: 12, weight: 30, isAMRAP: true };

describe("addEditFor", () => {
  it("is an add edit with the scheme as given", () => {
    expect(addEditFor(PLAN, "bicep_curls", SCHEME)).toEqual({ kind: "add", exerciseId: "bicep_curls", ...SCHEME });
  });

  it("refuses an unknown exercise, or one already in the workout as itself or a stand-in", () => {
    expect(() => addEditFor(PLAN, "nope", SCHEME)).toThrow("That exercise is not in the library.");
    expect(() => addEditFor(PLAN, "squat", SCHEME)).toThrow("is already in this workout.");
    expect(() => addEditFor(PLAN, "db_rdl", SCHEME)).toThrow("is already in this workout.");
  });

  it("does not count a warm-up as the exercise being in the workout", () => {
    expect(addEditFor(PLAN, "bench", SCHEME)).toMatchObject({ kind: "add", exerciseId: "bench" });
  });

  it("refuses a scheme that is not whole sets and reps of at least 1, or a weight below 0", () => {
    expect(() => addEditFor(PLAN, "bicep_curls", { ...SCHEME, sets: 0 })).toThrow("Sets and reps must be whole numbers of at least 1.");
    expect(() => addEditFor(PLAN, "bicep_curls", { ...SCHEME, reps: 2.5 })).toThrow("Sets and reps must be whole numbers of at least 1.");
    expect(() => addEditFor(PLAN, "bicep_curls", { ...SCHEME, weight: -5 })).toThrow("The weight must be 0 or more.");
    expect(() => addEditFor(PLAN, "bicep_curls", { ...SCHEME, weight: Number.NaN })).toThrow("The weight must be 0 or more.");
  });
});
