import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { e1rmRowId } from "@/lib/rebuild";
import type { LiftState, WorkoutSession } from "@/types";
import { checkDerived } from "./derived";
import {
  commitLogChange,
  listDeleted,
  restore,
  softDelete,
  updateActivity,
  updateRun,
} from "./logEdits";
import { logActivity, logBodyweight, logRun, savePainEntry } from "./records";
import { clearDb, makeSet, runSession } from "./testUtils";
import { startWorkout } from "./workouts";

const DAY = 24 * 60 * 60 * 1000;
const FIRST = new Date("2026-03-02T09:00:00Z").getTime();
const setNow = (date: Date) => {
  vi.setSystemTime(date);
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
  await clearDb();
  await initializeDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

const liftState = async (id: string): Promise<LiftState> => (await db.liftStates.get(id))!;
const workout = async (id: string): Promise<WorkoutSession> => (await db.workouts.get(id))!;
const derived = async () => ({
  liftStates: await db.liftStates.toArray(),
  e1rms: await db.estimated1RMs.toArray(),
});
const amrapOf = (w: WorkoutSession) => w.sets.find((s) => s.tier === "T1" && s.isAMRAP)!;

/** A1, B1, A1: squat is T1 in the first and the third session. */
async function threeSessions() {
  const first = await runSession({ templateId: "A1", startedAt: new Date(FIRST) }, setNow);
  const middle = await runSession({ templateId: "B1", startedAt: new Date(FIRST + 2 * DAY) }, setNow);
  const latest = await runSession({ templateId: "A1", startedAt: new Date(FIRST + 4 * DAY) }, setNow);
  setNow(new Date(FIRST + 5 * DAY));
  return { first: first.workoutId, middle: middle.workoutId, latest: latest.workoutId };
}

describe("commitLogChange: sets (E5)", () => {
  it("editing a set of the latest session flips the next prescription", async () => {
    const { latest } = await threeSessions();
    expect(await liftState("squat")).toMatchObject({ t1Weight: 210, t1Stage: "5x3" });
    const row = await workout(latest);
    const set = amrapOf(row);

    const diff = await commitLogChange({
      kind: "editSet",
      workoutId: latest,
      setId: set.id,
      patch: { actualReps: 2 },
    });

    // The latest squat day was at 200: missing the last set moves the stage, not the weight.
    expect(await liftState("squat")).toMatchObject({ t1Weight: 200, t1Stage: "6x2" });
    expect(diff.consistent).toBe(false);
    expect(diff.liftStatesToPut.map((s) => s.exerciseId)).toEqual(["squat"]);

    const after = await workout(latest);
    expect(after.sets.find((s) => s.id === set.id)).toMatchObject({ actualReps: 2, status: "failed" });
    expect(after.updatedAt).toBeGreaterThan(row.updatedAt!);
    expect(after.synced).toBe(false);
    // 200 x 2 -> round(200 * (1 + 2 / 30)) = 213, in place of the row for 3 reps.
    expect((await db.estimated1RMs.get(e1rmRowId(latest, set.id)))!.estimated1RM).toBe(213);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("editing a set of an older session changes history only", async () => {
    const { first, middle, latest } = await threeSessions();
    const untouched = [await workout(middle), await workout(latest)];
    const set = amrapOf(await workout(first));

    await commitLogChange({
      kind: "editSet",
      workoutId: first,
      setId: set.id,
      patch: { actualReps: 2, rpe: 9 },
    });

    // The later squat day was lifted at 200 and passed: the next prescription stands.
    const squat = await liftState("squat");
    expect(squat).toMatchObject({ t1Weight: 210, t1Stage: "5x3" });
    // History did change: the first session's AMRAP reps and its e1RM.
    expect(squat.recentAMRAPReps).toEqual([2, 3]);
    expect((await db.estimated1RMs.get(e1rmRowId(first, set.id)))!.repsCompleted).toBe(2);
    // Only the edited workout row was written.
    expect([await workout(middle), await workout(latest)]).toEqual(untouched);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("deleteSet removes the set and its e1RM row; addSet puts an equivalent one back", async () => {
    const { latest } = await threeSessions();
    const before = await derived();
    const set = amrapOf(await workout(latest));

    await commitLogChange({ kind: "deleteSet", workoutId: latest, setId: set.id });
    expect((await workout(latest)).sets.some((s) => s.id === set.id)).toBe(false);
    expect(await db.estimated1RMs.get(e1rmRowId(latest, set.id))).toBeUndefined();
    // Four of five sets is a partial session: no pass, the weight stays at 200.
    expect(await liftState("squat")).toMatchObject({ t1Weight: 200, t1Stage: "5x3" });

    await commitLogChange({ kind: "addSet", workoutId: latest, set });
    expect((await workout(latest)).sets.map((s) => s.id)).toContain(set.id);
    expect(await derived()).toEqual(before);
  });

  it("rejects and writes nothing for a set that does not exist", async () => {
    const { latest } = await threeSessions();
    const before = { row: await workout(latest), ...(await derived()) };
    await expect(
      commitLogChange({ kind: "editSet", workoutId: latest, setId: "nope", patch: { actualReps: 1 } })
    ).rejects.toThrow(/Set not found/);
    await expect(
      commitLogChange({ kind: "deleteWorkout", workoutId: "nope" })
    ).rejects.toThrow(/Workout not found/);
    expect({ row: await workout(latest), ...(await derived()) }).toEqual(before);
  });

  it("works on a workout in progress: its e1RM rows follow the edit", async () => {
    const id = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    await commitLogChange({
      kind: "addSet",
      workoutId: id,
      set: makeSet({ id: "s1", isAMRAP: true, actualReps: 4 }),
    });
    expect((await db.estimated1RMs.toArray()).map((e) => e.repsCompleted)).toEqual([4]);
    await commitLogChange({ kind: "editSet", workoutId: id, setId: "s1", patch: { actualReps: 6 } });
    expect((await db.estimated1RMs.toArray()).map((e) => e.repsCompleted)).toEqual([6]);
  });
});

describe("commitLogChange: the workout itself (E5)", () => {
  it("editWorkout moves the date of the session, its sets and everything derived from it", async () => {
    const { latest } = await threeSessions();
    const before = await workout(latest);
    const set = amrapOf(before);
    const completedAt = new Date(before.completedAt!.getTime() + 6 * 60 * 60 * 1000);

    await commitLogChange({ kind: "editWorkout", workoutId: latest, patch: { completedAt } });

    const after = await workout(latest);
    const shift = 6 * 60 * 60 * 1000;
    expect(after.completedAt).toEqual(completedAt);
    expect(after.startedAt.getTime()).toBe(before.startedAt.getTime() + shift);
    expect(after.sets.map((s) => s.completedAt.getTime())).toEqual(
      before.sets.map((s) => s.completedAt.getTime() + shift)
    );
    expect((await liftState("squat")).t1LastWorkoutDate).toEqual(completedAt);
    expect((await db.estimated1RMs.get(e1rmRowId(latest, set.id)))!.date.getTime()).toBe(
      set.completedAt.getTime() + shift
    );
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("editWorkout changes the location of the session and its sets", async () => {
    const { latest } = await threeSessions();
    await commitLogChange({ kind: "editWorkout", workoutId: latest, patch: { location: "home" } });
    const after = await workout(latest);
    expect(after.location).toBe("home");
    expect(after.sets.every((s) => s.location === "home")).toBe(true);
    // At home a pass moves by the dumbbell rule, never by more than at the gym.
    expect((await liftState("squat")).t1Weight).toBeLessThanOrEqual(210);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("deleteWorkout removes its e1RM rows and its effect; restoreWorkout brings back deep-equal rows", async () => {
    const { latest } = await threeSessions();
    const before = await derived();
    const set = amrapOf(await workout(latest));
    expect(before.e1rms.some((e) => e.workoutSessionId === latest)).toBe(true);

    const deleted = await commitLogChange({ kind: "deleteWorkout", workoutId: latest });
    expect(deleted.e1rmIdsToDelete).toEqual([e1rmRowId(latest, set.id)]);
    expect((await db.estimated1RMs.toArray()).some((e) => e.workoutSessionId === latest)).toBe(false);
    expect(await liftState("squat")).toMatchObject({ t1Weight: 200, recentAMRAPReps: [3] });
    expect((await workout(latest)).deletedAt).toBe(Date.now());
    expect((await workout(latest)).sets).toHaveLength(11);

    await commitLogChange({ kind: "restoreWorkout", workoutId: latest });
    expect((await workout(latest)).deletedAt).toBeNull();
    expect(await derived()).toEqual(before);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("adjustLift stores the adjustment, stamped, and applies it", async () => {
    await threeSessions();
    await commitLogChange({
      kind: "adjustLift",
      adjustment: {
        id: "adj-1", clientId: "adj-1", exerciseId: "squat", at: new Date(), source: "manual",
        set: { t1Weight: 185 }, synced: true,
      },
    });
    expect(await db.liftAdjustments.get("adj-1")).toMatchObject({
      set: { t1Weight: 185 },
      updatedAt: Date.now(),
      deletedAt: null,
      synced: false,
    });
    expect((await liftState("squat")).t1Weight).toBe(185);
  });
});

describe("softDelete and restore", () => {
  it("a workout takes its readiness log with it, both ways, and rebuilds", async () => {
    await runSession({ templateId: "A1", startedAt: new Date(FIRST) }, setNow);
    setNow(new Date(FIRST + 2 * DAY));
    const id = await startWorkout({
      templateId: "B1", location: "gym", includeWarmUps: false, selectedAccessories: [],
      readiness: { sleepHours: "7+", stressLevel: "good" },
    });
    await commitLogChange({
      kind: "addSet",
      workoutId: id,
      set: makeSet({ id: "ohp-amrap", exerciseId: "ohp", isAMRAP: true, actualReps: 4, weight: 85 }),
    });
    const [log] = await db.readinessLogs.toArray();
    const before = await derived();
    setNow(new Date(FIRST + 3 * DAY));

    await softDelete("workouts", id);
    expect((await workout(id)).deletedAt).toBe(Date.now());
    expect(await db.readinessLogs.get(log.id)).toMatchObject({ deletedAt: Date.now(), synced: false });
    expect((await db.readinessLogs.get(log.id))!.updatedAt).toBeGreaterThan(log.updatedAt!);
    expect((await db.estimated1RMs.toArray()).some((e) => e.workoutSessionId === id)).toBe(false);

    await restore("workouts", id);
    expect((await workout(id)).deletedAt).toBeNull();
    expect(await db.readinessLogs.get(log.id)).toMatchObject({ deletedAt: null, synced: false });
    expect(await derived()).toEqual(before);
  });

  it("is safe for unknown ids and does not touch a row that is already in that state", async () => {
    for (const table of ["workouts", "runs", "activities", "bodyweight", "painEntries"] as const) {
      await expect(softDelete(table, "nope")).resolves.toBeUndefined();
      await expect(restore(table, "nope")).resolves.toBeUndefined();
    }
    const id = await logBodyweight({ date: new Date(), weight: 200, timeOfDay: "morning" });
    const row = await db.bodyweight.get(id);
    await restore("bodyweight", id);
    expect(await db.bodyweight.get(id)).toEqual(row);

    await softDelete("bodyweight", id);
    const deleted = await db.bodyweight.get(id);
    setNow(new Date(Date.now() + 1000));
    await softDelete("bodyweight", id);
    expect(await db.bodyweight.get(id)).toEqual(deleted);
  });
});

describe("runs, activities, weigh-ins and pain entries (E6)", () => {
  const run = {
    date: new Date("2026-02-20T07:00:00Z"), durationMinutes: 30, distanceMiles: 3.1,
    type: "outdoor" as const, category: "easy" as const, notes: "", perceivedEffort: 3 as const,
  };
  const activity = {
    date: new Date("2026-02-21T07:00:00Z"), kind: "yoga" as const, durationMinutes: 45,
    style: "power" as const, distanceMiles: null, notes: "", perceivedEffort: 2 as const,
  };

  it("updateRun and updateActivity patch the row, bump its stamp and mark it unsynced", async () => {
    const runId = await logRun(run);
    const activityId = await logActivity(activity);
    await db.runs.update(runId, { synced: true });
    await db.activities.update(activityId, { synced: true });
    const stamps = [(await db.runs.get(runId))!.updatedAt!, (await db.activities.get(activityId))!.updatedAt!];

    await updateRun(runId, { distanceMiles: 4, notes: "longer" });
    await updateActivity(activityId, { kind: "cycling", style: null, distanceMiles: 12 });

    const runRow = (await db.runs.get(runId))!;
    expect(runRow).toMatchObject({ ...run, distanceMiles: 4, notes: "longer", synced: false });
    expect(runRow.updatedAt).toBeGreaterThan(stamps[0]);
    const activityRow = (await db.activities.get(activityId))!;
    expect(activityRow).toMatchObject({ kind: "cycling", style: null, distanceMiles: 12, synced: false });
    expect(activityRow.updatedAt).toBeGreaterThan(stamps[1]);
  });

  it("updateRun and updateActivity reject for a row that does not exist", async () => {
    await expect(updateRun("nope", { notes: "x" })).rejects.toThrow(/no row with id nope/);
    await expect(updateActivity("nope", { notes: "x" })).rejects.toThrow(/no row with id nope/);
    expect(await db.runs.count()).toBe(0);
  });

  it("softDelete then restore returns each row to what it was, apart from its stamps", async () => {
    const ids = {
      runs: await logRun(run),
      activities: await logActivity(activity),
      bodyweight: await logBodyweight({ date: new Date("2026-02-22"), weight: 201.4, timeOfDay: "morning" }),
      painEntries: await savePainEntry({ date: new Date("2026-02-23"), region: "lower_back", sensation: "pain", severity: 3 }),
    };
    for (const [table, id] of Object.entries(ids) as ["runs" | "activities" | "bodyweight" | "painEntries", string][]) {
      const before = (await db.table(table).get(id))!;

      await softDelete(table, id);
      const deleted = (await db.table(table).get(id))!;
      expect(deleted.deletedAt, table).toBe(Date.now());
      expect(deleted.updatedAt, table).toBeGreaterThan(before.updatedAt);
      expect(deleted.synced, table).toBe(false);

      await db.table(table).update(id, { synced: true });
      await restore(table, id);
      const restored = (await db.table(table).get(id))!;
      expect(restored, table).toEqual({ ...before, updatedAt: restored.updatedAt });
      expect(restored.updatedAt, table).toBeGreaterThan(deleted.updatedAt);
    }
  });
});

describe("listDeleted", () => {
  it("lists deleted rows of every table newest delete first, with readable labels", async () => {
    const { workoutId, completedAt } = await runSession(
      { templateId: "A1", startedAt: new Date(FIRST) },
      setNow
    );
    const runDate = new Date(FIRST + 1 * DAY);
    const runId = await logRun({
      date: runDate, durationMinutes: 30, distanceMiles: 3.1, type: "outdoor", category: "easy",
      notes: "", perceivedEffort: 3,
    });
    const treadmillId = await logRun({
      date: runDate, durationMinutes: 25, distanceMiles: null, type: "treadmill", category: "easy",
      notes: "", perceivedEffort: 3,
    });
    const yogaId = await logActivity({
      date: runDate, kind: "yoga", durationMinutes: 45, style: "power", distanceMiles: null,
      notes: "", perceivedEffort: 2,
    });
    const weighInId = await logBodyweight({ date: runDate, weight: 201.4, timeOfDay: "morning" });
    const painId = await savePainEntry({ date: runDate, region: "lower_back", sensation: "soreness", severity: 2 });
    await logBodyweight({ date: runDate, weight: 200, timeOfDay: "morning" }); // never deleted

    const order: [Parameters<typeof softDelete>[0], string][] = [
      ["bodyweight", weighInId],
      ["runs", runId],
      ["workouts", workoutId],
      ["painEntries", painId],
      ["activities", yogaId],
      ["runs", treadmillId],
    ];
    const start = FIRST + 3 * DAY;
    for (const [i, [table, id]] of order.entries()) {
      setNow(new Date(start + i * 60_000));
      await softDelete(table, id);
    }

    expect(await listDeleted()).toEqual([
      { table: "runs", id: treadmillId, deletedAt: start + 5 * 60_000, date: runDate, label: "Run, 25 min" },
      { table: "activities", id: yogaId, deletedAt: start + 4 * 60_000, date: runDate, label: "Power yoga, 45 min" },
      { table: "painEntries", id: painId, deletedAt: start + 3 * 60_000, date: runDate, label: "Lower Back soreness" },
      { table: "workouts", id: workoutId, deletedAt: start + 2 * 60_000, date: completedAt, label: "Workout A1" },
      { table: "runs", id: runId, deletedAt: start + 60_000, date: runDate, label: "Run, 3.1 mi" },
      { table: "bodyweight", id: weighInId, deletedAt: start, date: runDate, label: "Weigh-in 201.4 lbs" },
    ]);
  });

  it("keeps only the last 30 days by default, or the window it is given", async () => {
    const oldId = await logBodyweight({ date: new Date(), weight: 200, timeOfDay: "morning" });
    const edgeId = await logBodyweight({ date: new Date(), weight: 201, timeOfDay: "morning" });
    const newId = await logBodyweight({ date: new Date(), weight: 202, timeOfDay: "morning" });
    const now = FIRST + 100 * DAY;
    setNow(new Date(now - 30 * DAY - 1));
    await softDelete("bodyweight", oldId);
    setNow(new Date(now - 30 * DAY));
    await softDelete("bodyweight", edgeId);
    setNow(new Date(now - DAY));
    await softDelete("bodyweight", newId);
    setNow(new Date(now));

    expect((await listDeleted()).map((item) => item.id)).toEqual([newId, edgeId]);
    expect((await listDeleted(2 * DAY)).map((item) => item.id)).toEqual([newId]);
    expect((await listDeleted(2 * DAY, now + 5 * DAY)).map((item) => item.id)).toEqual([]);

    await restore("bodyweight", newId);
    expect((await listDeleted()).map((item) => item.id)).toEqual([edgeId]);
  });

  it("does not list a workout that was discarded before it was finished", async () => {
    const id = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    await softDelete("workouts", id);
    expect(await listDeleted()).toEqual([]);
  });
});
