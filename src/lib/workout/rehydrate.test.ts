import { describe, it, expect } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { buildWorkoutPlan } from "./buildPlan";
import { rehydratePlan } from "./rehydrate";
import { EQUIPMENT, makeSet, makeSets, seedLiftStates } from "./testFixtures";

/** A1 at the gym with warm-ups: 4 squat warm-ups, squat T1 (5), bench T2 (3), lat pulldown T3 (3). */
function a1Plan() {
  return buildWorkoutPlan({
    template: WORKOUT_TEMPLATES.A1,
    liftStates: seedLiftStates(),
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: true,
    selectedAccessories: [],
  });
}

const warmUps = () => makeSets("squat", "warmup", 4, 5);

describe("rehydratePlan", () => {
  it("no logged sets: everything at 0 and the index at the start", () => {
    const plan = a1Plan();
    const result = rehydratePlan(plan, []);
    expect(result.currentExerciseIndex).toBe(0);
    expect(result.plan).toEqual(plan);
  });

  it("4 warm-ups + 2 T1 sets: warm-ups complete, T1 at 2, index on the T1 entry", () => {
    const result = rehydratePlan(a1Plan(), [...warmUps(), ...makeSets("squat", "T1", 2, 3)]);
    expect(result.plan.map((e) => e.completedSets)).toEqual([1, 1, 1, 1, 2, 0, 0]);
    expect(result.currentExerciseIndex).toBe(4);
    expect(result.plan[4]).toMatchObject({ exerciseId: "squat", tier: "T1" });
  });

  it("fills several warm-up entries for one exercise in order", () => {
    const result = rehydratePlan(a1Plan(), makeSets("squat", "warmup", 2, 5));
    expect(result.plan.map((e) => e.completedSets)).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(result.currentExerciseIndex).toBe(2);
  });

  it("all sets logged: index is plan.length", () => {
    const plan = a1Plan();
    const result = rehydratePlan(plan, [
      ...warmUps(),
      ...makeSets("squat", "T1", 5, 3),
      ...makeSets("bench", "T2", 3, 10),
      ...makeSets("lat_pulldown", "T3", 3, 15),
    ]);
    expect(result.plan.map((e) => e.completedSets)).toEqual([1, 1, 1, 1, 5, 3, 3]);
    expect(result.currentExerciseIndex).toBe(plan.length);
  });

  it("extra sets never push completedSets above targetSets", () => {
    const result = rehydratePlan(a1Plan(), [
      ...makeSets("squat", "warmup", 6, 5),
      ...makeSets("squat", "T1", 7, 3),
    ]);
    expect(result.plan.map((e) => e.completedSets)).toEqual([1, 1, 1, 1, 5, 0, 0]);
    expect(result.currentExerciseIndex).toBe(5);
  });

  it("does not count warm-up sets towards the working entry or the other way round", () => {
    const result = rehydratePlan(a1Plan(), makeSets("squat", "T1", 1, 3));
    expect(result.plan.map((e) => e.completedSets)).toEqual([0, 0, 0, 0, 1, 0, 0]);
    // The first entry with sets remaining is still the first warm-up.
    expect(result.currentExerciseIndex).toBe(0);
  });

  it("points at the first incomplete entry when a later one was done out of order", () => {
    const result = rehydratePlan(a1Plan(), [
      ...warmUps(),
      ...makeSets("squat", "T1", 5, 3),
      ...makeSets("lat_pulldown", "T3", 3, 15),
    ]);
    expect(result.currentExerciseIndex).toBe(5);
  });

  it("matches substituted sets by template exerciseId", () => {
    const plan = buildWorkoutPlan({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: seedLiftStates(),
      location: "home",
      equipment: EQUIPMENT,
      includeWarmUps: false,
      selectedAccessories: [],
    });
    const result = rehydratePlan(plan, [
      makeSet("squat", "T1", {
        isSubstituted: true,
        substituteExerciseId: "bulgarian_split_squat",
        location: "home",
      }),
    ]);
    expect(result.plan[0].completedSets).toBe(1);
    expect(result.currentExerciseIndex).toBe(0);
  });

  it("ignores sets that match no plan entry", () => {
    const result = rehydratePlan(a1Plan(), makeSets("deadlift", "T1", 3, 3));
    expect(result.plan.every((e) => e.completedSets === 0)).toBe(true);
    expect(result.currentExerciseIndex).toBe(0);
  });

  it("overwrites stale completedSets on the incoming plan and does not mutate it", () => {
    const plan = a1Plan().map((e) => ({ ...e, completedSets: 1 }));
    const snapshot = structuredClone(plan);
    const result = rehydratePlan(plan, []);
    expect(result.plan.every((e) => e.completedSets === 0)).toBe(true);
    expect(plan).toEqual(snapshot);
    expect(result.plan).not.toBe(plan);
  });

  it("resumes a T2 entry at the weight of its last logged set (accepted load drop)", () => {
    const result = rehydratePlan(a1Plan(), [
      ...warmUps(),
      ...makeSets("squat", "T1", 5, 3, { weight: 190 }),
      makeSet("bench", "T2", { weight: 100, setNumber: 1 }),
      makeSet("bench", "T2", { weight: 90, setNumber: 2, status: "autoregulated_load_drop" }),
    ]);
    expect(result.plan[5]).toMatchObject({ exerciseId: "bench", tier: "T2", completedSets: 2, weight: 90 });
    expect(result.currentExerciseIndex).toBe(5);
  });

  it("keeps each warm-up entry's own weight", () => {
    const plan = a1Plan();
    const result = rehydratePlan(plan, makeSets("squat", "warmup", 4, 5, { weight: 45 }));
    expect(result.plan.slice(0, 4).map((e) => e.weight)).toEqual(plan.slice(0, 4).map((e) => e.weight));
  });

  it("an empty plan gives index 0", () => {
    expect(rehydratePlan([], makeSets("squat", "T1", 2, 3))).toEqual({
      plan: [],
      currentExerciseIndex: 0,
    });
  });
});
