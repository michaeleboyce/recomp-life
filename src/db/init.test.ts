import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./local";
import { initializeDatabase } from "./init";
import { INITIAL_LIFT_STATES } from "./seed";

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

describe("initializeDatabase", () => {
  beforeEach(clearAll);

  it("seeds one profile and the initial lift states on an empty database", async () => {
    await initializeDatabase();
    expect(await db.userProfile.count()).toBe(1);
    expect(await db.liftStates.count()).toBe(Object.keys(INITIAL_LIFT_STATES).length);
  });

  it("concurrent calls share one run and seed exactly once", async () => {
    const a = initializeDatabase();
    const b = initializeDatabase();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(await db.userProfile.count()).toBe(1);
    expect(await db.liftStates.count()).toBe(Object.keys(INITIAL_LIFT_STATES).length);
  });

  it("many simultaneous calls still create a single profile", async () => {
    await Promise.all(Array.from({ length: 6 }, () => initializeDatabase()));
    expect(await db.userProfile.count()).toBe(1);
  });

  it("runs again after a settled run, so clearing the tables re-seeds", async () => {
    await initializeDatabase();
    const firstId = (await db.userProfile.toCollection().first())?.id;
    await clearAll();
    expect(await db.userProfile.count()).toBe(0);

    await initializeDatabase();
    const profiles = await db.userProfile.toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).not.toBe(firstId);
    expect(await db.liftStates.count()).toBe(Object.keys(INITIAL_LIFT_STATES).length);
  });

  it("does not touch an existing profile and backfills missing lift states", async () => {
    await initializeDatabase();
    const profile = await db.userProfile.toCollection().first();
    await db.liftStates.delete("db_row");

    await initializeDatabase();
    expect((await db.userProfile.toArray()).map((p) => p.id)).toEqual([profile!.id]);
    expect(await db.liftStates.get("db_row")).toBeDefined();
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
