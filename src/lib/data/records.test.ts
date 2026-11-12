import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import {
  clearAllData,
  deletePainEntry,
  logBodyweight,
  logRun,
  logActivity,
  savePainEntry,
  updateBodyweight,
  updatePainEntry,
  updateProfile,
  updateSettings,
} from "./records";
import { clearDb, makeE1RM, makeLiftState, makeProfile, makeSet, makeWorkout } from "./testUtils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(clearDb);

describe("updateSettings", () => {
  it("merges the patch into the profile's settings and marks it unsynced", async () => {
    const profile = makeProfile({ synced: true });
    await db.userProfile.put(profile);

    await updateSettings({ showWarmUps: false, defaultLocation: "home" });

    const after = await db.userProfile.get(profile.id);
    expect(after!.settings).toEqual({
      ...profile.settings,
      showWarmUps: false,
      defaultLocation: "home",
    });
    expect(after!.synced).toBe(false);
    expect(after!.name).toBe(profile.name);
  });

  it("rejects clearly when there is no profile", async () => {
    await expect(updateSettings({ showRPE: false })).rejects.toThrow(/no user profile/i);
  });
});

describe("updateProfile", () => {
  it("merges the patch into the profile and marks it unsynced", async () => {
    const profile = makeProfile({ synced: true });
    await db.userProfile.put(profile);

    await updateProfile({ bodyweight: 220, name: "M" });

    const after = await db.userProfile.get(profile.id);
    expect(after).toEqual({ ...profile, bodyweight: 220, name: "M", synced: false });
  });

  it("rejects clearly when there is no profile", async () => {
    await expect(updateProfile({ bodyweight: 200 })).rejects.toThrow(/no user profile/i);
  });
});

describe("bodyweight", () => {
  it("logBodyweight adds an entry with id === clientId, unsynced, and returns the id", async () => {
    const date = new Date("2026-11-10T00:00:00");
    const id = await logBodyweight({ date, weight: 224.5, timeOfDay: "morning" });
    expect(id).toMatch(UUID);
    expect(await db.bodyweight.get(id)).toEqual({
      id,
      clientId: id,
      date,
      weight: 224.5,
      timeOfDay: "morning",
      synced: false,
    });
  });

  it("updateBodyweight patches the entry and marks it unsynced", async () => {
    const id = await logBodyweight({ date: new Date(), weight: 224, timeOfDay: "morning" });
    await db.bodyweight.update(id, { synced: true });
    await updateBodyweight(id, { weight: 223, timeOfDay: "evening" });
    expect(await db.bodyweight.get(id)).toMatchObject({
      weight: 223,
      timeOfDay: "evening",
      synced: false,
    });
  });
});

describe("pain entries", () => {
  const base = {
    date: new Date("2026-11-10T08:00:00Z"),
    region: "lower_back" as const,
    sensation: "pain" as const,
    severity: 3 as const,
  };

  it("savePainEntry adds a new entry with fresh ids and returns the id", async () => {
    const id = await savePainEntry({ ...base, notes: "twinge" });
    expect(id).toMatch(UUID);
    const row = await db.painEntries.get(id);
    expect(row).toMatchObject({ ...base, notes: "twinge", synced: false });
    expect(row!.clientId).toMatch(UUID);
  });

  it("savePainEntry with an id replaces that entry and keeps its clientId", async () => {
    const id = await savePainEntry(base);
    const clientId = (await db.painEntries.get(id))!.clientId;

    const again = await savePainEntry({ ...base, id, severity: 5 });
    expect(again).toBe(id);
    expect(await db.painEntries.count()).toBe(1);
    expect(await db.painEntries.get(id)).toMatchObject({ severity: 5, clientId, synced: false });
  });

  it("savePainEntry with an unknown id creates it under that id", async () => {
    const id = await savePainEntry({ ...base, id: "given-id" });
    expect(id).toBe("given-id");
    expect((await db.painEntries.get("given-id"))!.clientId).toMatch(UUID);
  });

  it("updatePainEntry patches the entry and marks it unsynced", async () => {
    const id = await savePainEntry(base);
    await db.painEntries.update(id, { synced: true });
    const now = new Date("2026-11-11T08:00:00Z");
    await updatePainEntry(id, { date: now });
    expect(await db.painEntries.get(id)).toMatchObject({ date: now, synced: false });
  });

  it("deletePainEntry removes the entry", async () => {
    const id = await savePainEntry(base);
    await deletePainEntry(id);
    expect(await db.painEntries.count()).toBe(0);
  });
});

describe("logRun", () => {
  it("adds a run with id === clientId, unsynced, and returns the id", async () => {
    const run = {
      date: new Date(),
      durationMinutes: 30,
      distanceMiles: 3.1,
      type: "outdoor" as const,
      category: "easy" as const,
      notes: "",
      perceivedEffort: 3 as const,
    };
    const id = await logRun(run);
    expect(id).toMatch(UUID);
    expect(await db.runs.get(id)).toEqual({ ...run, id, clientId: id, synced: false });
  });
});

describe("logActivity", () => {
  it("adds an activity with id === clientId, unsynced, and returns the id", async () => {
    const activity = {
      date: new Date(),
      kind: "yoga" as const,
      durationMinutes: 45,
      style: "flow" as const,
      distanceMiles: null,
      notes: "",
      perceivedEffort: 2 as const,
    };
    const id = await logActivity(activity);
    expect(id).toMatch(UUID);
    expect(await db.activities.get(id)).toEqual({ ...activity, id, clientId: id, synced: false });
    expect(await db.runs.count()).toBe(0);
  });
});

describe("clearAllData", () => {
  it("empties all ten tables and does not re-seed", async () => {
    await db.workouts.put(makeWorkout());
    await db.sets.put(makeSet());
    await db.runs.put({
      id: "r", clientId: "r", date: new Date(), durationMinutes: 1, distanceMiles: null,
      type: "outdoor", category: "easy", notes: "", perceivedEffort: 1, synced: false,
    });
    await db.activities.put({
      id: "a", clientId: "a", date: new Date(), kind: "yoga", durationMinutes: 1, style: null,
      distanceMiles: null, notes: "", perceivedEffort: 1, synced: false,
    });
    await db.bodyweight.put({ id: "b", clientId: "b", date: new Date(), weight: 200, timeOfDay: "morning", synced: false });
    await savePainEntry({ date: new Date(), region: "neck", sensation: "soreness", severity: 1 });
    await db.estimated1RMs.put(makeE1RM());
    await db.liftStates.put(makeLiftState());
    await db.userProfile.put(makeProfile());
    await db.readinessLogs.put({
      id: "rl", clientId: "rl", sessionId: "x", sleepHours: "7+", stressLevel: "low",
      date: new Date(), synced: false,
    });

    await clearAllData();

    expect(db.tables).toHaveLength(10);
    for (const table of db.tables) {
      expect(await table.count()).toBe(0);
    }
  });
});
