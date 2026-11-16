import { describe, expect, it } from "vitest";
import { getIncrement } from "@/lib/progression";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { buildWorkoutPlan, describeNextWorkout } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
import { EQUIPMENT, SETTINGS, makeSession, makeSets, seedLiftStates } from "./testFixtures";
import { projectUpcomingWorkouts, simulateCompletedWorkout } from "./upcoming";
import { seedVariantState } from "./variant";
import type { VariantState } from "@/types";

const NOW = new Date("2026-11-12T12:00:00Z");

function input(overrides: Partial<Parameters<typeof projectUpcomingWorkouts>[0]> = {}) {
  return {
    completedWorkouts: [],
    templates: WORKOUT_TEMPLATES,
    liftStates: seedLiftStates(),
    location: "gym" as const,
    equipment: EQUIPMENT,
    includeWarmUps: true,
    count: 5,
    settings: SETTINGS,
    now: NOW,
    ...overrides,
  };
}

const t1 = (w: ReturnType<typeof projectUpcomingWorkouts>[number]) =>
  w.entries.find((e) => e.tier === "T1")!;

describe("projectUpcomingWorkouts", () => {
  it("starts with exactly describeNextWorkout", () => {
    const completed = [makeSession({ templateId: "A1", completedAt: new Date("2026-11-11T10:00:00Z") })];
    const [first] = projectUpcomingWorkouts(input({ completedWorkouts: completed }));
    const expected = describeNextWorkout({
      completedWorkouts: completed,
      templates: WORKOUT_TEMPLATES,
      liftStates: seedLiftStates(),
      plan: { location: "gym", equipment: EQUIPMENT, includeWarmUps: true, selectedAccessories: [] },
    });
    expect(first.templateId).toBe("B1");
    expect(first.plan).toEqual(expected.plan);
    expect(first.projected).toBe(false);
    expect(first.entries.every((e) => !e.assumed)).toBe(true);
  });

  it("with re-entry, the first gym session after home takes its re-entry weight once, and the rest follow from it (H6)", () => {
    const split: VariantState = {
      ...seedVariantState({ liftId: "squat", exerciseId: "bulgarian_split_squat", tier: "T1", liftState: seedLiftStates().find((l) => l.exerciseId === "squat"), equipment: EQUIPMENT }),
      current: true,
      lastSessionDate: new Date("2026-11-10T10:00:00Z"),
      passesSinceGym: 2,
    };
    const upcoming = projectUpcomingWorkouts(input({ variantStates: [split], reentry: true, count: 5 }));
    const squatDays = upcoming.filter((w) => w.templateId === "A1");
    // A1 now and A1 again four workouts later: 190 + 2 steps of 10 = 210, then a pass.
    expect(t1(squatDays[0])).toMatchObject({ exerciseId: "squat", weight: 210 });
    expect(squatDays[0].plan.find((e) => e.tier === "T1" && !e.isWarmUp)!.reentry).toMatchObject({ rule: "steps", weight: 210 });
    expect(t1(squatDays[1])).toMatchObject({ weight: 220 });
    expect(squatDays[1].plan.find((e) => e.tier === "T1" && !e.isWarmUp)!.reentry).toBeUndefined();
    // Without it, as before.
    expect(t1(projectUpcomingWorkouts(input({ variantStates: [split] }))[0]).weight).toBe(190);
  });

  it("follows the rotation and wraps", () => {
    const ids = projectUpcomingWorkouts(input()).map((w) => w.templateId);
    expect(ids).toEqual(["A1", "B1", "A2", "B2", "A1"]);
    const later = projectUpcomingWorkouts(
      input({ completedWorkouts: [makeSession({ templateId: "B2", completedAt: new Date() })], count: 2 })
    );
    expect(later.map((w) => w.templateId)).toEqual(["A1", "B1"]);
  });

  it("raises a T1 lift by its real increment on its next appearance", () => {
    const [a1, , , , a1Again] = projectUpcomingWorkouts(input());
    const inc = getIncrement("lower", "gym", EQUIPMENT);
    expect(t1(a1).weight).toBe(190);
    expect(t1(a1Again).weight).toBe(190 + inc);
    expect(t1(a1Again).assumed).toBe(true);
    // T1 and T2 progress separately: A1's bench T2 does not move bench's T1 weight on A2.
    const a2 = projectUpcomingWorkouts(input())[2];
    expect(t1(a2)).toMatchObject({ exerciseId: "bench", weight: 145, assumed: false });
    expect(a2.entries.find((e) => e.tier === "T2")).toMatchObject({ exerciseId: "squat", weight: 135 });
  });

  it("keeps the stage scheme and T3 weights", () => {
    const states = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, t1Stage: "6x2" as const } : ls
    );
    const [a1, , , , again] = projectUpcomingWorkouts(input({ liftStates: states }));
    expect(t1(a1)).toMatchObject({ sets: 6, reps: 2, isAMRAP: true });
    expect(t1(again)).toMatchObject({ sets: 6, reps: 2, weight: 190 + getIncrement("lower", "gym", EQUIPMENT) });
    const t3 = (w: typeof a1) => w.entries.find((e) => e.tier === "T3")!;
    expect(t3(again).weight).toBe(t3(a1).weight);
    expect(t3(again).assumed).toBe(false);
  });

  it("uses home substitutes and the dumbbell increment at home", () => {
    const [a1, , , , again] = projectUpcomingWorkouts(input({ location: "home" }));
    expect(t1(a1).substituteExerciseId).toBeDefined();
    expect(t1(a1).substituteExerciseId).not.toBe("squat");
    expect(again.entries.find((e) => e.tier === "T1")!.substituteExerciseId).toBe(
      t1(a1).substituteExerciseId
    );
  });

  it("returns only working entries", () => {
    const [a1] = projectUpcomingWorkouts(input());
    expect(a1.entries.map((e) => e.tier)).toEqual(["T1", "T2", "T3"]);
  });

  it("handles count 0 and 1", () => {
    expect(projectUpcomingWorkouts(input({ count: 0 }))).toEqual([]);
    expect(projectUpcomingWorkouts(input({ count: 1 }))).toHaveLength(1);
  });

  it("does not mutate the lift states it is given", () => {
    const states = seedLiftStates();
    const copy = structuredClone(states);
    projectUpcomingWorkouts(input({ liftStates: states }));
    expect(states).toEqual(copy);
  });
});

