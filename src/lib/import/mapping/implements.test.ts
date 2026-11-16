import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/lib/exercises";
import { implementsFor, implementsForExercise, implementsForName } from "./implements";
import { mapExercise } from "./index";

const TWO = { weight: "per_implement", implements: 2, perHand: true };
const ONE = { weight: "per_implement", implements: 1, perHand: false };
const TOTAL = { weight: "total", implements: 1, perHand: false };

describe("implementsForExercise", () => {
  it("reads a dumbbell in each hand as per-hand weight with two implements", () => {
    expect(implementsForExercise("db_bench")).toEqual(TWO);
    expect(implementsForExercise("bulgarian_split_squat")).toEqual(TWO);
    expect(implementsForExercise("db_row")).toEqual(TWO);
  });

  it("reads one dumbbell held in both hands as that dumbbell's weight", () => {
    expect(implementsForExercise("goblet_squat")).toEqual(ONE);
    expect(implementsForExercise("db_pullover")).toEqual(ONE);
  });

  it("reads barbell, cable, machine and bodyweight loads as the total", () => {
    expect(implementsForExercise("bench")).toEqual(TOTAL);
    expect(implementsForExercise("lat_pulldown")).toEqual(TOTAL);
    expect(implementsForExercise("leg_press")).toEqual(TOTAL);
    expect(implementsForExercise("push_up")).toEqual(TOTAL);
  });

  it("matches the per-hand flag of the strength model for every library exercise", () => {
    for (const exercise of Object.values(EXERCISES)) {
      const s = implementsForExercise(exercise.id)!;
      expect(s.perHand, exercise.id).toBe(exercise.grip === "per_hand");
      expect(s.implements, exercise.id).toBe(s.perHand ? 2 : 1);
      expect(s.weight, exercise.id).toBe(exercise.grip ? "per_implement" : "total");
    }
  });

  it("returns null for an id outside the library", () => {
    expect(implementsForExercise("not_an_exercise")).toBeNull();
  });
});

describe("implementsForName", () => {
  it("reads dumbbell names as a dumbbell in each hand", () => {
    expect(implementsForName("Dumbbell Zottman Curl")).toEqual(TWO);
    expect(implementsForName("Single Arm Dumbbell Overhead Press")).toEqual(TWO);
  });

  it("reads one-dumbbell names as one implement", () => {
    expect(implementsForName("Single Dumbbell Sumo Squat")).toEqual(ONE);
    expect(implementsForName("Dumbbell Goblet Box Squat")).toEqual(ONE);
    expect(implementsForName("Dumbbell Glute Bridge")).toEqual(ONE);
  });

  it("reads kettlebells as one unless the name says double", () => {
    expect(implementsForName("Kettlebell Swing")).toEqual(ONE);
    expect(implementsForName("Double Kettlebell Front Squat")).toEqual(TWO);
  });

  it("reads everything else as the total load", () => {
    expect(implementsForName("Smith Machine Squat")).toEqual(TOTAL);
    expect(implementsForName("Cable Crossover Fly")).toEqual(TOTAL);
    expect(implementsForName("Burpee")).toEqual(TOTAL);
  });
});

describe("implementsFor", () => {
  it("uses the library exercise for a mapped name", () => {
    expect(implementsFor("Dumbbell Bench Press", mapExercise("Dumbbell Bench Press"))).toEqual(TWO);
    expect(implementsFor("Barbell Bench Press", mapExercise("Barbell Bench Press"))).toEqual(TOTAL);
    // The name says dumbbell, but a goblet squat holds one.
    expect(implementsFor("Dumbbell Goblet Squat", mapExercise("Dumbbell Goblet Squat"))).toEqual(ONE);
  });

  it("uses the name's words for anything else", () => {
    expect(implementsFor("Dumbbell Spider Curl", mapExercise("Dumbbell Spider Curl"))).toEqual(TWO);
    expect(implementsFor("Zorblax Twirl", mapExercise("Zorblax Twirl"))).toEqual(TOTAL);
  });

  it("follows the user's choice of library exercise", () => {
    const overrides = { "my curl thing": { kind: "exercise" as const, exerciseId: "hammer_curls" } };
    expect(implementsFor("My Curl Thing", mapExercise("My Curl Thing", overrides))).toEqual(TWO);
  });
});
