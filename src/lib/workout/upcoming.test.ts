import { describe, expect, it } from "vitest";
import { getIncrement } from "@/lib/progression";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { describeNextWorkout } from "./buildPlan";
import { EQUIPMENT, makeSession, seedLiftStates } from "./testFixtures";
import { projectUpcomingWorkouts } from "./upcoming";

function input(overrides: Partial<Parameters<typeof projectUpcomingWorkouts>[0]> = {}) {
  return {
    completedWorkouts: [],
    templates: WORKOUT_TEMPLATES,
    liftStates: seedLiftStates(),
    location: "gym" as const,
    equipment: EQUIPMENT,
    includeWarmUps: true,
    count: 5,
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
