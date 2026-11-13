import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { applyRebuild } from "./derived";
import { clearDb } from "./testUtils";

const NOW = new Date(2026, 10, 11, 12, 0, 0);
const demo = generateDemoData(NOW);

async function seedDemo() {
  await clearDb();
  await initializeDatabase();
  await db.liftAdjustments.clear();
  await db.liftAdjustments.bulkPut(demo.liftAdjustments);
  await db.workouts.bulkPut(demo.workouts);
  await db.runs.bulkPut(demo.runs);
  await db.bodyweight.bulkPut(demo.bodyweight);
  await db.readinessLogs.bulkPut(demo.readinessLogs);
  await db.painEntries.bulkPut(demo.painEntries);
  await applyRebuild();
}

/** Rows without the fields an import restamps. */
const unstamped = <T extends { id: string }>(rows: T[]) =>
  rows
    .map((r) => {
      const { updatedAt, synced, ...rest } = r as T & { updatedAt?: number; synced?: boolean };
      void updatedAt;
      void synced;
      return rest;
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));

beforeEach(seedDemo);

describe("exportBackup", () => {
  it("writes version 2 with the log tables only", async () => {
    const backup = await exportBackup();
    expect(backup.version).toBe(2);
    expect(Object.keys(backup.tables).sort()).toEqual(
      [
        "activities",
        "bodyweight",
        "healthDaily",
        "liftAdjustments",
        "painEntries",
        "readinessLogs",
        "runs",
        "userProfile",
        "workouts",
      ].sort()
    );
    expect(backup.tables.workouts).toHaveLength(24);
    expect(backup.tables.workouts[0].sets.length).toBeGreaterThan(0);
  });
});

describe("round trip", () => {
  it("restores the same log and the same rebuilt lift states", async () => {
    const before = {
      workouts: await db.workouts.toArray(),
      adjustments: await db.liftAdjustments.toArray(),
      runs: await db.runs.toArray(),
      bodyweight: await db.bodyweight.toArray(),
      profile: await db.userProfile.toArray(),
      liftStates: await db.liftStates.toArray(),
      e1rms: await db.estimated1RMs.toArray(),
    };
    const file = JSON.stringify(await exportBackup());

    await clearDb();
    expect(await db.workouts.count()).toBe(0);
    await importBackup(parseBackup(file));

    expect(unstamped(await db.workouts.toArray())).toEqual(unstamped(before.workouts));
    expect(unstamped(await db.liftAdjustments.toArray())).toEqual(unstamped(before.adjustments));
    expect(unstamped(await db.runs.toArray())).toEqual(unstamped(before.runs));
    expect(unstamped(await db.bodyweight.toArray())).toEqual(unstamped(before.bodyweight));
    expect(unstamped(await db.userProfile.toArray())).toEqual(unstamped(before.profile));
    const byId = <T extends { exerciseId: string }>(rows: T[]) =>
      [...rows].sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1));
    expect(byId(await db.liftStates.toArray())).toEqual(byId(before.liftStates));
    expect((await db.estimated1RMs.toArray()).length).toBe(before.e1rms.length);
  });

  it("marks restored rows unsynced with a fresh stamp", async () => {
    const backup = parseBackup(JSON.stringify(await exportBackup()));
    const start = Date.now();
    await importBackup(backup);
    for (const row of await db.workouts.toArray()) {
      expect(row.synced).toBe(false);
      expect(row.updatedAt!).toBeGreaterThanOrEqual(start);
    }
  });

  it("rebuilds the derived tables from the restored log", async () => {
    const backup = parseBackup(JSON.stringify(await exportBackup()));
    await db.liftStates.clear();
    await db.estimated1RMs.clear();
    await importBackup(backup);
    expect(await db.liftStates.count()).toBeGreaterThan(0);
    const squat = await db.liftStates.get("squat");
    expect(squat?.t1Weight).toBe(demo.liftStates.find((l) => l.exerciseId === "squat")!.t1Weight);
  });
});

describe("parseBackup", () => {
  it("accepts a version 1 file, revives dates and ignores derived tables", () => {
    const v1 = {
      version: 1,
      exportedAt: "2026-05-01T10:00:00.000Z",
      workouts: [{ id: "w1", startedAt: "2026-04-01T10:00:00.000Z", sets: [] }],
      userProfile: [{ id: "p1" }],
      sets: [{ id: "s1" }],
      liftStates: [{ id: "x" }],
      estimated1RMs: [{ id: "y" }],
    };
    const backup = parseBackup(JSON.stringify(v1));
    expect(backup.version).toBe(2);
    expect(backup.tables.workouts[0].startedAt).toBeInstanceOf(Date);
    expect(backup.tables.liftAdjustments).toEqual([]);
    expect(backup.tables).not.toHaveProperty("liftStates");
    expect(backup.tables).not.toHaveProperty("sets");
  });

  it("restores a version 1 file and lets the seed add the starting weights", async () => {
    const v1 = JSON.stringify({
      version: 1,
      workouts: [],
      userProfile: (await db.userProfile.toArray()).map((p) => ({ ...p })),
    });
    await importBackup(parseBackup(v1));
    expect(await db.liftAdjustments.count()).toBe(0);
    await initializeDatabase();
    expect(await db.liftAdjustments.count()).toBeGreaterThan(0);
    expect((await db.liftStates.get("squat"))?.t1Weight).toBe(190);
  });

  it("rejects malformed JSON, wrong versions and missing tables with a message", () => {
    expect(() => parseBackup("{not json")).toThrow(/could not be read/);
    expect(() => parseBackup("[]")).toThrow(/not a Recomp Life backup/);
    expect(() => parseBackup(JSON.stringify({ version: 3, tables: {} }))).toThrow(/version 3/);
    expect(() => parseBackup(JSON.stringify({ workouts: [] }))).toThrow(/version undefined/);
    expect(() => parseBackup(JSON.stringify({ version: 2 }))).toThrow(/no data tables/);
    expect(() =>
      parseBackup(JSON.stringify({ version: 2, tables: { workouts: [] } }))
    ).toThrow(/no "liftAdjustments" list/);
    expect(() => parseBackup(JSON.stringify({ version: 1, workouts: [] }))).toThrow(
      /no "userProfile" list/
    );
    expect(() =>
      parseBackup(JSON.stringify({ version: 1, workouts: [{ nope: 1 }], userProfile: [] }))
    ).toThrow(/damaged entry in "workouts"/);
  });
});

describe("optional tables", () => {
  it("accepts a version 2 file written before the health table existed", () => {
    const tables = {
      workouts: [], liftAdjustments: [], runs: [], activities: [], bodyweight: [],
      painEntries: [], readinessLogs: [], userProfile: [],
    };
    const backup = parseBackup(JSON.stringify({ version: 2, exportedAt: "2026-11-12T00:00:00.000Z", tables }));
    expect(backup.tables.healthDaily).toEqual([]);
  });
});
