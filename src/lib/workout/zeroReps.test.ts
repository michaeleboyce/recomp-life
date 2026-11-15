// A missed set (0 reps) can be logged from the active workout. These pin down what the
// rest of the app does with one; none of the progression rules change.
import { describe, expect, it } from "vitest";
import { calculateE1RM, isE1RMEligibleSet } from "@/lib/e1rm";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { buildWorkoutPlan } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
import { createSetLog } from "./logSet";
import type { CompletionInput } from "./types";
import { EQUIPMENT, SETTINGS, makeEntry, makeSession, makeSet, makeSets, seedLiftStates } from "./testFixtures";
import type { SetLog } from "@/types";

function completion(sets: SetLog[]): CompletionInput {
  const session = makeSession();
  const liftStates = seedLiftStates();
  const plan = buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[session.templateId],
    liftStates,
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: false,
    selectedAccessories: [],
  });
  return {
    session,
    plan,
    liftStates,
    settings: SETTINGS,
    recentE1RMsByExercise: {},
    currentExerciseIndex: plan.length,
    workoutStartTime: new Date("2026-11-11T09:00:00Z"),
    now: new Date("2026-11-11T09:45:00Z"),
    sets,
  };
}

describe("a set of 0 reps", () => {
  it("is logged as a failed set", () => {
    const set = createSetLog({
      exercise: makeEntry({ exerciseId: "squat", tier: "T1", targetReps: 3, targetSets: 5, completedSets: 4, isAMRAP: true }),
      actualReps: 0,
      rpe: null,
      location: "gym",
      autoRegulated: false,
      now: new Date("2026-11-11T09:30:00Z"),
      id: "s",
      clientId: "c",
    });
    expect(set.actualReps).toBe(0);
    expect(set.status).toBe("failed");
  });

  it("gives no estimated max", () => {
    expect(isE1RMEligibleSet("T1", true, 0)).toBe(false);
    expect(calculateE1RM(190, 0)).toBeNull();
  });

  it("fails a T1 lift exactly as one missed rep does (next stage, same weight)", () => {
    const sets = (last: number) => [
      ...makeSets("squat", "T1", 4, 3, { weight: 190 }),
      makeSet("squat", "T1", { setNumber: 5, actualReps: last, weight: 190, isAMRAP: true, status: "failed" }),
    ];
    const zero = computeCompletion(completion(sets(0)));
    const one = computeCompletion(completion(sets(1)));
    const squat = zero.liftStateUpdates.find((ls) => ls.exerciseId === "squat")!;
    expect(squat).toMatchObject({ t1Weight: 190, t1Stage: "6x2", t1FailCount: 1 });
    const outcome = (r: typeof zero) => r.outcomes.find((o) => o.exerciseId === "squat")?.kind;
    expect(outcome(zero)).toBe(outcome(one));
  });

  it("does not raise a T3 weight", () => {
    const sets = [
      ...makeSets("lat_pulldown", "T3", 2, 15, { weight: 90 }),
      makeSet("lat_pulldown", "T3", { setNumber: 3, targetReps: 15, actualReps: 0, weight: 90, isAMRAP: true, status: "failed" }),
    ];
    const lat = computeCompletion(completion(sets)).liftStateUpdates.find((ls) => ls.exerciseId === "lat_pulldown");
    expect(lat?.t3Weight ?? 90).toBe(90);
  });
});