describe("simulateCompletedWorkout", () => {
  it("equals computeCompletion on a hand-built all-target session, unchanged lifts included", () => {
    const template = WORKOUT_TEMPLATES.A1;
    const liftStates = seedLiftStates();
    const plan = buildWorkoutPlan({
      template,
      liftStates,
      location: "gym",
      equipment: EQUIPMENT,
      includeWarmUps: true,
      selectedAccessories: [],
    });
    const squat = makeSets("squat", "T1", 5, 3);
    squat[4] = { ...squat[4], isAMRAP: true };
    const sets = [
      ...squat,
      ...makeSets("bench", "T2", 3, 10),
      ...makeSets("lat_pulldown", "T3", 3, 15),
    ];
    const { liftStateUpdates } = computeCompletion({
      session: makeSession({ templateId: "A1" }),
      plan,
      sets,
      liftStates,
      settings: SETTINGS,
      recentE1RMsByExercise: {},
      currentExerciseIndex: plan.length,
      workoutStartTime: null,
      now: NOW,
    });
    const expected = liftStates.map(
      (ls) => liftStateUpdates.find((u) => u.exerciseId === ls.exerciseId) ?? ls
    );

    const simulated = simulateCompletedWorkout({
      template,
      plan,
      liftStates,
      settings: SETTINGS,
      location: "gym",
      now: NOW,
    });
    expect(simulated).toEqual(expected);
    expect(simulated).toHaveLength(liftStates.length);
    expect(simulated.find((ls) => ls.exerciseId === "lat_pulldown")!.t3Weight).toBe(90);
  });
});
