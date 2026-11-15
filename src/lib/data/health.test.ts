import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import { createFakeHealthSource, type FakeHealthData } from "@/lib/health/fakeSource";
import { localDateKey } from "@/lib/health/daily";
import type { HealthWorkout } from "@/lib/health/types";
import { softDelete } from "./logEdits";
import { getSleepMinutes, runHealthImport } from "./health";
import { logRun, logActivity } from "./records";
import { clearDb, makeWorkout } from "./testUtils";

const NOW = new Date(2026, 10, 12, 20, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const ALL = ["bodyweight", "sleep", "workouts", "daily"] as const;

function workout(overrides: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    uuid: "W-1",
    sourceName: "Apple Watch",
    type: "running",
    rawType: "running",
    start: at(11, 7),
    end: at(11, 7, 30),
    durationSeconds: 1800,
    distanceMetres: 5000,
    indoor: false,
    activeEnergyKcal: 320,
    avgHeartRate: null,
    maxHeartRate: null,
    ...overrides,
  };
}

const run = (data: FakeHealthData, categories: readonly (typeof ALL)[number][] = ALL) =>
  runHealthImport(createFakeHealthSource(data), { categories, since: at(1, 0), now: NOW });

beforeEach(clearDb);

describe("runHealthImport: bodyweight", () => {
  const weights = [{ uuid: "A", sourceName: "Scale", date: at(12, 7), kilograms: 80 }];

  it("adds a weigh-in in pounds, marked as imported", async () => {
    const result = await run({ weights });
    expect(result.weighIns).toBe(1);
    expect(await db.bodyweight.get("hk:A")).toMatchObject({
      id: "hk:A",
      clientId: "hk:A",
      weight: 176.4,
      timeOfDay: "morning",
      source: "apple_health",
      sourceName: "Scale",
      externalId: "A",
      deletedAt: null,
      synced: false,
    });
  });

  it("adds nothing the second time", async () => {
    await run({ weights });
    const before = await db.bodyweight.get("hk:A");
    expect((await run({ weights })).weighIns).toBe(0);
    expect(await db.bodyweight.count()).toBe(1);
    expect((await db.bodyweight.get("hk:A"))?.updatedAt).toBe(before?.updatedAt);
  });

  it("does not bring back a weigh-in the user deleted", async () => {
    await run({ weights });
    await softDelete("bodyweight", "hk:A");
    expect((await run({ weights })).weighIns).toBe(0);
    expect((await db.bodyweight.get("hk:A"))?.deletedAt).not.toBeNull();
  });

  it("imports only the chosen categories", async () => {
    const result = await run({ weights, workouts: [workout()] }, ["workouts"]);
    expect(result).toMatchObject({ weighIns: 0, runs: 1 });
    expect(await db.bodyweight.count()).toBe(0);
  });
});

describe("runHealthImport: runs and activities", () => {
  it("adds a run with no effort rating", async () => {
    const result = await run({ workouts: [workout()] });
    expect(result).toMatchObject({ runs: 1, activities: 0, matched: 0 });
    expect(await db.runs.get("hk:W-1")).toMatchObject({
      date: at(11, 7),
      durationMinutes: 30,
      distanceMiles: 3.11,
      type: "outdoor",
      category: "other",
      perceivedEffort: null,
      source: "apple_health",
      sourceName: "Apple Watch",
      externalId: "W-1",
    });
  });

  it("adds other workouts as activities and is idempotent", async () => {
    const workouts = [
      workout({ uuid: "Y", type: "yoga", rawType: "yoga", distanceMetres: null }),
      workout({ uuid: "S", type: "other", rawType: "swimming", start: at(10, 7), end: at(10, 8) }),
    ];
    expect((await run({ workouts })).activities).toBe(2);
    expect((await db.activities.get("hk:S"))?.notes).toBe("Swimming");
    expect(await run({ workouts })).toMatchObject({ activities: 0, matched: 0 });
    expect(await db.activities.count()).toBe(2);
  });

  it("links a run already logged by hand, keeping its effort", async () => {
    const id = await logRun({
      date: at(11, 7, 10),
      durationMinutes: 31,
      distanceMiles: 3.1,
      type: "trail",
      category: "tempo",
      notes: "felt good",
      perceivedEffort: 4,
    });
    const result = await run({ workouts: [workout()] });
    expect(result).toMatchObject({ runs: 0, matched: 1 });
    expect(await db.runs.count()).toBe(1);
    expect(await db.runs.get(id)).toMatchObject({
      perceivedEffort: 4,
      category: "tempo",
      externalId: "W-1",
      sourceName: "Apple Watch",
      synced: false,
    });
    // The link is remembered: nothing changes on the next import.
    expect(await run({ workouts: [workout()] })).toMatchObject({ runs: 0, matched: 0 });
  });

  it("matches activities only within the same kind", async () => {
    await logActivity({
      date: at(11, 7),
      kind: "yoga",
      durationMinutes: 30,
      style: "flow",
      distanceMiles: null,
      notes: "",
      perceivedEffort: 2,
    });
    const ride = workout({ uuid: "C", type: "cycling", rawType: "cycling" });
    expect(await run({ workouts: [ride] })).toMatchObject({ activities: 1, matched: 0 });
  });

  it("leaves a hand-logged run the user deleted alone and does not re-add it", async () => {
    const id = await logRun({
      date: at(11, 7),
      durationMinutes: 30,
      distanceMiles: 3,
      type: "outdoor",
      category: "easy",
      notes: "",
      perceivedEffort: 2,
    });
    await softDelete("runs", id);
    expect(await run({ workouts: [workout()] })).toMatchObject({ runs: 0, matched: 0 });
    expect(await db.runs.count()).toBe(1);
    expect((await db.runs.get(id))?.externalId).toBeUndefined();
  });
});

