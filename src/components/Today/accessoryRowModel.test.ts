import { describe, expect, it } from "vitest";
import type { AccessoryPlan } from "@/lib/workout/accessoryPlan";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import {
  accessoryRowViews,
  accessoryScheme,
  accessoryWeightText,
  viewsOfRows,
} from "./accessoryRowModel";

const entry = (exerciseId: string, weight: number, sets = 3, reps = 15): WorkoutExerciseState => ({
  exerciseId,
  tier: "accessory",
  targetSets: sets,
  targetReps: reps,
  weight,
  isAMRAP: true,
  isWarmUp: false,
  completedSets: 0,
});

const squat: WorkoutExerciseState = { ...entry("squat", 185, 5, 3), tier: "T1" };

const accessories = {
  mode: "auto",
  choice: { picks: [], others: [], cap: 3, fromDayList: false },
  planned: [
    {
      exerciseId: "bicep_curls",
      prescription: {
        exerciseId: "bicep_curls",
        weight: 30,
        planWeight: null,
        setAt: null,
        sets: 3,
        reps: { min: 12, max: 15 },
        basis: "progression",
        verdict: "up",
        note: "Every set reached 15 last time: up 5 lb",
      },
      pick: {
        exerciseId: "bicep_curls",
        score: 40,
        parts: { pinned: 0, preferred: 0, habit: 20, shortfall: 8, dayFit: 12, recovery: 0, spread: 0 },
        reasons: ["You usually do this on squat days", "Biceps are 4 sets short this week"],
      },
    },
  ],
  edits: [],
} as unknown as AccessoryPlan;

describe("accessory rows", () => {
  it("shows each accessory's weight, scheme with its range, and first reason, after the lifts", () => {
    const views = accessoryRowViews([squat, entry("bicep_curls", 30), entry("lateral_raises", 0, 3, 20)], accessories);
    expect(views.map((v) => v.exerciseId)).toEqual(["bicep_curls", "lateral_raises"]);
    expect(views[0]).toMatchObject({ weight: 30, sets: 3, reps: { min: 12, max: 15 }, explained: true });
    expect(views[0].reason).toBe("You usually do this on squat days");
    // Not on the plan's list (an open workout's, or added): its range from the library, no reason.
    expect(views[1]).toMatchObject({ weight: null, reps: { min: 15, max: 20 }, reason: null, explained: false });
  });

  it("follows reps changed by hand", () => {
    const [view] = accessoryRowViews([entry("bicep_curls", 30, 4, 10)], accessories);
    expect(view).toMatchObject({ sets: 4, reps: { min: 10, max: 10 } });
  });

  it("says an accessory added by the user was added by them", () => {
    const [view] = viewsOfRows([
      {
        exerciseId: "face_pulls",
        entry: entry("face_pulls", 25, 3, 20),
        prescription: { ...accessories.planned[0].prescription, exerciseId: "face_pulls", reps: { min: 15, max: 20 } },
        pick: null,
        chosen: false,
      },
    ]);
    expect(view.reason).toBe("Added by you");
  });

  it("words the weight and the scheme", () => {
    expect(accessoryScheme(3, { min: 12, max: 15 })).toBe("3×12–15");
    expect(accessoryScheme(3, { min: 15, max: 15 })).toBe("3×15");
    expect(accessoryWeightText({ weight: 20, perHand: true, bodyweight: false })).toBe("20 lb/hand");
    expect(accessoryWeightText({ weight: null, perHand: false, bodyweight: false })).toBe("Enter weight");
    expect(accessoryWeightText({ weight: null, perHand: false, bodyweight: true })).toBe("Bodyweight");
  });
});
