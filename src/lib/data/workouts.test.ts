import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { e1rmRowId } from "@/lib/rebuild";
import { checkDerived } from "./derived";
import { updateSettings } from "./records";
import {
  appendSet,
  discardStaleWorkouts,
  discardWorkout,
  finishWorkout,
  prescribedFor,
  startWorkout,
} from "./workouts";
import { clearDb, makeE1RM, makeLiftState, makeSet, makeWorkout } from "./testUtils";

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
      deletedAt: null,
      synced: false,
    });
    expect(w!.updatedAt).toBeGreaterThanOrEqual(before);
    expect(await db.readinessLogs.count()).toBe(0);
  });

  it("stores the prescription read from the current lift states, with the stage for T1 and T2", async () => {
    await initializeDatabase();
    await db.liftStates.update("ohp", { t1Weight: 90, t1Stage: "6x2" });
    const id = await startWorkout({
      templateId: "B1",
      location: "gym",
      includeWarmUps: true,
      selectedAccessories: [],
    });
    const w = (await db.workouts.get(id))!;
    expect(w.prescribed).toEqual(prescribedFor("B1", await db.liftStates.toArray()));
    expect(w.prescribed).toEqual([
      { exerciseId: "ohp", tier: "T1", weight: 90, sets: 6, reps: 2, stage: "6x2" },
      { exerciseId: "deadlift", tier: "T2", weight: 155, sets: 3, reps: 10, stage: "3x10" },
      { exerciseId: "db_row", tier: "T3", weight: 35, sets: 3, reps: 15 },
    ]);
  });

  it("stores a given prescription as it is", async () => {
    await initializeDatabase();
    const prescribed = [
      { exerciseId: "squat", tier: "T1" as const, weight: 150, sets: 5, reps: 3, stage: "5x3" as const },
    ];
    const id = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: true,
      selectedAccessories: [],
      prescribed,
    });
    expect((await db.workouts.get(id))!.prescribed).toEqual(prescribed);
  });

  it("stores an empty prescription for an unknown template", async () => {
    const id = await startWorkout({
      templateId: "nope",
      location: "gym",
      includeWarmUps: true,
      selectedAccessories: [],
    });
    expect((await db.workouts.get(id))!.prescribed).toEqual([]);
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
      deletedAt: null,
      synced: false,
    });
    expect(logs[0].updatedAt).toEqual(expect.any(Number));
    expect(logs[0].id).toMatch(UUID);
    expect(logs[0].clientId).toMatch(UUID);
    expect(logs[0].date).toBeInstanceOf(Date);
  });
});

