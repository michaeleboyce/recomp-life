import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDerived } from "@/lib/data/derived";
import { PROFILE_ID } from "@/lib/sync/registry";
import { db } from "./local";
import { initializeDatabase } from "./init";
import { INITIAL_LIFT_STATES, startAdjustments } from "./seed";

const LIFT_IDS = Object.keys(INITIAL_LIFT_STATES).sort();

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

describe("initializeDatabase", () => {
  beforeEach(clearAll);

  it("seeds one profile with the fixed id on an empty database", async () => {
    await initializeDatabase();
    const profiles = await db.userProfile.toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: PROFILE_ID,
      clientId: PROFILE_ID,
      name: "Michael",
      deletedAt: null,
      synced: false,
    });
    expect(profiles[0].createdAt).toBeInstanceOf(Date);
  });

  it("writes the starting weights as one `start` adjustment per lift, not as lift states (E9)", async () => {
    await initializeDatabase();
    const adjustments = await db.liftAdjustments.toArray();
    expect(adjustments.map((a) => a.id).sort()).toEqual(LIFT_IDS.map((id) => `start:${id}`));
    expect(adjustments.find((a) => a.exerciseId === "squat")).toEqual({
      id: "start:squat",
      clientId: "start:squat",
      exerciseId: "squat",
      at: new Date(0),
      source: "start",
      set: {
        t1Weight: 190, t1Stage: "5x3", t1FailCount: 0, t1LastResetWeight: null,
        t2Weight: 135, t2Stage: "3x10", t2FailCount: 0, t2LastResetWeight: null,
        t3Weight: 0,
      },
      updatedAt: 1,
      deletedAt: null,
      synced: false,
    });
    expect(startAdjustments()).toEqual(
      expect.arrayContaining(adjustments.map((a) => expect.objectContaining({ id: a.id })))
    );
  });

  it("the rebuilt lift states carry the INITIAL_LIFT_STATES weights and stages", async () => {
    await initializeDatabase();
    const states = await db.liftStates.toArray();
    expect(states.map((s) => s.exerciseId)).toEqual(LIFT_IDS);
    for (const state of states) {
      // Derived rows are local-only and keyed by lift.
      expect(state).toEqual({
        ...INITIAL_LIFT_STATES[state.exerciseId],
        clientId: state.exerciseId,
        synced: true,
      });
    }
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("concurrent calls share one run and seed exactly once", async () => {
    const a = initializeDatabase();
    const b = initializeDatabase();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(await db.userProfile.count()).toBe(1);
    expect(await db.liftAdjustments.count()).toBe(LIFT_IDS.length);
    expect(await db.liftStates.count()).toBe(LIFT_IDS.length);
  });

  it("many simultaneous calls still create a single profile", async () => {
    await Promise.all(Array.from({ length: 6 }, () => initializeDatabase()));
    expect(await db.userProfile.count()).toBe(1);
    expect(await db.liftAdjustments.count()).toBe(LIFT_IDS.length);
  });

  it("is idempotent: a second run adds nothing and rewrites nothing", async () => {
    await initializeDatabase();
    const before = {
      profile: await db.userProfile.toArray(),
      adjustments: await db.liftAdjustments.toArray(),
      liftStates: await db.liftStates.toArray(),
    };
    const puts = vi.spyOn(db.liftStates, "bulkPut");
    try {
      await initializeDatabase();
      expect(puts).not.toHaveBeenCalled();
    } finally {
      puts.mockRestore();
    }
    expect({
      profile: await db.userProfile.toArray(),
      adjustments: await db.liftAdjustments.toArray(),
      liftStates: await db.liftStates.toArray(),
    }).toEqual(before);
  });

  it("runs again after a settled run, so clearing the tables re-seeds", async () => {
    await initializeDatabase();
    await clearAll();
    expect(await db.userProfile.count()).toBe(0);

    await initializeDatabase();
    const profiles = await db.userProfile.toArray();
    expect(profiles.map((p) => p.id)).toEqual([PROFILE_ID]);
    expect(await db.liftAdjustments.count()).toBe(LIFT_IDS.length);
    expect(await db.liftStates.count()).toBe(LIFT_IDS.length);
  });

  it("does not touch an existing profile and fills in a missing lift later", async () => {
    await initializeDatabase();
    const profile = await db.userProfile.toCollection().first();
    await db.liftAdjustments.delete("start:db_row");
    await db.liftStates.delete("db_row");

    await initializeDatabase();
    expect(await db.userProfile.toArray()).toEqual([profile]);
    expect(await db.liftAdjustments.get("start:db_row")).toMatchObject({ set: { t3Weight: 35 } });
    expect((await db.liftStates.get("db_row"))!.t3Weight).toBe(35);
  });

  it("rebuilds a lift state that went missing, from the log", async () => {
    await initializeDatabase();
    await db.liftStates.delete("squat");
    await initializeDatabase();
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(190);
  });

  it("leaves an edited or deleted start adjustment alone", async () => {
    await initializeDatabase();
    await db.liftAdjustments.update("start:squat", { set: { t1Weight: 225 }, updatedAt: 50 });
    await db.liftAdjustments.update("start:bench", { deletedAt: 60, updatedAt: 60 });
    await db.liftStates.clear();

    await initializeDatabase();
    expect(await db.liftAdjustments.get("start:squat")).toMatchObject({ set: { t1Weight: 225 }, updatedAt: 50 });
    expect(await db.liftAdjustments.get("start:bench")).toMatchObject({ deletedAt: 60 });
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(225);
    // A deleted start adjustment leaves the lift at the empty state.
    expect((await db.liftStates.get("bench"))!.t1Weight).toBe(0);
  });

  it("a rejected run does not stick: the next call runs again", async () => {
    const original = db.userProfile.count.bind(db.userProfile);
    let calls = 0;
    db.userProfile.count = (() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("boom"));
      return original();
    }) as typeof db.userProfile.count;
    try {
      await expect(initializeDatabase()).rejects.toThrow("boom");
      await initializeDatabase();
      expect(await db.userProfile.count()).toBe(1);
    } finally {
      db.userProfile.count = original;
    }
  });
});
