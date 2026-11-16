import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { buildCardioRows, buildSessionRecords } from "@/lib/import/records";
import { buildImportPreview } from "@/lib/import/preview";
import { bigFitbodFile, buildFitbodFile, fRow } from "@/lib/import/parse/fixtures";
import { parseExport } from "@/lib/import/parse";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { strengthSetsOf } from "@/lib/workout/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { ActivityLog } from "@/types";
import { applyRebuild, checkDerived, readSettings } from "./derived";
import {
  countStoredImportedSessions,
  importSessionsInChunks,
  listImportedSessions,
  undoImport,
  writeImportedCardio,
} from "./imported";
import { clearDb, runSession } from "./testUtils";

// Every file here is made up: invented names, dates and weights in the real column layout.

const DAY = 24 * 60 * 60 * 1000;
const noPause = async () => {};

function madeUpFile(): string {
  return buildFitbodFile([
    fRow({ Date: "2026-03-20 10:00:00 +0000", Exercise: "Barbell Squat", "Weight(kg)": 120, Reps: 5, multiplier: " 1.0" }),
    fRow({ Date: "2026-03-20 10:00:00 +0000", Exercise: "Barbell Bench Press", "Weight(kg)": 90, Reps: 5, multiplier: " 1.0" }),
    fRow({ Date: "2026-03-21 10:00:00 +0000", Exercise: "Dumbbell Bench Press", "Weight(kg)": 30, Reps: 8 }),
    fRow({ Date: "2026-03-22 07:00:00 +0000", Exercise: "Walking", Reps: 0, "Weight(kg)": 0, "Duration(s)": 1800, "Distance(m)": 2500 }),
    fRow({ Date: "2026-03-23 07:00:00 +0000", Exercise: "Running", Reps: 0, "Weight(kg)": 0, "Duration(s)": 1500, "Distance(m)": 4000 }),
  ]);
}

function healthWalk(id: string, date: Date, minutes: number): ActivityLog {
  return {
    id,
    clientId: id,
    date,
    kind: "walking",
    durationMinutes: minutes,
    style: null,
    distanceMiles: 1.5,
    notes: "",
    perceivedEffort: null,
    source: "apple_health",
    externalId: `${id}-uuid`,
    sourceName: "Apple Watch",
    updatedAt: 1,
    deletedAt: null,
    synced: true,
  };
}

beforeEach(async () => {
  await clearDb();
});

describe("importing sessions in chunks", () => {
  it("writes every session, reports progress after each chunk and pauses between chunks", async () => {
    const parsed = parseExport(bigFitbodFile(400));
    const rows = buildSessionRecords(parsed, "batch-1");
    const progress: number[] = [];
    let pauses = 0;
    const added = await importSessionsInChunks(rows, {
      chunkSize: 7,
      onProgress: (done) => progress.push(done),
      pause: async () => {
        pauses += 1;
      },
    });
    expect(added).toBe(rows.length);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(rows.length);
    expect(pauses).toBe(Math.ceil(rows.length / 7) - 1);
  });

  it("adds nothing on a second import of the same file (I5)", async () => {
    const text = madeUpFile();
    const first = buildSessionRecords(parseExport(text), "batch-1");
    expect(await importSessionsInChunks(first, { pause: noPause })).toBe(first.length);
    const second = buildSessionRecords(parseExport(text), "batch-2");
    expect(await countStoredImportedSessions(second.map((s) => s.id))).toBe(second.length);
    expect(await importSessionsInChunks(second, { pause: noPause })).toBe(0);
    expect(await db.importedSessions.count()).toBe(first.length);
  });
});

describe("imported cardio (I7)", () => {
  it("adds runs and walks once, skipping one that overlaps a walk from Apple Health", async () => {
    await db.activities.add(healthWalk("health-1", new Date("2026-03-22T07:05:00Z"), 30));
    const { rows } = buildCardioRows(parseExport(madeUpFile()));
    const result = await writeImportedCardio(rows, 1000);
    expect(result.overlapping).toBe(1);
    expect(result.activityIds).toEqual([]);
    expect(result.runIds).toHaveLength(1);
    const run = (await db.runs.get(result.runIds[0]))!;
    expect(run).toMatchObject({ durationMinutes: 25, sourceName: "Fitbod", synced: false, deletedAt: null, perceivedEffort: null });
    expect(run.updatedAt).toBe(1000);
    expect(await db.activities.count()).toBe(1);

    const again = await writeImportedCardio(rows, 2000);
    expect(again.runIds).toEqual([]);
    expect(again.alreadyStored).toBe(1);
    expect(await db.runs.count()).toBe(1);
  });
});