describe("appendSet", () => {
  it("appends the set to the workout, stamping it and marking it unsynced", async () => {
    await db.workouts.put(makeWorkout({ id: "w1", synced: true, updatedAt: 10 }));
    const s1 = makeSet({ id: "s1" });
    const s2 = makeSet({ id: "s2", setNumber: 2 });

    await appendSet("w1", s1);
    const afterFirst = (await db.workouts.get("w1"))!.updatedAt!;
    await appendSet("w1", s2);

    const w = (await db.workouts.get("w1"))!;
    expect(w.sets).toEqual([s1, s2]);
    expect(w.synced).toBe(false);
    expect(afterFirst).toBeGreaterThan(10);
    expect(w.updatedAt).toBeGreaterThan(afterFirst);
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
  });

  it("keeps the workout's e1RM rows in line with its sets, in the same transaction", async () => {
    await db.workouts.put(makeWorkout({ id: "w1" }));
    await db.workouts.put(makeWorkout({ id: "w2" }));
    await appendSet("w2", makeSet({ id: "other", isAMRAP: true, actualReps: 4 }));

    // Not eligible: no row.
    await appendSet("w1", makeSet({ id: "s1" }));
    expect(await db.estimated1RMs.where("workoutSessionId").equals("w1").count()).toBe(0);

    // A heavy T1 AMRAP set: 190 x 5 -> round(190 * (1 + 5 / 30)) = 222.
    const amrap = makeSet({ id: "s2", isAMRAP: true, actualReps: 5 });
    await appendSet("w1", amrap);
    expect(await db.estimated1RMs.get(e1rmRowId("w1", "s2"))).toEqual({
      id: "e1rm:w1:s2",
      clientId: "e1rm:w1:s2",
      date: amrap.completedAt,
      exerciseId: "squat",
      workingWeight: 190,
      repsCompleted: 5,
      estimated1RM: 222,
      workoutSessionId: "w1",
      setId: "s2",
      synced: true,
    });

    // Corrected to a single: no longer eligible, the row goes. The other workout's stays.
    await appendSet("w1", { ...amrap, actualReps: 1 });
    expect((await db.estimated1RMs.toArray()).map((e) => e.id)).toEqual(["e1rm:w2:other"]);
  });

  it("leaves e1RM rows of other workouts alone while a workout is in progress", async () => {
    await db.estimated1RMs.put(makeE1RM({ id: "seeded", workoutSessionId: "elsewhere" }));
    await db.workouts.put(makeWorkout({ id: "w1" }));
    await appendSet("w1", makeSet({ id: "s1", isAMRAP: true, actualReps: 3 }));
    expect((await db.estimated1RMs.toArray()).map((e) => e.id).sort()).toEqual([
      "e1rm:w1:s1",
      "seeded",
    ]);
  });

  it("a set added to a finished workout re-runs progression", async () => {
    await initializeDatabase();
    const id = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    for (let i = 1; i <= 4; i++) {
      await appendSet(id, makeSet({ id: `s${i}`, setNumber: i }));
    }
    const partial = await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: true });
    expect(partial.find((s) => s.exerciseId === "squat")!.t1Weight).toBe(190);

    await appendSet(id, makeSet({ id: "s5", setNumber: 5, isAMRAP: true }));
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(200);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("rejects without writing anything when the workout does not exist", async () => {
    await expect(
      appendSet("missing", makeSet({ id: "s1", isAMRAP: true }))
    ).rejects.toThrow(/missing/);
    expect(await db.workouts.count()).toBe(0);
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
  it("soft-deletes the workout so the delete can sync, and removes its e1RM rows and nothing else", async () => {
    await db.workouts.put(makeWorkout({ id: "w1", synced: true, updatedAt: 10 }));
    await db.workouts.put(makeWorkout({ id: "w2" }));
    await appendSet("w1", makeSet({ id: "s1", isAMRAP: true, actualReps: 4 }));
    await appendSet("w1", makeSet({ id: "s2" }));
    await appendSet("w2", makeSet({ id: "s3", isAMRAP: true, actualReps: 4 }));
    await db.readinessLogs.put({
      id: "r1", clientId: "r1", sessionId: "w1", sleepHours: "7+", stressLevel: "low",
      date: new Date(), synced: true, updatedAt: 3, deletedAt: null,
    });
    const before = Date.now();

    await discardWorkout("w1");

    const w1 = (await db.workouts.get("w1"))!;
    expect(w1.deletedAt).toBeGreaterThanOrEqual(before);
    expect(w1.updatedAt).toBeGreaterThanOrEqual(before);
    expect(w1.synced).toBe(false);
    expect(w1.sets.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect((await db.estimated1RMs.toArray()).map((e) => e.id)).toEqual(["e1rm:w2:s3"]);
    expect((await db.workouts.get("w2"))!.deletedAt ?? null).toBeNull();
    expect(await db.readinessLogs.get("r1")).toMatchObject({
      deletedAt: w1.deletedAt,
      synced: false,
    });
  });

  it("does nothing and does not throw for an id that no longer exists", async () => {
    await db.workouts.put(makeWorkout({ id: "w1" }));
    await expect(discardWorkout("gone")).resolves.toBeUndefined();
    expect((await db.workouts.get("w1"))!.deletedAt ?? null).toBeNull();
  });

  it("leaves an already discarded workout as it is", async () => {
    await db.workouts.put(makeWorkout({ id: "w1", deletedAt: 5, updatedAt: 5, synced: true }));
    await discardWorkout("w1");
    expect(await db.workouts.get("w1")).toMatchObject({ deletedAt: 5, updatedAt: 5, synced: true });
  });
});

describe("finishWorkout", () => {
  const start = () =>
    startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });

  beforeEach(initializeDatabase);

  it("marks the workout complete, runs the rebuild and returns the lift states after it", async () => {
    const id = await start();
    for (let i = 1; i <= 5; i++) {
      await appendSet(id, makeSet({ id: `s${i}`, setNumber: i, isAMRAP: i === 5 }));
    }
    await db.workouts.update(id, { synced: true });
    const stampBefore = (await db.workouts.get(id))!.updatedAt!;
    const completedAt = new Date(Date.now() + 30 * 60 * 1000);

    const states = await finishWorkout(id, { completedAt, totalDurationSeconds: 1800, endedEarly: true });

    const w = (await db.workouts.get(id))!;
    expect(w).toMatchObject({ completedAt, totalDurationSeconds: 1800, endedEarly: true, synced: false });
    expect(w.updatedAt).toBeGreaterThan(stampBefore);
    expect(w.sets).toHaveLength(5);

    expect(states).toEqual(await db.liftStates.toArray());
    const squat = states.find((s) => s.exerciseId === "squat")!;
    expect(squat).toMatchObject({ t1Weight: 200, t1Stage: "5x3", t1LastWorkoutDate: completedAt });
    expect(states.find((s) => s.exerciseId === "bench")!.t2Weight).toBe(100);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("stores the settings progression depends on as completionContext", async () => {
    const settings = (await db.userProfile.toCollection().first())!.settings;
    await updateSettings({
      trainingPhase: { mode: "bulking" },
      equipment: { ...settings.equipment, gymBarbellIncrementLbs: 2.5, dumbbellIncrementLbs: 2.5 },
    });
    const id = await start();
    await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: false });
    expect((await db.workouts.get(id))!.completionContext).toEqual({
      phaseMode: "bulking",
      gymBarbellIncrementLbs: 2.5,
      dumbbellIncrementLbs: 2.5,
    });
  });

  it("does not store endedEarly for a workout that ran to the end", async () => {
    const id = await start();
    await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: false });
    expect((await db.workouts.get(id))!.endedEarly).toBeUndefined();
  });

  it("rejects for a workout that does not exist", async () => {
    await expect(
      finishWorkout("missing", { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: false })
    ).rejects.toThrow(/missing/);
  });

  it("never keeps a lift state the log does not explain", async () => {
    // A hand-edited lift state is not part of the log: the rebuild at finish puts it right.
    await db.liftStates.put(makeLiftState({ exerciseId: "deadlift", t1Weight: 999 }));
    const id = await start();
    const states = await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: false });
    expect(states.find((s) => s.exerciseId === "deadlift")!.t1Weight).toBe(220);
  });
});

