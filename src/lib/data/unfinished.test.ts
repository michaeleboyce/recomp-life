import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import { clearDb, makeSet, makeWorkout } from "./testUtils";
import { leftWorkoutEnd } from "@/lib/unfinishedWorkout";
import { discardEmptyStaleWorkouts, saveLeftWorkout } from "./unfinished";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-15T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * HOUR);

beforeEach(clearDb);

describe("discardEmptyStaleWorkouts", () => {
  it("discards only stale unfinished workouts with no working set", async () => {
    await db.workouts.bulkAdd([
      makeWorkout({ id: "empty-old", startedAt: hoursAgo(30), sets: [makeSet({ tier: "warmup" })] }),
      makeWorkout({ id: "sets-3-days", startedAt: hoursAgo(72), sets: [makeSet(), makeSet()] }),
      makeWorkout({ id: "empty-recent", startedAt: hoursAgo(2) }),
      makeWorkout({ id: "done", startedAt: hoursAgo(50), completedAt: hoursAgo(49) }),
    ]);

    expect(await discardEmptyStaleWorkouts(NOW)).toBe(1);

    const rows = Object.fromEntries((await db.workouts.toArray()).map((w) => [w.id, w]));
    expect(rows["empty-old"].deletedAt).toEqual(expect.any(Number));
    expect(rows["sets-3-days"].deletedAt ?? null).toBeNull();
    expect(rows["sets-3-days"].sets).toHaveLength(2);
    expect(rows["empty-recent"].deletedAt ?? null).toBeNull();
    expect(rows.done.deletedAt ?? null).toBeNull();
    expect(await discardEmptyStaleWorkouts(NOW)).toBe(0);
  });
});

describe("saveLeftWorkout", () => {
  it("finishes the workout at its last set, not now", async () => {
    const startedAt = hoursAgo(72);
    const lastSet = new Date(startedAt.getTime() + 20 * 60 * 1000);
    await db.workouts.add(
      makeWorkout({
        id: "left",
        startedAt,
        sets: [
          makeSet({ completedAt: new Date(startedAt.getTime() + 5 * 60 * 1000) }),
          makeSet({ completedAt: lastSet, setNumber: 2 }),
        ],
      })
    );
    expect(leftWorkoutEnd((await db.workouts.get("left"))!)).toEqual(lastSet);

    await saveLeftWorkout("left");

    const saved = (await db.workouts.get("left"))!;
    expect(new Date(saved.completedAt!)).toEqual(lastSet);
    expect(saved.totalDurationSeconds).toBe(20 * 60);
    expect(saved.endedEarly).toBe(true);
    expect(saved.sets).toHaveLength(2);
  });

  it("rejects a workout that is missing, deleted or finished", async () => {
    await db.workouts.bulkAdd([
      makeWorkout({ id: "gone", deletedAt: 5, sets: [makeSet()] }),
      makeWorkout({ id: "done", completedAt: hoursAgo(1), sets: [makeSet()] }),
    ]);
    await expect(saveLeftWorkout("missing")).rejects.toThrow(/missing/);
    await expect(saveLeftWorkout("gone")).rejects.toThrow(/gone/);
    await expect(saveLeftWorkout("done")).rejects.toThrow(/done/);
  });
});