describe("undoing an import", () => {
  it("soft-deletes the import's sessions, runs and activities and leaves the rest", async () => {
    await db.activities.add(healthWalk("health-1", new Date("2026-03-01T07:00:00Z"), 30));
    const text = madeUpFile();
    const sessions = buildSessionRecords(parseExport(text), "batch-1");
    await importSessionsInChunks(sessions, { pause: noPause });
    const cardio = await writeImportedCardio(buildCardioRows(parseExport(text)).rows);
    expect(cardio.activityIds).toHaveLength(1);

    const undone = await undoImport({ batchId: "batch-1", ...cardio }, 5000);
    expect(undone).toEqual({ sessions: sessions.length, runs: 1, activities: 1 });
    expect(await listImportedSessions()).toEqual([]);
    const run = (await db.runs.get(cardio.runIds[0]))!;
    expect(run.deletedAt).not.toBeNull();
    expect(run.deletedAt).toBe(run.updatedAt);
    expect(run.synced).toBe(false);
    expect((await db.activities.get("health-1"))!.deletedAt).toBeNull();
    // Importing the file again after the undo (a corrected import) brings the rows back.
    expect(await importSessionsInChunks(buildSessionRecords(parseExport(text), "batch-2"), { pause: noPause })).toBe(
      sessions.length
    );
    expect((await writeImportedCardio(buildCardioRows(parseExport(text), "batch-2").rows)).runIds).toEqual(cardio.runIds);
    expect((await listImportedSessions()).every((s) => s.importBatchId === "batch-2")).toBe(true);
  });
});

describe("imported sessions never touch the program (I8)", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
    await clearDb();
    await initializeDatabase();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("leaves the rebuilt lift states, the rotation, the plan's evidence and the forecasts unchanged", async () => {
    const setNow = (date: Date) => vi.setSystemTime(date);
    const first = new Date("2026-03-02T09:00:00Z").getTime();
    for (const [i, templateId] of ["A1", "B1", "A2"].entries()) {
      await runSession({ templateId, startedAt: new Date(first + i * 2 * DAY) }, setNow);
    }
    setNow(new Date("2026-03-25T08:00:00Z"));

    const snapshot = async () => {
      const workouts = await db.workouts.toArray();
      const settings = await readSettings();
      const liftStates = await db.liftStates.toArray();
      const next = describeNextWorkout({
        completedWorkouts: workouts.filter((w) => w.completedAt != null),
        templates: WORKOUT_TEMPLATES,
        liftStates,
        plan: {
          location: "gym",
          equipment: settings.equipment,
          includeWarmUps: false,
          selectedAccessories: [],
          variantStates: await db.variantStates.toArray(),
          strengthSets: strengthSetsOf(workouts),
        },
        reentry: true,
      });
      return {
        liftStates: [...liftStates].sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1)),
        variantStates: await db.variantStates.toArray(),
        e1rms: await db.estimated1RMs.toArray(),
        forecasts: await db.forecasts.toArray(),
        templateId: next.templateId,
        plan: next.plan.map((e) => [e.exerciseId, e.tier, e.weight]),
        planEvidence: strengthSetsOf(workouts).length,
      };
    };

    const before = await snapshot();
    expect(before.templateId).toBe("B2");

    // Imported program lifts dated after the app's sessions, and cardio.
    const text = madeUpFile();
    await importSessionsInChunks(buildSessionRecords(parseExport(text), "batch-1"), { pause: noPause });
    await writeImportedCardio(buildCardioRows(parseExport(text)).rows);
    expect(await db.importedSessions.count()).toBeGreaterThan(0);

    const diff = await checkDerived();
    expect(diff.liftStatesToPut).toEqual([]);
    expect(diff.e1rmsToPut).toEqual([]);
    expect(diff.variantStatesToPut ?? []).toEqual([]);
    await applyRebuild();
    expect(await snapshot()).toEqual(before);
  });
});

describe("a 12,000-row file (I13)", () => {
  it("previews and imports within a few seconds, yielding between chunks", async () => {
    const text = bigFitbodFile(12_000);
    const started = performance.now();
    const parsed = parseExport(text);
    const preview = buildImportPreview(parsed);
    expect(preview.sets).toBe(12_000);
    const rows = buildSessionRecords(parsed, "batch-big");
    let pauses = 0;
    const added = await importSessionsInChunks(rows, {
      pause: async () => {
        pauses += 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });
    const elapsed = performance.now() - started;
    expect(added).toBe(rows.length);
    expect(pauses).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5000);
  }, 20_000);
});
