import { describe, expect, it } from "vitest";
import { makeSet, makeWorkout } from "@/lib/data/testUtils";
import { estimateLoggedSeconds, estimateWorkoutMinutes, estimateWorkoutSeconds } from "@/lib/workout/duration";
import type { WorkoutPlan } from "@/lib/workout/types";
import { upcomingMinutes } from "./sessionMinutes";

const now = new Date("2026-11-15T12:00:00Z");
const plan: WorkoutPlan = [
  { exerciseId: "squat", tier: "T1", targetSets: 5, targetReps: 3, weight: 190, isAMRAP: true, isWarmUp: false, completedSets: 0 },
  { exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, weight: 100, isAMRAP: false, isWarmUp: false, completedSets: 0 },
];

/** A finished session that took `pace` times its length on paper. */
function session(day: number, pace: number) {
  const sets = Array.from({ length: 5 }, (_, i) => makeSet({ setNumber: i + 1 }));
  return makeWorkout({
    id: `w${day}`,
    startedAt: new Date(Date.UTC(2026, 10, day, 9)),
    completedAt: new Date(Date.UTC(2026, 10, day, 10)),
    sets,
    totalDurationSeconds: estimateLoggedSeconds(sets) * pace,
  });
}

describe("upcomingMinutes", () => {
  it("is the length on paper before there is history", () => {
    expect(upcomingMinutes(plan, [], undefined, now)).toBe(
      Math.max(1, Math.round(estimateWorkoutSeconds(plan) / 60))
    );
  });

  it("follows the lifter's own pace once there are finished sessions", () => {
    const slow = [session(1, 2), session(3, 2), session(5, 2), session(7, 2)];
    const minutes = upcomingMinutes(plan, slow, undefined, now)!;
    expect(minutes).toBe(Math.round((2 * estimateWorkoutSeconds(plan)) / 60));
    expect(minutes).toBeGreaterThan(estimateWorkoutMinutes(plan));
  });

  it("is null with nothing to lift", () => {
    expect(upcomingMinutes([], [], undefined, now)).toBeNull();
  });
});