describe("discardStaleWorkouts", () => {
  it("discards unfinished workouts older than the limit, and nothing else", async () => {
    const now = new Date("2026-11-11T12:00:00Z").getTime();
    const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);
    await db.workouts.bulkAdd([
      makeWorkout({ id: "stale", startedAt: hoursAgo(30), completedAt: null, sets: [makeSet()] }),
      makeWorkout({ id: "recent", startedAt: hoursAgo(2), completedAt: null }),
      makeWorkout({ id: "done", startedAt: hoursAgo(50), completedAt: hoursAgo(49) }),
      makeWorkout({ id: "already", startedAt: hoursAgo(40), completedAt: null, deletedAt: 7 }),
    ]);

    expect(await discardStaleWorkouts(24 * 60 * 60 * 1000, now)).toBe(1);

    const rows = Object.fromEntries((await db.workouts.toArray()).map((w) => [w.id, w]));
    expect(rows.stale.deletedAt).toEqual(expect.any(Number));
    expect(rows.stale.synced).toBe(false);
    expect(rows.recent.deletedAt ?? null).toBeNull();
    expect(rows.done.deletedAt ?? null).toBeNull();
    expect(rows.already.deletedAt).toBe(7);

    // Nothing left to discard.
    expect(await discardStaleWorkouts(24 * 60 * 60 * 1000, now)).toBe(0);
  });
});
