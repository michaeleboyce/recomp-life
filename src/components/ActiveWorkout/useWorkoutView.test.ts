import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { WorkoutSession } from "@/types";
import { screenIndexes, useWorkoutView } from "./useWorkoutView";

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

const PLAN: WorkoutPlan = [e({ completedSets: 5 }), e({ exerciseId: "bench", tier: "T2" }), e({ exerciseId: "lat_pulldown", tier: "T3" })];

beforeEach(() => useWorkoutStore.getState().reset());

describe("screenIndexes", () => {
  it("is the first unfinished entry with nothing viewed", () => {
    expect(screenIndexes(PLAN, null, null)).toEqual({ naturalIndex: 1, activeIndex: 1 });
  });
  it("is the viewed entry while it has sets left, else plan order", () => {
    expect(screenIndexes(PLAN, 2, null)).toEqual({ naturalIndex: 2, activeIndex: 2 });
    expect(screenIndexes(PLAN, 0, null)).toEqual({ naturalIndex: 1, activeIndex: 1 });
  });
  it("is past the end once ended early, keeping where it would be", () => {
    expect(screenIndexes(PLAN, 2, 2)).toEqual({ naturalIndex: 2, activeIndex: 3 });
  });
});

describe("useWorkoutView", () => {
  const session = { id: "w1" } as WorkoutSession;

  it("reads the viewed entry only once the store is tracking this session", () => {
    act(() => {
      useWorkoutStore.getState().beginSession("other");
      useWorkoutStore.getState().viewEntry(2);
    });
    const { result } = renderHook(() => useWorkoutView(session));
    // The effect has begun this session, which cleared the other's index.
    expect(result.current.storeReady).toBe(true);
    expect(result.current.viewedEntryIndex).toBeNull();
    act(() => result.current.viewEntry(1));
    expect(result.current.viewedEntryIndex).toBe(1);
  });

  it("flashes an e1RM and clears it", () => {
    const { result } = renderHook(() => useWorkoutView(session));
    act(() => result.current.flashE1rm(240));
    expect(result.current.e1rmFlash).toBe(240);
    act(() => result.current.clearFlash());
    expect(result.current.e1rmFlash).toBeNull();
  });

  it("is not ready with no session", () => {
    const { result } = renderHook(() => useWorkoutView(null));
    expect(result.current.storeReady).toBe(false);
    expect(result.current.viewedEntryIndex).toBeNull();
  });
});
