import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { recordAdjustment } from "./adjustments";
import { commitLogChange, restore, softDelete, updateActivity, updateRun } from "./logEdits";
import {
  deletePainEntry,
  logActivity,
  logBodyweight,
  logRun,
  savePainEntry,
  updateBodyweight,
  updatePainEntry,
  updateProfile,
  updateSettings,
} from "./records";
import { editStamps, newRowStamps, nextStamp } from "./stamp";
import { clearDb, makeSet } from "./testUtils";
import { appendSet, discardWorkout, finishWorkout, startWorkout } from "./workouts";

describe("nextStamp", () => {
  it("is now for a new row or an older stamp", () => {
    expect(nextStamp(undefined, 1000)).toBe(1000);
    expect(nextStamp(999, 1000)).toBe(1000);
  });

  it("is one past the previous stamp when the clock has not moved or went backwards", () => {
    expect(nextStamp(1000, 1000)).toBe(1001);
    expect(nextStamp(5000, 1000)).toBe(5001);
  });

  it("defaults to the current time", () => {
    const before = Date.now();
    expect(nextStamp()).toBeGreaterThanOrEqual(before);
  });

  it("newRowStamps and editStamps build the stamp fields", () => {
    expect(newRowStamps(1000)).toEqual({ updatedAt: 1000, deletedAt: null, synced: false });
    expect(editStamps({ updatedAt: 1000 }, 1000)).toEqual({ updatedAt: 1001, synced: false });
    expect(editStamps(undefined, 1000)).toEqual({ updatedAt: 1000, synced: false });
  });
});

