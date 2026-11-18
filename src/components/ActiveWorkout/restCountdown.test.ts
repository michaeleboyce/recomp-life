import { beforeEach, describe, expect, it } from "vitest";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout";
import { useWorkoutStore } from "@/stores/workoutStore";
import { afterSetLogged, restsAfterDrops, restTimer } from "./restCountdown";

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

const PLAN: WorkoutPlan = [
  e({ exerciseId: "squat", tier: "warmup", isWarmUp: true, targetSets: 1, weight: 45 }),
  e({ exerciseId: "squat" }),
  e({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, weight: 100 }),
];

beforeEach(() => useWorkoutStore.getState().reset());

describe("afterSetLogged", () => {
  it("rests and stays on the entry while it has sets left", () => {
    expect(afterSetLogged(PLAN, 1)).toEqual({ rest: true });
  });

  it("goes straight on after a warm-up", () => {
    expect(afterSetLogged(PLAN, 0)).toEqual({ rest: false, view: 1 });
  });

  it("rests after a working lift's last set and goes to the next entry", () => {
    const plan = PLAN.map((x, i) => (i === 1 ? { ...x, completedSets: 4 } : x));
    expect(afterSetLogged(plan, 1)).toEqual({ rest: true, view: 2 });
  });

  it("does not rest after the last set of the workout, and falls back to plan order", () => {
    const plan = PLAN.map((x, i) => (i === 2 ? { ...x, completedSets: 2 } : { ...x, completedSets: x.targetSets }));
    expect(afterSetLogged(plan, 2)).toEqual({ rest: false, view: null });
  });

  it("after the last entry's last set, plan order picks up what was skipped, with no rest", () => {
    // Bench (the last entry) was jumped to first: its last set goes back to plan order
    // (the squat), and no rest starts, as after the last set of a workout.
    const plan = PLAN.map((x, i) => (i === 2 ? { ...x, completedSets: 2 } : x));
    expect(afterSetLogged(plan, 2)).toEqual({ rest: false, view: null });
    // The squat's last set with bench still to do: rest, then bench.
    const squatLast = PLAN.map((x, i) => (i === 1 ? { ...x, completedSets: 4 } : i === 0 ? { ...x, completedSets: 1 } : x));
    expect(afterSetLogged(squatLast, 1)).toEqual({ rest: true, view: 2 });
  });
});

describe("restsAfterDrops", () => {
  it("rests after drops on a working set when anything is left", () => {
    expect(restsAfterDrops("T2", false, PLAN)).toBe(true);
  });
  it("does not after a warm-up, after ending early, or with nothing left", () => {
    expect(restsAfterDrops("warmup", false, PLAN)).toBe(false);
    expect(restsAfterDrops("T2", true, PLAN)).toBe(false);
    expect(restsAfterDrops("T2", false, PLAN.map((x) => ({ ...x, completedSets: x.targetSets })))).toBe(false);
  });
});

describe("restTimer", () => {
  it("starts the tier's rest for the phase and skips it", () => {
    restTimer.start("T1", { mode: "maintaining" });
    const started = useWorkoutStore.getState();
    expect(started).toMatchObject({ isRestTimerActive: true, restTier: "T1" });
    expect(started.restTimeRemaining).toBe(started.restTimerDuration);
    expect(started.restTimerDuration).toBeGreaterThan(0);
    restTimer.skip();
    expect(useWorkoutStore.getState()).toMatchObject({ isRestTimerActive: false, restTimeRemaining: 0, restTier: null });
  });
});
