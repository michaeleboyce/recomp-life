import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import type { ImportedSessionRecord } from "@/types";
import { exportBackup, importBackup, parseBackup } from "./backup";
import type { CardioRow } from "@/lib/import/records";
import {
  countStoredImportedSessions,
  deleteImportBatch,
  importBatchDay,
  listImportBatches,
  listImportedSessions,
  restoreImportBatch,
  undoImportBatch,
  writeImportedCardio,
  writeImportedSessions,
} from "./imported";
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

  it("a corrected re-import replaces a session whose stored copy is soft-deleted", async () => {
    await writeImportedSessions([session("a", "b1")], 1000);
    await deleteImportBatch("b1", 2000);
    expect(await countStoredImportedSessions(["a"])).toBe(0);
    expect(await writeImportedSessions([session("a", "b2", { title: "Corrected" })], 1500)).toBe(1);
    const row = await db.importedSessions.get("a");
    expect(row).toMatchObject({ title: "Corrected", importBatchId: "b2", deletedAt: null, synced: false });
    // Its stamp follows the deleted copy's, so it wins on every device even with a slow clock.
    expect(row!.updatedAt).toBeGreaterThan(2000);
    expect(await countStoredImportedSessions(["a"])).toBe(1);
    // A live copy is still left alone.
    expect(await writeImportedSessions([session("a", "b3", { title: "Again" })])).toBe(0);
    expect((await db.importedSessions.get("a"))!.title).toBe("Corrected");
  });
});

const walk = (id: string, batch: string | undefined, at = "2026-01-06T07:00:00Z"): CardioRow => ({
  table: "activities",
  row: {
    id, clientId: id, date: new Date(at), kind: "walking", durationMinutes: 30, style: null, distanceMiles: null,
    notes: "", perceivedEffort: null, sourceName: "Fitbod", ...(batch ? { importBatchId: batch } : {}),
    updatedAt: 0, deletedAt: null, synced: false,
  },
});
const run = (id: string, batch: string, at = "2026-01-07T07:00:00Z"): CardioRow => ({
  table: "runs",
  row: {
    id, clientId: id, date: new Date(at), durationMinutes: 20, distanceMiles: 2, type: "outdoor", category: "other",
    notes: "", perceivedEffort: null, sourceName: "Fitbod", importBatchId: batch, updatedAt: 0, deletedAt: null, synced: false,
  },
});

describe("import batches in Recently deleted (any device)", () => {
  it("are listed with their day, source and counts, the preload's included", async () => {
    await writeImportedSessions([session("a", "preload-2026-11-16"), session("b", "preload-2026-11-16")]);
    await writeImportedSessions([session("c", "import-2026-11-20-x", { sourceApp: "gravl" })]);
    await writeImportedCardio([walk("w1", "preload-2026-11-16"), run("r1", "preload-2026-11-16")]);

    const batches = await listImportBatches();
    expect(batches.map((b) => b.batchId)).toEqual(["import-2026-11-20-x", "preload-2026-11-16"]);
    expect(batches[1]).toMatchObject({
      sourceApp: "fitbod",
      importedOn: "2026-11-16",
      live: { sessions: 2, sets: 2, runs: 1, activities: 1 },
      undone: { sessions: 0, runs: 0, activities: 0 },
    });
    expect(batches[1].from).toEqual(new Date("2026-01-05T10:00:00Z"));
    expect(batches[0]).toMatchObject({ sourceApp: "gravl", importedOn: "2026-11-20" });
  });

  it("an import is undone from its batch id alone, cardio included, and restored", async () => {
    await writeImportedSessions([session("a", "b1"), session("b", "b1"), session("c", "b2")], 1000);
    await writeImportedCardio([walk("w1", "b1"), run("r1", "b1"), walk("w2", "b2", "2026-02-01T07:00:00Z")], 1000);

    expect(await undoImportBatch("b1", 5000)).toEqual({ sessions: 2, runs: 1, activities: 1 });
    expect((await listImportedSessions()).map((s) => s.id)).toEqual(["c"]);
    expect((await db.activities.get("w1"))!.deletedAt).toBe(5000);
    expect((await db.runs.get("r1"))!.deletedAt).toBe(5000);
    expect((await db.activities.get("w2"))!.deletedAt).toBeNull();
    const undone = (await listImportBatches()).find((b) => b.batchId === "b1")!;
    expect(undone.live).toEqual({ sessions: 0, sets: 0, runs: 0, activities: 0 });
    expect(undone.undone).toEqual({ sessions: 2, runs: 1, activities: 1 });

    expect(await restoreImportBatch("b1", 6000)).toEqual({ sessions: 2, runs: 1, activities: 1 });
    expect((await listImportedSessions()).map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
    expect((await db.runs.get("r1"))).toMatchObject({ deletedAt: null, synced: false, updatedAt: 6000 });
    expect(await restoreImportBatch("b1", 7000)).toEqual({ sessions: 0, runs: 0, activities: 0 });
  });

  it("a corrected re-import replaces cardio the undo soft-deleted, ignoring its old time", async () => {
    await writeImportedCardio([walk("w1", "b1")], 1000);
    await undoImportBatch("b1", 2000);
    const result = await writeImportedCardio([walk("w1", "b2")], 1500);
    expect(result.activityIds).toEqual(["w1"]);
    expect(await db.activities.get("w1")).toMatchObject({ importBatchId: "b2", deletedAt: null });
    expect((await db.activities.get("w1"))!.updatedAt).toBeGreaterThan(2000);
  });

  it("reads the day from a batch id", () => {
    expect(importBatchDay("preload-2026-11-16")).toBe("2026-11-16");
    expect(importBatchDay("import-2026-11-20-0c1d2e3f-aaaa-bbbb-cccc-1234567890ab")).toBe("2026-11-20");
    expect(importBatchDay("import-0c1d2e3f-aaaa-bbbb-cccc-1234567890ab")).toBeNull();
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
