import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import type { Forecast } from "@/types";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { horizonSlot } from "@/lib/forecast";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import {
  forecastTables,
  listForecasts,
  readLedgerRecords,
  recordLiftForecasts,
  strengthSetsFrom,
  writeForecasts,
} from "./forecasts";
import { clearDb } from "./testUtils";

beforeEach(clearDb);

function makeForecast(id: string, overrides: Partial<Forecast> = {}): Forecast {
  return {
    id,
    clientId: id,
    slot: id,
    kind: "amrapReps",
    workoutId: "w1",
    exerciseId: "squat",
    tier: "T1",
    madeAt: new Date("2026-11-14T09:00:00Z"),
    dueAt: new Date("2026-11-14T10:00:00Z"),
    event: { type: "amrapReps", weight: 200 },
    prediction: { point: 5, low: 3, high: 7, unit: "reps" },
    basis: "trend",
    inputs: { level: 250, scatter: 10 },
    modelVersion: "test-1",
    updatedAt: 0,
    deletedAt: null,
    synced: true,
    ...overrides,
  };
}

describe("writeForecasts", () => {
  it("adds rows stamped as new and unsynced", async () => {
    expect(await writeForecasts([makeForecast("a"), makeForecast("b")], 5000)).toBe(2);
    const row = (await db.forecasts.get("a"))!;
    expect(row).toMatchObject({ updatedAt: 5000, deletedAt: null, synced: false });
    expect(await db.forecasts.count()).toBe(2);
  });

  it("leaves a stored row identical when the same id is written again", async () => {
    await writeForecasts([makeForecast("a")], 5000);
    const stored = await db.forecasts.get("a");

    const added = await writeForecasts(
      [makeForecast("a", { prediction: { point: 9, unit: "reps" }, basis: "prior" }), makeForecast("c")],
      9000
    );

    expect(added).toBe(1);
    expect(await db.forecasts.get("a")).toEqual(stored);
    expect(await db.forecasts.count()).toBe(2);
  });

  it("keeps the first of a repeated id within one call", async () => {
    await writeForecasts([makeForecast("a"), makeForecast("a", { basis: "prior" })]);
    expect((await db.forecasts.get("a"))!.basis).toBe("trend");
  });

  it("writes nothing for an empty list", async () => {
    expect(await writeForecasts([])).toBe(0);
  });
});

describe("listForecasts and forecastTables", () => {
  it("lists live forecasts oldest made first", async () => {
    await writeForecasts([
      makeForecast("late", { madeAt: new Date("2026-11-15T00:00:00Z") }),
      makeForecast("early", { madeAt: new Date("2026-11-13T00:00:00Z") }),
      makeForecast("gone"),
    ]);
    // Test setup only: soft-delete one row to check the filter.
    await db.forecasts.where("id").equals("gone").modify({ deletedAt: 1 });
    expect((await listForecasts()).map((f) => f.id)).toEqual(["early", "late"]);
  });

  it("names the forecasts table for transactions", () => {
    expect(forecastTables()).toEqual([db.forecasts]);
  });
});

describe("forecasts are write-once", () => {
  const ROOT = join(process.cwd(), "src");
  // The sync engine marks pushed rows synced through a generic lookup by name
  // (src/lib/sync.ts), so it does not match; this file's own setup is exempt.
  const ALLOWED = new Set(["lib/data/forecasts.test.ts"]);
  const FORBIDDEN =
    /\bforecasts\s*\??\.\s*(update|put|modify|bulkPut)\b|table\(\s*["']forecasts["']\s*\)\s*\.\s*(update|put|modify|bulkPut)\b/;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("no code, the writer included, updates, puts, modifies or bulk-puts the table", () => {
    const offenders = sourceFiles(ROOT)
      .map((path) => relative(ROOT, path))
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => FORBIDDEN.test(readFileSync(join(ROOT, path), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the pattern catches what it should", () => {
    for (const bad of [
      "db.forecasts.update(",
      "db.forecasts.put(",
      "db.forecasts.modify(",
      "db.forecasts.bulkPut(",
      'db.table("forecasts").put(',
    ]) {
      expect(FORBIDDEN.test(bad), bad).toBe(true);
    }
    expect(FORBIDDEN.test("db.forecasts.bulkAdd(")).toBe(false);
  });
});

describe("recordLiftForecasts", () => {
  it("writes each lift's forecasts for a date ahead, the stall chance and round-number date included, once a week", async () => {
    const now = new Date(2026, 10, 14, 19);
    const demo = generateDemoData(now);
    await db.workouts.bulkAdd(demo.workouts);
    await db.liftStates.bulkAdd(demo.liftStates);

    expect(await recordLiftForecasts(["squat"], now)).toBeGreaterThan(0);
    const rows = await db.forecasts.toArray();
    expect(rows.every((row) => row.exerciseId === "squat")).toBe(true);
    expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(["e1rm4w", "stallRisk", "milestone"]));
    for (const row of rows) {
      expect(row.slot).toBe(horizonSlot(row.kind, "squat", now));
      expect(row.workoutId).toBeUndefined();
    }
    // Later the same week: the squat's rows stay exactly as they were; the bench gets its own.
    expect(await recordLiftForecasts(["squat", "bench"], new Date(now.getTime() + 60_000))).toBeGreaterThan(0);
    const after = await db.forecasts.toArray();
    for (const row of rows) expect(after.find((other) => other.id === row.id)).toEqual(row);
    expect(after.filter((row) => row.exerciseId === "squat")).toHaveLength(rows.length);
  });
});

describe("readLedgerRecords and strengthSetsFrom", () => {
  it("plan from the app's sets and the imported sessions', names read through the remembered choices (made-up)", async () => {
    const mystery = makeImportedSession([makeImportedSet({ exerciseName: "Mystery Press", mappedExerciseId: null, weightPerImplementLb: 50 })]);
    const squat = makeImportedSession([makeImportedSet()]);
    const undone = makeImportedSession([makeImportedSet()], { deletedAt: 3 });
    await db.importedSessions.bulkPut([mystery, squat, undone]);

    const plain = await readLedgerRecords(new Date(), {});
    expect(plain.importedSessions).toHaveLength(3);
    const sets = strengthSetsFrom(plain);
    expect(sets.map((s) => s.sessionId)).toEqual([squat.id]);
    expect(sets.every((s) => s.imported)).toBe(true);
    // The same evidence while the records are the same.
    expect(strengthSetsFrom(plain)).toBe(sets);

    const remapped = await readLedgerRecords(new Date(), { "Mystery Press": { kind: "exercise", exerciseId: "db_bench" } });
    expect(strengthSetsFrom(remapped).map((s) => s.exerciseId).sort()).toEqual(["db_bench", "squat"]);
    // Records built by hand, without imported sessions, plan from the log alone.
    expect(strengthSetsFrom({ workouts: [] })).toEqual([]);
  });
});
