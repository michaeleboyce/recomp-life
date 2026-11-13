import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LEGACY = "recomp-life";

async function makeLegacyDatabase() {
  const legacy = new Dexie(LEGACY);
  legacy.version(1).stores({ workouts: "id" });
  await legacy.open();
  await legacy.table("workouts").put({ id: "old" });
  legacy.close();
}

describe("the local database", () => {
  it("is one fresh database with a single version and no sets table or synced index", async () => {
    const { db, DATABASE_NAME } = await import("./local");
    expect(DATABASE_NAME).toBe("recomp-life-2");
    expect(db.name).toBe("recomp-life-2");
    await db.open();
    expect(db.verno).toBe(1);

    const schema = Object.fromEntries(
      db.tables.map((t) => [
        t.name,
        [t.schema.primKey.name, ...t.schema.indexes.map((i) => i.name)].join(", "),
      ])
    );
    expect(schema).toEqual({
      workouts: "id, clientId, startedAt, templateId",
      runs: "id, clientId, date",
      activities: "id, clientId, date",
      bodyweight: "id, clientId, date",
      painEntries: "id, clientId, date",
      readinessLogs: "id, clientId, sessionId, date",
      userProfile: "id, clientId",
      healthDaily: "id, clientId, day",
      liftAdjustments: "id, clientId, exerciseId, at",
      liftStates: "exerciseId",
      estimated1RMs: "id, exerciseId, date, workoutSessionId",
    });
  });
});

describe("dropLegacyDatabase", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("deletes the old database, leaves the new one, and remembers it is done", async () => {
    await makeLegacyDatabase();
    const { db, dropLegacyDatabase } = await import("./local");
    await db.userProfile.put({ id: "keep" } as never);
    expect(await Dexie.exists(LEGACY)).toBe(true);

    await dropLegacyDatabase();

    expect(await Dexie.exists(LEGACY)).toBe(false);
    expect(await db.userProfile.count()).toBe(1);
    await db.userProfile.clear();

    // A later page load skips the delete entirely.
    vi.resetModules();
    const again = await import("./local");
    const remove = vi.spyOn(Dexie, "delete");
    try {
      await again.dropLegacyDatabase();
      expect(remove).not.toHaveBeenCalled();
    } finally {
      remove.mockRestore();
    }
  });

  it("runs at most once per page load", async () => {
    const { dropLegacyDatabase } = await import("./local");
    const remove = vi.spyOn(Dexie, "delete");
    try {
      await Promise.all([dropLegacyDatabase(), dropLegacyDatabase()]);
      await dropLegacyDatabase();
      expect(remove).toHaveBeenCalledTimes(1);
    } finally {
      remove.mockRestore();
    }
  });

  it("never rejects, and tries again on a later load after a failure", async () => {
    const { dropLegacyDatabase } = await import("./local");
    const remove = vi.spyOn(Dexie, "delete").mockRejectedValue(new Error("blocked"));
    try {
      await expect(dropLegacyDatabase()).resolves.toBeUndefined();
    } finally {
      remove.mockRestore();
    }

    vi.resetModules();
    const again = await import("./local");
    const retry = vi.spyOn(Dexie, "delete");
    try {
      await again.dropLegacyDatabase();
      expect(retry).toHaveBeenCalledTimes(1);
    } finally {
      retry.mockRestore();
    }
  });
});
