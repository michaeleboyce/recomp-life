import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import {
  appendSet,
  discardStaleWorkouts,
  discardWorkout,
  finishWorkout,
  getRecentE1RMSeries,
  saveLiftState,
  startWorkout,
} from "./workouts";
import { clearDb, makeE1RM, makeLiftState, makeSet, makeWorkout } from "./testUtils";
import type { CompletionResult } from "@/lib/workout/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(clearDb);

describe("startWorkout", () => {
  it("creates an unfinished workout exactly as Configure does and returns its id", async () => {
    const before = Date.now();
    const id = await startWorkout({
      templateId: "B1",
      location: "home",
      includeWarmUps: false,
      selectedAccessories: ["face_pull"],
    });

    expect(id).toMatch(UUID);
    const w = await db.workouts.get(id);
    expect(w).toBeDefined();
    expect(w!.clientId).toMatch(UUID);
    expect(w!.clientId).not.toBe(id);
    expect(w!.startedAt).toBeInstanceOf(Date);
    expect(w!.startedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(w).toMatchObject({
      templateId: "B1",
      location: "home",
      completedAt: null,
      totalDurationSeconds: 0,
      includeWarmUps: false,
      selectedAccessories: ["face_pull"],
      sets: [],
      preWorkoutPainEntries: [],
      modifications: [],
      synced: false,
    });
    expect(await db.readinessLogs.count()).toBe(0);
  });

  it("stores the given modifications", async () => {
    const modifications = [
      {
        exerciseId: "squat",
        originalWeight: 190,
        modifiedWeight: 50,
        reason: "home",
        action: "substitute" as const,
        source: "equipment_limit" as const,
        userAccepted: true,
      },
    ];
    const id = await startWorkout({
      templateId: "A1",
      location: "home",
      includeWarmUps: true,
      selectedAccessories: [],
      modifications,
    });
    expect((await db.workouts.get(id))!.modifications).toEqual(modifications);
  });

  it("adds a readiness log linked to the session when readiness is given", async () => {
    const id = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: true,
      selectedAccessories: [],
      readiness: { sleepHours: "5-7", stressLevel: "good" },
    });
    const logs = await db.readinessLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      sessionId: id,
      sleepHours: "5-7",
      stressLevel: "good",
      synced: false,
    });
    expect(logs[0].id).toMatch(UUID);
    expect(logs[0].clientId).toMatch(UUID);
    expect(logs[0].date).toBeInstanceOf(Date);
  });
});

