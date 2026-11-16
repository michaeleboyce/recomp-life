import { describe, expect, it } from "vitest";
import { makeSet, makeWorkout } from "@/lib/data/testUtils";
import { isLeftWorkout, isResumable, leftWorkoutEnd, workingSetCount } from "./unfinishedWorkout";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-15T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * HOUR);

describe("workingSetCount", () => {
  it("leaves out warm-ups", () => {
    expect(workingSetCount({ sets: [makeSet({ tier: "warmup" }), makeSet(), makeSet({ tier: "T2" })] })).toBe(2);
    expect(workingSetCount({ sets: [] })).toBe(0);
  });
});

describe("isResumable and isLeftWorkout", () => {
  it("offers a day-old workout for resume, and an older one with sets for a decision", () => {
    const fresh = makeWorkout({ startedAt: hoursAgo(23) });
    const oldWithSets = makeWorkout({ startedAt: hoursAgo(72), sets: [makeSet()] });
    const oldEmpty = makeWorkout({ startedAt: hoursAgo(72), sets: [makeSet({ tier: "warmup" })] });
    const finished = makeWorkout({ startedAt: hoursAgo(72), completedAt: hoursAgo(71), sets: [makeSet()] });
    const deleted = makeWorkout({ startedAt: hoursAgo(72), sets: [makeSet()], deletedAt: 1 });

    expect(isResumable(fresh, NOW)).toBe(true);
    expect(isLeftWorkout(fresh, NOW)).toBe(false);
    expect(isResumable(oldWithSets, NOW)).toBe(false);
    expect(isLeftWorkout(oldWithSets, NOW)).toBe(true);
    expect(isLeftWorkout(oldEmpty, NOW)).toBe(false);
    expect(isLeftWorkout(finished, NOW)).toBe(false);
    expect(isLeftWorkout(deleted, NOW)).toBe(false);
  });
});

describe("leftWorkoutEnd", () => {
  it("is the last set's time, or the start without readable set times", () => {
    const start = hoursAgo(72);
    const last = new Date(start.getTime() + 30 * 60 * 1000);
    expect(
      leftWorkoutEnd({ startedAt: start, sets: [makeSet({ completedAt: last }), makeSet({ completedAt: start })] })
    ).toEqual(last);
    expect(leftWorkoutEnd({ startedAt: start, sets: [] })).toEqual(start);
  });
});
