import { describe, expect, it } from "vitest";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout";
import { choiceFor, continuedDrop, withoutEntrySpotWeights, withPendingDrop, withSpotWeight } from "./setDraft";

function e(over: Partial<WorkoutExerciseState>): WorkoutExerciseState {
  return {
    exerciseId: "bench",
    tier: "T2",
    targetSets: 3,
    targetReps: 10,
    weight: 100,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 1,
    ...over,
  };
}

describe("choiceFor", () => {
  it("is the value for its own set only", () => {
    expect(choiceFor({ key: "1:0", value: 7 }, "1:0")).toBe(7);
    expect(choiceFor({ key: "1:0", value: 7 }, "1:1")).toBeUndefined();
    expect(choiceFor(null, "1:0")).toBeUndefined();
  });
});

describe("withSpotWeight", () => {
  it("sets one set's weight, leaving the others and the input alone", () => {
    const was = { "0:1": 200 };
    const next = withSpotWeight(was, "0:2", 205, 190);
    expect(next).toEqual({ "0:1": 200, "0:2": 205 });
    expect(was).toEqual({ "0:1": 200 });
  });

  it("puts a set back on the plan when cleared or stepped back onto the plan's weight", () => {
    expect(withSpotWeight({ "0:1": 200, "0:2": 205 }, "0:2", null, 190)).toEqual({ "0:1": 200 });
    expect(withSpotWeight({ "0:1": 200 }, "0:1", 190, 190)).toEqual({});
  });
});

describe("withoutEntrySpotWeights", () => {
  it("drops one entry's weights and keeps every other entry's, 1 apart from 10", () => {
    expect(withoutEntrySpotWeights({ "1:0": 50, "1:2": 55, "10:0": 60, "0:1": 200 }, 1)).toEqual({ "10:0": 60, "0:1": 200 });
  });
});

describe("continuedDrop", () => {
  it("goes on from the drop just logged, in the same chain, suggesting the reps it was done for", () => {
    const draft = { sessionId: "w1", rootId: "s1", parentId: "s1", weight: 160, reps: 5, suggestedReps: 5 };
    expect(continuedDrop(draft, "d1", 140, 4)).toEqual({
      sessionId: "w1",
      rootId: "s1",
      parentId: "d1",
      weight: 140,
      reps: 4,
      suggestedReps: 4,
    });
  });
});

describe("withPendingDrop", () => {
  const plan: WorkoutPlan = [e({ exerciseId: "squat", tier: "T1", weight: 190, completedSets: 5, targetSets: 5 }), e({})];

  it("lays the accepted weight on its entry while it has sets left", () => {
    const next = withPendingDrop(plan, { entryIndex: 1, weight: 95 });
    expect(next.map((x) => x.weight)).toEqual([190, 95]);
    expect(next[0]).toBe(plan[0]);
  });

  it("leaves a finished entry, and the plan with no drop, as they are", () => {
    expect(withPendingDrop(plan, { entryIndex: 0, weight: 150 })[0].weight).toBe(190);
    expect(withPendingDrop(plan, null)).toBe(plan);
  });
});