describe("appendSet", () => {
  it("writes the set and appends it to the workout, marking the workout unsynced", async () => {
    await db.workouts.put(makeWorkout({ id: "w1", synced: true }));
    const s1 = makeSet({ id: "s1" });
    const s2 = makeSet({ id: "s2", setNumber: 2 });

    await appendSet("w1", s1);
    await appendSet("w1", s2);

    expect(await db.sets.get("s1")).toEqual(s1);
    expect(await db.sets.get("s2")).toEqual(s2);
    const w = await db.workouts.get("w1");
    expect(w!.sets.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(w!.synced).toBe(false);
  });

  it("is idempotent: re-appending the same set id replaces it in place", async () => {
    await db.workouts.put(makeWorkout({ id: "w1" }));
    await appendSet("w1", makeSet({ id: "s1", actualReps: 2 }));
    await appendSet("w1", makeSet({ id: "s2" }));
    await appendSet("w1", makeSet({ id: "s1", actualReps: 3 }));

    const w = await db.workouts.get("w1");
    expect(w!.sets.map((s) => [s.id, s.actualReps])).toEqual([
      ["s1", 3],
      ["s2", 3],
    ]);
    expect(await db.sets.count()).toBe(2);
  });

  it("stores the e1RM in the same transaction when given", async () => {
    await db.workouts.put(makeWorkout({ id: "w1" }));
    const e = makeE1RM({ id: "e1", workoutSessionId: "w1" });
    await appendSet("w1", makeSet({ id: "s1", isAMRAP: true }), e);
    expect(await db.estimated1RMs.get("e1")).toEqual(e);
  });

  it("rejects without writing anything when the workout does not exist", async () => {
    await expect(
      appendSet("missing", makeSet({ id: "s1" }), makeE1RM({ id: "e1" }))
    ).rejects.toThrow(/missing/);
    expect(await db.sets.count()).toBe(0);
    expect(await db.estimated1RMs.count()).toBe(0);
  });

  it("survives a reload: a fresh read of the workout has every set", async () => {
    await db.workouts.put(makeWorkout({ id: "w1" }));
    for (let i = 1; i <= 3; i++) {
      await appendSet("w1", makeSet({ id: `s${i}`, setNumber: i }));
    }
    db.close();
    await db.open();
    expect((await db.workouts.get("w1"))!.sets).toHaveLength(3);
  });
});

describe("discardWorkout", () => {
  it("deletes the workout, its sets and its e1RM rows, and nothing else", async () => {
    await db.workouts.put(makeWorkout({ id: "w1" }));
    await db.workouts.put(makeWorkout({ id: "w2" }));
    await appendSet("w1", makeSet({ id: "s1" }), makeE1RM({ id: "e1", workoutSessionId: "w1" }));
    await appendSet("w1", makeSet({ id: "s2" }));
    await appendSet("w2", makeSet({ id: "s3" }), makeE1RM({ id: "e2", workoutSessionId: "w2" }));
    await db.estimated1RMs.put(makeE1RM({ id: "e3", workoutSessionId: "w1" }));

    await discardWorkout("w1");

    expect(await db.workouts.get("w1")).toBeUndefined();
    expect((await db.sets.toArray()).map((s) => s.id)).toEqual(["s3"]);
    expect((await db.estimated1RMs.toArray()).map((e) => e.id)).toEqual(["e2"]);
    expect(await db.workouts.get("w2")).toBeDefined();
  });

  it("does nothing and does not throw for an id that no longer exists", async () => {
    await db.sets.put(makeSet({ id: "s1" }));
    await expect(discardWorkout("gone")).resolves.toBeUndefined();
    expect(await db.sets.count()).toBe(1);
  });
});

describe("finishWorkout", () => {
  it("keeps a set that was appended after the completion was computed", async () => {
    const first = makeSet({ id: "s1" });
    const late = makeSet({ id: "s2" });
    await db.workouts.put(makeWorkout({ id: "w1", sets: [first, late] }));

    await finishWorkout("w1", {
      liftStateUpdates: [],
      sessionPatch: { completedAt: new Date("2026-11-10T10:30:00Z"), totalDurationSeconds: 60, sets: [first] },
    });

    expect((await db.workouts.get("w1"))!.sets.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("writes every lift state update and patches the workout as unsynced", async () => {
    const sets = [makeSet({ id: "s1" })];
    await db.workouts.put(makeWorkout({ id: "w1", synced: true }));
    await db.liftStates.put(makeLiftState({ exerciseId: "squat", t1Weight: 190 }));
    await db.liftStates.put(makeLiftState({ exerciseId: "bench", t1Weight: 145 }));

    const completedAt = new Date("2026-11-10T10:30:00Z");
    const result: CompletionResult = {
      liftStateUpdates: [
        makeLiftState({ exerciseId: "squat", t1Weight: 200, synced: false }),
      ],
      sessionPatch: { completedAt, totalDurationSeconds: 1800, sets, endedEarly: true },
    };

    await finishWorkout("w1", result);

    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(200);
    expect((await db.liftStates.get("bench"))!.t1Weight).toBe(145);
    const w = await db.workouts.get("w1");
    expect(w).toMatchObject({
      completedAt,
      totalDurationSeconds: 1800,
      sets,
      endedEarly: true,
      synced: false,
    });
  });

  it("does not add endedEarly when the patch has none", async () => {
    await db.workouts.put(makeWorkout({ id: "w1" }));
    await finishWorkout("w1", {
      liftStateUpdates: [],
      sessionPatch: { completedAt: new Date(), totalDurationSeconds: 60, sets: [] },
    });
    expect("endedEarly" in (await db.workouts.get("w1"))!).toBe(false);
  });
});

describe("saveLiftState", () => {
  it("replaces the row and marks it unsynced", async () => {
    await db.liftStates.put(makeLiftState({ exerciseId: "squat", t1Weight: 190, synced: true }));
    await saveLiftState(makeLiftState({ exerciseId: "squat", t1Weight: 175, synced: true }));
    const ls = await db.liftStates.get("squat");
    expect(ls!.t1Weight).toBe(175);
    expect(ls!.synced).toBe(false);
  });
});

describe("discardStaleWorkouts", () => {
  it("discards unfinished workouts older than the limit, with their sets, and nothing else", async () => {
    const now = new Date("2026-11-11T12:00:00Z").getTime();
    const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);
    const staleSet = makeSet({ id: "stale-set" });
    await db.sets.add(staleSet);
    await db.workouts.bulkAdd([
      makeWorkout({ id: "stale", startedAt: hoursAgo(30), completedAt: null, sets: [staleSet] }),
      makeWorkout({ id: "recent", startedAt: hoursAgo(2), completedAt: null }),
      makeWorkout({ id: "done", startedAt: hoursAgo(50), completedAt: hoursAgo(49) }),
    ]);

    expect(await discardStaleWorkouts(24 * 60 * 60 * 1000, now)).toBe(1);

    expect((await db.workouts.toArray()).map((w) => w.id).sort()).toEqual(["done", "recent"]);
    expect(await db.sets.get("stale-set")).toBeUndefined();
  });
});

describe("getRecentE1RMSeries", () => {
  it("returns that exercise's values oldest first, as toRecentE1RMSeries builds them", async () => {
    await db.estimated1RMs.bulkPut([
      makeE1RM({ exerciseId: "squat", date: new Date("2026-11-01"), estimated1RM: 200 }),
      makeE1RM({ exerciseId: "squat", date: new Date("2026-11-08"), estimated1RM: 215 }),
      makeE1RM({ exerciseId: "squat", date: new Date("2026-11-04"), estimated1RM: 210 }),
      makeE1RM({ exerciseId: "bench", date: new Date("2026-11-09"), estimated1RM: 160 }),
    ]);
    expect(await getRecentE1RMSeries("squat")).toEqual([200, 210, 215]);
    expect(await getRecentE1RMSeries("deadlift")).toEqual([]);
  });
});
