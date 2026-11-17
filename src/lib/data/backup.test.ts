import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { INITIAL_LIFT_STATES } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import type {
  ActivityLog,
  BodyweightLog,
  CoachEvent,
  FavoriteWorkout,
  Forecast,
  HealthDailyLog,
  ImportedSessionRecord,
  LiftAdjustment,
  PainSorenessEntry,
  ReadinessLog,
  RunLog,
  WorkoutSession,
} from "@/types";
import { exportBackup, importBackup, parseBackup, type BackupTables } from "./backup";
import { applyRebuild } from "./derived";
import { clearDb, makeProfile, makeWorkout } from "./testUtils";
import { loadPullState, saveTablePullState } from "@/lib/sync/pullState";

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
        "coachEvents",
        "favoriteWorkouts",
        "forecasts",
        "healthDaily",
        "importedSessions",
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

  it("forgets how far sync pulled, so the server's rows the backup lacks come back", async () => {
    const backup = parseBackup(JSON.stringify(await exportBackup()));
    saveTablePullState(db.name, "workouts", { since: 1234 });
    await importBackup(backup);
    expect(loadPullState(db.name)).toEqual({});
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

/**
 * A version 1 file as the app wrote it before the log model (synthetic values): rows
 * without stamps, and a profile, pain entry and readiness check-in from before
 * `clientId` existed. Its `sets`, `liftStates` and `estimated1RMs` are ignored.
 */
function versionOneFile() {
  const at = "2026-04-01T10:00:00.000Z";
  return {
    version: 1,
    exportedAt: "2026-05-01T10:00:00.000Z",
    workouts: [
      {
        id: "w1", clientId: "c-w1", templateId: "A1", location: "gym", startedAt: at,
        completedAt: "2026-04-01T10:45:00.000Z", totalDurationSeconds: 2700, includeWarmUps: true,
        selectedAccessories: [], preWorkoutPainEntries: [], modifications: [], synced: true,
        sets: [
          {
            id: "s1", clientId: "s1", exerciseId: "squat", tier: "T1", setNumber: 1, targetReps: 3,
            actualReps: 3, weight: 135, isAMRAP: false, completedAt: at, restAfterSeconds: 180,
            status: "completed", isSubstituted: false, location: "gym", synced: true,
          },
        ],
      },
    ],
    runs: [
      {
        id: "r1", clientId: "c-r1", date: at, durationMinutes: 30, distanceMiles: 3, type: "outdoor",
        category: "easy", notes: "", perceivedEffort: 3, synced: true,
      },
    ],
    bodyweight: [{ id: "bw1", clientId: "c-bw1", date: at, weight: 180, timeOfDay: "morning", synced: true }],
    painEntries: [{ id: "pain1", date: at, region: "neck", sensation: "soreness", severity: 2 }],
    readinessLogs: [{ id: "rd1", sessionId: "w1", sleepHours: "7+", stressLevel: "low", date: at }],
    userProfile: [
      {
        id: "p1", name: "", bodyweight: 180, heightInches: 70, createdAt: "2026-01-01T00:00:00.000Z",
        settings: { ...makeProfile().settings },
      },
    ],
    sets: [{ id: "s1" }],
    liftStates: [{ id: "x" }],
    estimated1RMs: [{ id: "y" }],
  };
}

/** One row of every log table, each built to its type, so a check stricter than the types fails here. */
function everyTableRow(): BackupTables {
  const at = new Date("2026-11-10T07:00:00Z");
  const stamps = { updatedAt: 5, deletedAt: null, synced: true } as const;
  const workout: WorkoutSession = makeWorkout({
    id: "w-all",
    completedAt: new Date("2026-11-10T08:00:00Z"),
    sets: [
      {
        id: "w-all-s1", clientId: "w-all-s1", exerciseId: "squat", tier: "T1", setNumber: 1, targetReps: 3,
        actualReps: 3, weight: 135, isAMRAP: false, completedAt: at, restAfterSeconds: 180,
        status: "completed", isSubstituted: false, location: "gym", synced: true,
      },
    ],
    ...stamps,
  });
  const adjustment: LiftAdjustment = {
    id: "adj-all", clientId: "adj-all", exerciseId: "bench", at, source: "manual",
    set: { t2Weight: 100 }, variant: null, note: "made up", ...stamps,
  };
  const run: RunLog = {
    id: "run-all", clientId: "run-all", date: at, durationMinutes: 30, distanceMiles: null, type: "outdoor",
    category: "easy", notes: "", perceivedEffort: null, source: "import", sourceName: "Watch",
    importBatchId: "batch-1", ...stamps,
  };
  const activity: ActivityLog = {
    id: "act-all", clientId: "act-all", date: at, kind: "yoga", durationMinutes: 40, style: "flow",
    distanceMiles: null, notes: "", perceivedEffort: 2, ...stamps,
  };
  const weighIn: BodyweightLog = {
    id: "bw-all", clientId: "bw-all", date: at, weight: 180.4, timeOfDay: "morning", ...stamps,
  };
  const pain: PainSorenessEntry = {
    id: "pain-all", clientId: "pain-all", date: at, region: "neck", sensation: "soreness", severity: 2,
    notes: "", associatedWorkoutId: "w-all", ...stamps,
  };
  const readiness: ReadinessLog = {
    id: "rd-all", clientId: "rd-all", sessionId: "w-all", sleepHours: "7+", stressLevel: "low",
    sleepMinutes: null, date: at, ...stamps,
  };
  const health: HealthDailyLog = {
    id: "hd:2026-11-10", clientId: "hd:2026-11-10", day: "2026-11-10", sleepMinutes: 420,
    sleepDeepMinutes: null, sleepRemMinutes: null, steps: 8000, restingHr: 55, hrvMs: null,
    activeEnergyKcal: null, exerciseMinutes: 30, vo2Max: null, bodyFatPct: null, leanMassLbs: null,
    dietaryKcal: null, proteinG: null, ...stamps,
  };
  const favorite: FavoriteWorkout = {
    id: "fav-all", clientId: "fav-all", name: "Short day", templateId: "A1", location: "home",
    includeWarmUps: false, selectedAccessories: [], substitutes: {}, edits: [], snapshot: [],
    createdAt: at, lastUsedAt: at, ...stamps,
  };
  const forecast: Forecast = {
    id: "fc-all", clientId: "fc-all", slot: "bodyweight4w|body|2026-W46", kind: "bodyweight4w",
    madeAt: at, dueAt: new Date("2026-12-08T07:00:00Z"), event: { type: "bodyweightMean" },
    prediction: { point: 178, unit: "lbs" }, basis: "trend", inputs: { level: 180 }, modelVersion: "1", ...stamps,
  };
  const event: CoachEvent = {
    id: "ce-all", clientId: "ce-all", at, kind: "settingsChange", title: "Changed", detail: "Made up.",
    data: { setting: "trainingPhase" }, ...stamps,
  };
  const imported: ImportedSessionRecord = {
    id: "imp-all", clientId: "imp-all", sourceApp: "fitbod", startedAt: at, startIsLocal: false,
    endedAt: null, title: "Legs", notes: "", importBatchId: "batch-1", ...stamps,
    sets: [
      {
        id: "imp-all-1", exerciseName: "Leg Press", mappedExerciseId: null, setOrder: 1, reps: 10,
        weightPerImplementLb: 200, implementCount: 1, multiplierRaw: null, weightCountsAsLoad: true,
        durationSec: null, distanceM: null, role: "work", effort: null,
      },
    ],
  };
  return {
    workouts: [workout],
    liftAdjustments: [adjustment],
    runs: [run],
    activities: [activity],
    bodyweight: [weighIn],
    painEntries: [pain],
    readinessLogs: [readiness],
    userProfile: [makeProfile({ id: "p-all", clientId: "p-all", ...stamps })],
    healthDaily: [health],
    favoriteWorkouts: [favorite],
    forecasts: [forecast],
    coachEvents: [event],
    importedSessions: [imported],
  };
}

/** A version 2 file, written the way exportBackup writes one. */
const versionTwoFile = (tables: unknown) =>
  JSON.stringify({ version: 2, exportedAt: "2026-11-12T00:00:00.000Z", tables });

/** The log tables' row counts, to show a refused restore changed nothing. */
async function logCounts() {
  return {
    workouts: await db.workouts.count(),
    bodyweight: await db.bodyweight.count(),
    runs: await db.runs.count(),
    userProfile: await db.userProfile.count(),
    liftAdjustments: await db.liftAdjustments.count(),
  };
}

describe("row checks before anything is replaced", () => {
  it("refuses an id-only weigh-in, names the table and the missing field, and replaces nothing", async () => {
    const backup = await exportBackup();
    const before = await logCounts();
    const tables = { ...backup.tables, bodyweight: [...backup.tables.bodyweight, { id: "bw-bad" }] };

    let message = "";
    try {
      parseBackup(versionTwoFile(tables));
    } catch (err) {
      message = (err as Error).message;
    }
    const position = `${backup.tables.bodyweight.length + 1} of ${backup.tables.bodyweight.length + 1}`;
    expect(message).toBe(
      `This backup cannot be restored, so nothing was changed: weigh-in ${position} in "bodyweight" (id "bw-bad") has no "date".`
    );

    // The same rows handed straight to the restore: refused before its transaction opens.
    await expect(
      importBackup({ ...backup, tables: tables as unknown as BackupTables })
    ).rejects.toThrow(/in "bodyweight" \(id "bw-bad"\) has no/);
    expect(await logCounts()).toEqual(before);
  });

  it("refuses a date that is not one", () => {
    const tables = everyTableRow();
    const file = JSON.parse(versionTwoFile(tables));
    file.tables.workouts[0].startedAt = "last tuesday";
    expect(() => parseBackup(JSON.stringify(file))).toThrow(
      'workout 1 of 1 in "workouts" (id "w-all") has "startedAt" as the text "last tuesday", not a date.'
    );

    file.tables.workouts[0].startedAt = "2026-13-45T09:00:00.000Z";
    expect(() => parseBackup(JSON.stringify(file))).toThrow(
      'workout 1 of 1 in "workouts" (id "w-all") has "startedAt" set to a date that does not exist.'
    );
  });

  it("refuses a field of the wrong type, inside a workout's sets too", () => {
    const file = JSON.parse(versionTwoFile(everyTableRow()));
    file.tables.runs[0].durationMinutes = "thirty";
    expect(() => parseBackup(JSON.stringify(file))).toThrow(
      'run 1 of 1 in "runs" (id "run-all") has "durationMinutes" as the text "thirty", not a number.'
    );

    const nested = JSON.parse(versionTwoFile(everyTableRow()));
    nested.tables.workouts[0].sets[0].weight = null;
    expect(() => parseBackup(JSON.stringify(nested))).toThrow(
      'set 1 of 1 of workout 1 of 1 in "workouts" (id "w-all") has no "weight".'
    );

    const profile = JSON.parse(versionTwoFile(everyTableRow()));
    profile.tables.userProfile[0].settings = "default";
    expect(() => parseBackup(JSON.stringify(profile))).toThrow(
      'profile 1 of 1 in "userProfile" (id "p-all") has "settings" as the text "default", not a group of values.'
    );
  });

  it("refuses a row that is not a record at all", () => {
    const file = JSON.parse(versionTwoFile(everyTableRow()));
    file.tables.coachEvents.push(42);
    expect(() => parseBackup(JSON.stringify(file))).toThrow(
      'change-log entry 2 of 2 in "coachEvents" is damaged: it is the number 42, not a group of values.'
    );
  });

  it("a version 2 file with one row of every table, each built to its type, restores whole", async () => {
    const tables = everyTableRow();
    const backup = parseBackup(versionTwoFile(tables));
    await importBackup(backup);

    expect(await db.activities.count()).toBe(1);
    expect(await db.healthDaily.count()).toBe(1);
    expect(await db.favoriteWorkouts.count()).toBe(1);
    expect(await db.forecasts.count()).toBe(1);
    expect(await db.coachEvents.count()).toBe(1);
    expect(await db.importedSessions.count()).toBe(1);
    expect((await db.workouts.get("w-all"))!.sets[0].completedAt).toBeInstanceOf(Date);
    expect((await db.runs.get("run-all"))!.perceivedEffort).toBeNull();
  });

  it("a version 2 file needs every row's clientId; a version 1 file gives a missing one the row's id", () => {
    const file = JSON.parse(versionTwoFile(everyTableRow()));
    delete file.tables.painEntries[0].clientId;
    expect(() => parseBackup(JSON.stringify(file))).toThrow(
      'pain entry 1 of 1 in "painEntries" (id "pain-all") has no "clientId".'
    );

    const v1 = parseBackup(JSON.stringify(versionOneFile()));
    expect(v1.tables.painEntries[0].clientId).toBe("pain1");
    expect(v1.tables.readinessLogs[0].clientId).toBe("rd1");
    expect(v1.tables.userProfile[0].clientId).toBe("p1");
    expect(v1.tables.workouts[0].clientId).toBe("c-w1");
  });

  it("a version 1 file is checked too", () => {
    const v1 = versionOneFile();
    (v1.bodyweight[0] as Record<string, unknown>).weight = "heavy";
    expect(() => parseBackup(JSON.stringify(v1))).toThrow(
      'weigh-in 1 of 1 in "bodyweight" (id "bw1") has "weight" as the text "heavy", not a number.'
    );
  });
});

describe("parseBackup", () => {
  it("accepts a version 1 file, revives dates and ignores derived tables", () => {
    const backup = parseBackup(JSON.stringify(versionOneFile()));
    expect(backup.version).toBe(2);
    expect(backup.exportedAt).toBe("2026-05-01T10:00:00.000Z");
    expect(backup.tables.workouts[0].startedAt).toBeInstanceOf(Date);
    expect(backup.tables.workouts[0].sets[0].completedAt).toBeInstanceOf(Date);
    expect(backup.tables.liftAdjustments).toEqual([]);
    expect(backup.tables.activities).toEqual([]);
    expect(backup.tables).not.toHaveProperty("liftStates");
    expect(backup.tables).not.toHaveProperty("sets");
  });

  it("restores a whole version 1 file", async () => {
    await importBackup(parseBackup(JSON.stringify(versionOneFile())));
    expect(await db.workouts.count()).toBe(1);
    expect(await db.runs.count()).toBe(1);
    expect(await db.painEntries.get("pain1")).toMatchObject({ clientId: "pain1", synced: false });
    expect((await db.userProfile.toArray()).map((p) => p.id)).toEqual(["p1"]);
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
    expect((await db.liftStates.get("squat"))?.t1Weight).toBe(INITIAL_LIFT_STATES.squat.t1Weight);
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
    ).toThrow(/workout 1 of 1 in "workouts" has no "id"/);
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