describe("runHealthImport: lifting sessions", () => {
  const strength = workout({
    uuid: "ST",
    type: "strength",
    rawType: "traditionalStrengthTraining",
    start: at(12, 18),
    end: at(12, 19),
    durationSeconds: 3600,
    distanceMetres: null,
    avgHeartRate: 118,
    maxHeartRate: 156,
  });

  it("attaches the watch workout to the session and never imports it as an activity", async () => {
    await db.workouts.put(
      makeWorkout({ id: "s1", startedAt: at(12, 18, 2), completedAt: at(12, 18, 58) })
    );
    const result = await run({ workouts: [strength] });
    expect(result).toMatchObject({ sessions: 1, activities: 0, runs: 0 });
    expect((await db.workouts.get("s1"))?.health).toEqual({
      externalId: "ST",
      sourceName: "Apple Watch",
      avgHeartRate: 118,
      maxHeartRate: 156,
      activeEnergyKcal: 320,
      durationSeconds: 3600,
    });
    expect((await db.workouts.get("s1"))?.synced).toBe(false);
    expect((await run({ workouts: [strength] })).sessions).toBe(0);
  });

  it("leaves a session with no overlapping workout alone", async () => {
    await db.workouts.put(makeWorkout({ id: "s2", startedAt: at(10, 18), completedAt: at(10, 19) }));
    expect((await run({ workouts: [strength] })).sessions).toBe(0);
    expect((await db.workouts.get("s2"))?.health).toBeUndefined();
  });
});

describe("runHealthImport: daily values", () => {
  const sleep = [
    { uuid: "n1", sourceName: "Apple Watch", stage: "asleep" as const, start: at(11, 23), end: at(12, 6) },
  ];
  const daily = [
    { quantity: "steps" as const, day: "2026-11-12", value: 4000 },
    { quantity: "restingHr" as const, day: "2026-11-11", value: 52 },
  ];

  it("stores one row per day and exposes last night's sleep", async () => {
    expect((await run({ sleep, daily })).days).toBe(2);
    expect(await db.healthDaily.get("hd:2026-11-12")).toMatchObject({
      day: "2026-11-12",
      sleepMinutes: 420,
      steps: 4000,
      restingHr: null,
      synced: false,
    });
    expect(await getSleepMinutes(localDateKey(at(12, 9)))).toBe(420);
    expect(await getSleepMinutes("2026-11-01")).toBeNull();
  });

  it("writes only when a value changed", async () => {
    await run({ sleep, daily });
    expect((await run({ sleep, daily })).days).toBe(0);
    const more = [{ quantity: "steps" as const, day: "2026-11-12", value: 9120 }];
    expect((await run({ sleep, daily: more })).days).toBe(1);
    expect((await db.healthDaily.get("hd:2026-11-12"))?.steps).toBe(9120);
  });

  it("keeps earlier values when a category is switched off", async () => {
    await run({ sleep, daily });
    expect((await run({ sleep: [], daily }, ["daily"])).days).toBe(0);
    expect((await db.healthDaily.get("hd:2026-11-12"))?.sleepMinutes).toBe(420);
  });

  it("reads sleep that began the evening before the import window", async () => {
    const result = await runHealthImport(createFakeHealthSource({ sleep }), {
      categories: ["sleep"],
      since: at(12, 0),
      now: NOW,
    });
    expect(result.days).toBe(1);
  });
});
