// E6 wiring in the pure planners: buildWorkoutPlan, planWorkoutStart, describeNextWorkout
// and projectUpcomingWorkouts all apply next-session set plans the same way.
import { describe, expect, it } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { NextSetPlan, PlannedSet } from "@/types";
import { buildWorkoutPlan, describeNextWorkout } from "./buildPlan";
import { planWorkoutStart } from "./startPlan";
import { EQUIPMENT, SETTINGS, seedLiftStates } from "./testFixtures";
import type { BuildPlanInput } from "./types";
import { projectUpcomingWorkouts } from "./upcoming";

const SETS: PlannedSet[] = [
  { weight: 185, reps: 3 },
  { weight: 195, reps: 3 },
  { weight: 205, reps: 3 },
];

function setPlan(exerciseId: string, liftId: string, tier: NextSetPlan["tier"], sets = SETS): NextSetPlan {
  return { exerciseId, liftId, tier, sets, planSets: [], createdAt: "2026-11-17T09:00:00.000Z" };
}

const SQUAT = { "squat|T1": setPlan("squat", "squat", "T1") };

function input(overrides: Partial<BuildPlanInput> = {}): BuildPlanInput {
  return {
    template: WORKOUT_TEMPLATES.A1,
    liftStates: seedLiftStates(),
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: false,
    selectedAccessories: [],
    ...overrides,
  };
}

const squatT1 = (plan: ReturnType<typeof buildWorkoutPlan>) =>
  plan.find((e) => e.exerciseId === "squat" && e.tier === "T1" && !e.isWarmUp)!;

describe("buildWorkoutPlan with next-session set plans", () => {
  it("gives the entry the set plan's sets", () => {
    const squat = squatT1(buildWorkoutPlan(input({ nextSetPlans: SQUAT })));
    expect(squat.perSet).toEqual(SETS);
    expect(squat).toMatchObject({ targetSets: 3, weight: 205, targetReps: 3 });
  });

  it("puts the user's own edits after it, so theirs win", () => {
    const mine = [{ weight: 200, reps: 3 }];
    const edited = buildWorkoutPlan(
      input({ nextSetPlans: SQUAT, edits: [{ kind: "setWeights", exerciseId: "squat", tier: "T1", sets: mine }] })
    );
    expect(squatT1(edited).perSet).toEqual(mine);
    const weighted = squatT1(
      buildWorkoutPlan(input({ nextSetPlans: SQUAT, edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 180 }] }))
    );
    expect(weighted.perSet).toBeUndefined();
    expect(weighted.weight).toBe(180);
  });

  it("at home applies to the home exercise performed, not the barbell lift's plan", () => {
    expect(squatT1(buildWorkoutPlan(input({ nextSetPlans: SQUAT, location: "home" }))).perSet).toBeUndefined();
    const home = squatT1(buildWorkoutPlan(input({ location: "home" })));
    expect(home.substituteExerciseId).toBeDefined();
    const sets = [{ weight: home.weight, reps: home.targetReps }, { weight: home.weight + 5, reps: home.targetReps }];
    const plans = { [`${home.substituteExerciseId}|T1`]: setPlan(home.substituteExerciseId!, "squat", "T1", sets) };
    expect(squatT1(buildWorkoutPlan(input({ location: "home", nextSetPlans: plans }))).perSet).toEqual(sets);
  });
});

describe("planWorkoutStart with next-session set plans", () => {
  it("returns the setWeights edits to save in the session's planEdits, and the plan they give", () => {
    const start = planWorkoutStart(input({ nextSetPlans: SQUAT }));
    expect(start.nextSetPlanEdits).toEqual([{ kind: "setWeights", exerciseId: "squat", tier: "T1", sets: SETS }]);
    expect(squatT1(start.plan).perSet).toEqual(SETS);
    // Rebuilt from the saved edits alone, the plan is the same.
    const rebuilt = buildWorkoutPlan(input({ edits: start.nextSetPlanEdits }));
    expect(rebuilt).toEqual(start.plan);
    // The prescription is the program's, before any edit.
    expect(start.prescribed.find((p) => p.exerciseId === "squat")!.weight).toBe(planWorkoutStart(input()).prescribed.find((p) => p.exerciseId === "squat")!.weight);
    expect(planWorkoutStart(input()).nextSetPlanEdits).toEqual([]);
  });
});

describe("describeNextWorkout and projectUpcomingWorkouts with set plans", () => {
  it("Today's next workout shows the per-set weights", () => {
    const next = describeNextWorkout({
      completedWorkouts: [],
      templates: WORKOUT_TEMPLATES,
      liftStates: seedLiftStates(),
      plan: { location: "gym", equipment: EQUIPMENT, includeWarmUps: false, selectedAccessories: [], nextSetPlans: SQUAT },
      reentry: true,
    });
    expect(next.templateId).toBe("A1");
    expect(squatT1(next.plan).perSet).toEqual(SETS);
  });

  it("applies each plan to the first coming workout with that exercise and tier only", () => {
    const plans = { ...SQUAT, "squat|T2": setPlan("squat", "squat", "T2", [{ weight: 100, reps: 10 }, { weight: 110, reps: 10 }]) };
    const upcoming = projectUpcomingWorkouts({
      completedWorkouts: [],
      templates: WORKOUT_TEMPLATES,
      liftStates: seedLiftStates(),
      location: "gym",
      equipment: EQUIPMENT,
      includeWarmUps: false,
      count: 5,
      settings: SETTINGS,
      now: new Date("2026-11-17T12:00:00Z"),
      nextSetPlans: plans,
    });
    expect(upcoming.map((w) => w.templateId)).toEqual(["A1", "B1", "A2", "B2", "A1"]);
    expect(squatT1(upcoming[0].plan).perSet).toEqual(SETS);
    expect(upcoming[0].entries.find((e) => e.exerciseId === "squat")).toMatchObject({ weight: 205, sets: 3 });
    // Squat T2 is first on A2: its plan applies there.
    const a2Squat = upcoming[2].plan.find((e) => e.exerciseId === "squat" && e.tier === "T2")!;
    expect(a2Squat.perSet).toEqual([{ weight: 100, reps: 10 }, { weight: 110, reps: 10 }]);
    // The second A1 is planned by the program again: the set plan was used up.
    expect(squatT1(upcoming[4].plan).perSet).toBeUndefined();
  });
});