describe("every writer stamps its row, even with a frozen clock", () => {
  const NOW = new Date("2026-03-01T08:00:00Z").getTime();

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await clearDb();
    await initializeDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  type Row = { updatedAt?: number; synced: boolean; deletedAt?: number | null };

  /**
   * Runs each write in turn on one row. Before every write the row is marked synced, so
   * the check proves the write itself cleared the flag; the stamp must move strictly up
   * although the clock never moves.
   */
  async function expectStamped(
    read: () => Promise<Row | undefined>,
    markSynced: () => Promise<unknown>,
    writes: [name: string, write: () => Promise<unknown>][]
  ) {
    let previous = (await read())!.updatedAt!;
    expect(previous).toBeGreaterThanOrEqual(NOW);
    expect((await read())!.synced).toBe(false);
    for (const [name, write] of writes) {
      await markSynced();
      await write();
      const row = (await read())!;
      expect(row.updatedAt, name).toBeGreaterThan(previous);
      expect(row.synced, name).toBe(false);
      previous = row.updatedAt!;
    }
    expect(previous).toBe(NOW + writes.length);
  }

  it("workouts: startWorkout, appendSet, commitLogChange, finishWorkout, discardWorkout, restore", async () => {
    const id = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    expect(await db.workouts.get(id)).toMatchObject({ updatedAt: NOW, deletedAt: null, synced: false });
    await expectStamped(
      () => db.workouts.get(id),
      () => db.workouts.update(id, { synced: true }),
      [
        ["appendSet", () => appendSet(id, makeSet({ id: "s1" }))],
        ["appendSet again", () => appendSet(id, makeSet({ id: "s1", actualReps: 2 }))],
        ["editSet", () => commitLogChange({ kind: "editSet", workoutId: id, setId: "s1", patch: { actualReps: 3 } })],
        ["addSet", () => commitLogChange({ kind: "addSet", workoutId: id, set: makeSet({ id: "s2" }) })],
        ["deleteSet", () => commitLogChange({ kind: "deleteSet", workoutId: id, setId: "s2" })],
        ["finishWorkout", () => finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 1, endedEarly: true })],
        ["editWorkout", () => commitLogChange({ kind: "editWorkout", workoutId: id, patch: { location: "home" } })],
        ["discardWorkout", () => discardWorkout(id)],
        ["restore", () => restore("workouts", id)],
        ["deleteWorkout", () => commitLogChange({ kind: "deleteWorkout", workoutId: id })],
        ["restoreWorkout", () => commitLogChange({ kind: "restoreWorkout", workoutId: id })],
      ]
    );
  });

  it("readiness logs follow their workout", async () => {
    const id = await startWorkout({
      templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [],
      readiness: { sleepHours: "7+", stressLevel: "good" },
    });
    const logId = (await db.readinessLogs.toArray())[0].id;
    expect(await db.readinessLogs.get(logId)).toMatchObject({ updatedAt: NOW, deletedAt: null, synced: false });
    await expectStamped(
      () => db.readinessLogs.get(logId),
      () => db.readinessLogs.update(logId, { synced: true }),
      [
        ["softDelete", () => softDelete("workouts", id)],
        ["restore", () => restore("workouts", id)],
      ]
    );
  });

  it("runs and activities", async () => {
    const runId = await logRun({
      date: new Date(), durationMinutes: 30, distanceMiles: 3, type: "outdoor", category: "easy",
      notes: "", perceivedEffort: 3,
    });
    expect(await db.runs.get(runId)).toMatchObject({ updatedAt: NOW, deletedAt: null, synced: false });
    await expectStamped(
      () => db.runs.get(runId),
      () => db.runs.update(runId, { synced: true }),
      [
        ["updateRun", () => updateRun(runId, { notes: "a" })],
        ["softDelete", () => softDelete("runs", runId)],
        ["restore", () => restore("runs", runId)],
      ]
    );

    const activityId = await logActivity({
      date: new Date(), kind: "hiking", durationMinutes: 90, style: null, distanceMiles: 4,
      notes: "", perceivedEffort: 3,
    });
    expect(await db.activities.get(activityId)).toMatchObject({ updatedAt: NOW, deletedAt: null, synced: false });
    await expectStamped(
      () => db.activities.get(activityId),
      () => db.activities.update(activityId, { synced: true }),
      [
        ["updateActivity", () => updateActivity(activityId, { notes: "a" })],
        ["softDelete", () => softDelete("activities", activityId)],
        ["restore", () => restore("activities", activityId)],
      ]
    );
  });

  it("weigh-ins and pain entries", async () => {
    const weighInId = await logBodyweight({ date: new Date(), weight: 200, timeOfDay: "morning" });
    expect(await db.bodyweight.get(weighInId)).toMatchObject({ updatedAt: NOW, deletedAt: null, synced: false });
    await expectStamped(
      () => db.bodyweight.get(weighInId),
      () => db.bodyweight.update(weighInId, { synced: true }),
      [
        ["updateBodyweight", () => updateBodyweight(weighInId, { weight: 201 })],
        ["softDelete", () => softDelete("bodyweight", weighInId)],
        ["restore", () => restore("bodyweight", weighInId)],
      ]
    );

    const base = { date: new Date(), region: "neck" as const, sensation: "pain" as const, severity: 2 as const };
    const painId = await savePainEntry(base);
    expect(await db.painEntries.get(painId)).toMatchObject({ updatedAt: NOW, deletedAt: null, synced: false });
    await expectStamped(
      () => db.painEntries.get(painId),
      () => db.painEntries.update(painId, { synced: true }),
      [
        ["updatePainEntry", () => updatePainEntry(painId, { severity: 3 })],
        ["savePainEntry", () => savePainEntry({ ...base, id: painId, severity: 4 })],
        ["deletePainEntry", () => deletePainEntry(painId)],
        ["restore", () => restore("painEntries", painId)],
      ]
    );
  });

  it("the profile: updateSettings and updateProfile", async () => {
    const profile = (await db.userProfile.toCollection().first())!;
    // The seeded profile is older than any real write, so a default never wins a sync conflict.
    expect(profile).toMatchObject({ updatedAt: 1, deletedAt: null, synced: false });
    await updateSettings({ showRPE: false });
    await expectStamped(
      () => db.userProfile.get(profile.id),
      () => db.userProfile.update(profile.id, { synced: true }),
      [
        ["updateSettings", () => updateSettings({ showRPE: true })],
        ["updateProfile", () => updateProfile({ bodyweight: 220 })],
      ]
    );
  });

  it("lift adjustments: recordAdjustment and adjustLift", async () => {
    await recordAdjustment({ exerciseId: "squat", source: "manual", set: { t1Weight: 180 } });
    await commitLogChange({
      kind: "adjustLift",
      adjustment: {
        id: "adj", clientId: "adj", exerciseId: "squat", at: new Date(), source: "manual",
        set: { t1Weight: 175 }, updatedAt: NOW + 50, synced: true,
      },
    });
    const rows = (await db.liftAdjustments.toArray()).filter((a) => a.source === "manual");
    expect(rows.find((a) => a.id !== "adj")).toMatchObject({ updatedAt: NOW, deletedAt: null, synced: false });
    expect(rows.find((a) => a.id === "adj")).toMatchObject({ updatedAt: NOW + 51, deletedAt: null, synced: false });
  });
});
