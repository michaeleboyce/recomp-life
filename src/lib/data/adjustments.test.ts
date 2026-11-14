import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { recordAdjustment } from "./adjustments";
import { applyRebuild, checkDerived } from "./derived";
import { clearDb, runSession } from "./testUtils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY = 24 * 60 * 60 * 1000;
const FIRST = new Date("2026-03-02T09:00:00Z").getTime();
const setNow = (date: Date) => {
  vi.setSystemTime(date);
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
  await clearDb();
  await initializeDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordAdjustment (E9)", () => {
  it("stores a new stamped row dated now and applies it to the lift state", async () => {
    const diff = await recordAdjustment({
      exerciseId: "squat",
      source: "decay",
      set: { t1Weight: 170 },
    });

    const rows = (await db.liftAdjustments.toArray()).filter((a) => a.source === "decay");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(UUID);
    expect(rows[0]).toEqual({
      id: rows[0].id,
      clientId: rows[0].id,
      exerciseId: "squat",
      at: new Date("2026-03-01T08:00:00Z"),
      source: "decay",
      set: { t1Weight: 170 },
      updatedAt: Date.now(),
      deletedAt: null,
      synced: false,
    });

    expect(diff.liftStatesToPut.map((s) => s.exerciseId)).toEqual(["squat"]);
    // Only the listed field moves.
    expect(await db.liftStates.get("squat")).toMatchObject({ t1Weight: 170, t2Weight: 135, t1Stage: "5x3" });
  });

  it("keeps the given date and note", async () => {
    const at = new Date("2026-02-20T12:00:00Z");
    await recordAdjustment({ exerciseId: "bench", source: "manual", set: { t2Weight: 90 }, at, note: "shoulder" });
    const row = (await db.liftAdjustments.toArray()).find((a) => a.source === "manual")!;
    expect(row).toMatchObject({ at, note: "shoulder", exerciseId: "bench" });
  });

  it("persists through a rebuild: the weight is still there after one, and after a workout", async () => {
    await recordAdjustment({ exerciseId: "squat", source: "decay", set: { t1Weight: 170 } });

    await db.liftStates.clear();
    await applyRebuild();
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(170);

    // The next squat day is prescribed at the reduced weight and progresses from it.
    const { workoutId } = await runSession({ templateId: "A1", startedAt: new Date(FIRST) }, setNow);
    const workout = (await db.workouts.get(workoutId))!;
    expect(workout.prescribed![0]).toMatchObject({ exerciseId: "squat", weight: 170 });
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(180);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("an adjustment made after a workout overrides what that workout left", async () => {
    await runSession({ templateId: "A1", startedAt: new Date(FIRST) }, setNow);
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(200);
    setNow(new Date(FIRST + DAY));

    await recordAdjustment({ exerciseId: "squat", source: "manual", set: { t1Weight: 185, t1Stage: "6x2" } });

    expect(await db.liftStates.get("squat")).toMatchObject({ t1Weight: 185, t1Stage: "6x2" });
    // The workout's own history is untouched.
    expect((await db.liftStates.get("squat"))!.recentAMRAPReps).toEqual([3]);
  });
});
