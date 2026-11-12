import { describe, it, expect } from "vitest";
import { INITIAL_LIFT_STATES } from "@/db/seed";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, T1Stage, T2Stage, WorkoutTemplateExercise } from "@/types";
import { getPrescription, T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "./prescription";

const [squatT1, benchT2, latT3] = WORKOUT_TEMPLATES.A1.exercises;
const squat = INITIAL_LIFT_STATES.squat;
const bench = INITIAL_LIFT_STATES.bench;

describe("stage schemes", () => {
  it("match the GZCLP stage tables", () => {
    expect(T1_STAGE_SCHEME).toEqual({
      "5x3": { sets: 5, reps: 3 },
      "6x2": { sets: 6, reps: 2 },
      "10x1": { sets: 10, reps: 1 },
    });
    expect(T2_STAGE_SCHEME).toEqual({
      "3x10": { sets: 3, reps: 10 },
      "3x8": { sets: 3, reps: 8 },
      "3x6": { sets: 3, reps: 6 },
    });
  });
});

describe("getPrescription", () => {
  it("T1 uses t1Weight and the T1 stage scheme", () => {
    expect(getPrescription(squatT1, squat)).toEqual({ weight: 190, sets: 5, reps: 3 });
  });

  it.each<[T1Stage, number, number]>([
    ["5x3", 5, 3],
    ["6x2", 6, 2],
    ["10x1", 10, 1],
  ])("T1 stage %s -> %i x %i regardless of the template's sets/reps", (stage, sets, reps) => {
    const ls: LiftState = { ...squat, t1Stage: stage };
    expect(getPrescription(squatT1, ls)).toEqual({ weight: 190, sets, reps });
  });

  it("T2 uses t2Weight and the T2 stage scheme", () => {
    expect(getPrescription(benchT2, bench)).toEqual({ weight: 100, sets: 3, reps: 10 });
  });

  it.each<[T2Stage, number, number]>([
    ["3x10", 3, 10],
    ["3x8", 3, 8],
    ["3x6", 3, 6],
  ])("T2 stage %s -> %i x %i", (stage, sets, reps) => {
    const ls: LiftState = { ...bench, t2Stage: stage };
    expect(getPrescription(benchT2, ls)).toEqual({ weight: 100, sets, reps });
  });

  it("T3 uses t3Weight with the template's sets and reps", () => {
    expect(getPrescription(latT3, INITIAL_LIFT_STATES.lat_pulldown)).toEqual({
      weight: 90,
      sets: 3,
      reps: 15,
    });
  });

  it("with no lift state the weight is 0 and sets/reps come from the template", () => {
    expect(getPrescription(squatT1, undefined)).toEqual({ weight: 0, sets: 5, reps: 3 });
    expect(getPrescription(latT3, undefined)).toEqual({ weight: 0, sets: 3, reps: 15 });
  });

  it("other tiers fall back to weight 0 and the template's sets/reps even with a lift state", () => {
    const accessory: WorkoutTemplateExercise = {
      exerciseId: "squat",
      tier: "accessory",
      sets: 3,
      reps: 15,
      isAMRAP: true,
    };
    expect(getPrescription(accessory, squat)).toEqual({ weight: 0, sets: 3, reps: 15 });
  });
});
