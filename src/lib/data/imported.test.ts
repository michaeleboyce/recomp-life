import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import type { ImportedSessionRecord } from "@/types";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { deleteImportBatch, listImportedSessions, writeImportedSessions } from "./imported";
import { clearDb } from "./testUtils";

beforeEach(clearDb);

function session(id: string, batch: string, overrides: Partial<ImportedSessionRecord> = {}): ImportedSessionRecord {
  return {
    id,
    clientId: id,
    sourceApp: "fitbod",
    startedAt: new Date("2026-01-05T10:00:00Z"),
    startIsLocal: false,
    endedAt: null,
    title: "Test day",
    notes: "",
    importBatchId: batch,
    sets: [
      {
        id: `${id}-s1`,
        exerciseName: "Test Press",
        mappedExerciseId: null,
        muscles: ["chest"],
        setOrder: 1,
        reps: 8,
        weightPerImplementLb: 20,
        implementCount: 2,
        multiplierRaw: 2,
        weightCountsAsLoad: true,
        durationSec: null,
        distanceM: null,
        role: "work",
        effort: "Hard",
      },
    ],
    updatedAt: 0,
    deletedAt: null,
    synced: true,
    ...overrides,
  };
}

describe("writeImportedSessions", () => {
  it("writing the same rows twice keeps one row each and never updates", async () => {
    expect(await writeImportedSessions([session("a", "b1"), session("b", "b1")])).toBe(2);
    const before = await db.importedSessions.get("a");
    expect(before!.synced).toBe(false);
    expect(await writeImportedSessions([session("a", "b2", { title: "Changed" }), session("c", "b2")], 5)).toBe(1);
    expect(await db.importedSessions.count()).toBe(3);
    expect(await db.importedSessions.get("a")).toEqual(before);
  });

  it("skips a repeat id inside one call and writes nothing for an empty list", async () => {
    expect(await writeImportedSessions([session("a", "b1"), session("a", "b1")])).toBe(1);
    expect(await writeImportedSessions([])).toBe(0);
  });

  it("does not resurrect a soft-deleted session", async () => {
    await writeImportedSessions([session("a", "b1")]);
    await deleteImportBatch("b1");
    expect(await writeImportedSessions([session("a", "b2")])).toBe(0);
    expect(await listImportedSessions()).toEqual([]);
  });
});

describe("deleteImportBatch", () => {
  it("soft-deletes every row of the batch and nothing else", async () => {
    await writeImportedSessions([session("a", "b1"), session("b", "b1"), session("c", "b2")], 1000);
    const other = await db.importedSessions.get("c");
    expect(await deleteImportBatch("b1", 2000)).toBe(2);
    for (const id of ["a", "b"]) {
      const row = await db.importedSessions.get(id);
      expect(row!.deletedAt).toBe(2000);
      expect(row!.updatedAt).toBe(2000);
      expect(row!.synced).toBe(false);
    }
    expect(await db.importedSessions.get("c")).toEqual(other);
    expect((await listImportedSessions()).map((r) => r.id)).toEqual(["c"]);
    expect(await deleteImportBatch("b1", 3000)).toBe(0);
  });
});

describe("backup round trip", () => {
  it("exports and restores imported sessions, soft-deleted ones included", async () => {
    await writeImportedSessions([session("a", "b1"), session("b", "b2")]);
    await deleteImportBatch("b2");
    const exported = await exportBackup();
    expect(exported.tables.importedSessions.map((r) => r.id).sort()).toEqual(["a", "b"]);

    const parsed = parseBackup(JSON.stringify(exported));
    await clearDb();
    await importBackup(parsed);
    const a = await db.importedSessions.get("a");
    expect(a!.startedAt).toBeInstanceOf(Date);
    expect(a!.sets[0].exerciseName).toBe("Test Press");
    expect((await db.importedSessions.get("b"))!.deletedAt).not.toBeNull();
  });

  it("reads an older backup that has no importedSessions list", () => {
    const old = { version: 2, exportedAt: "2026-11-01T00:00:00.000Z", tables: {} as Record<string, unknown[]> };
    for (const name of ["workouts", "liftAdjustments", "runs", "activities", "bodyweight", "painEntries", "readinessLogs", "userProfile"]) {
      old.tables[name] = [];
    }
    expect(parseBackup(JSON.stringify(old)).tables.importedSessions).toEqual([]);
  });
});
