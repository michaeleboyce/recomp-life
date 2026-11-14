import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { INITIAL_LIFT_STATES } from "@/db/seed";
import { calculateE1RM, isE1RMEligibleSet, toRecentE1RMSeries } from "@/lib/e1rm";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { computeCompletion } from "@/lib/workout/completeWorkout";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState } from "@/types";
import { applyRebuild, checkDerived, loadRebuildInput, readSettings, rebuildTables } from "./derived";
import { updateSettings } from "./records";
import { clearDb, runSession, type ScriptedSession } from "./testUtils";

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

/** Eight sessions over three weeks: passes, a T1 fail, a short T2, RPE, a home day. */
const SCRIPT: Omit<ScriptedSession, "startedAt">[] = [
  { templateId: "A1" },
  { templateId: "B1", rpe: 8 },
  { templateId: "A2", lastReps: { T1: 1 } },
  { templateId: "B2", lastReps: { T3: 26 } },
  { templateId: "A1", location: "home" },
  { templateId: "B1", setsLogged: { T2: 1 } },
  { templateId: "A2", lastReps: { T1: 5 }, rpe: 9 },
  { templateId: "B2", lastReps: { T2: 4 } },
];

const asStored = (states: LiftState[]) =>
  states
    .map((s) => ({ ...s, clientId: s.exerciseId, synced: true }))
    .sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1));

describe("finish equals rebuild (E2)", () => {
  it("stores the same lift states as a direct chain of computeCompletion calls", async () => {
    const settings = await readSettings();
    let expected = await db.liftStates.toArray();
    const e1rmLog: { exerciseId: string; date: Date; estimated1RM: number }[] = [];

    for (const [i, step] of SCRIPT.entries()) {
      const startedAt = new Date(FIRST + i * 2 * DAY);
      const { workoutId } = await runSession({ ...step, startedAt }, setNow);
      const session = (await db.workouts.get(workoutId))!;

      // The chain: the same pure functions the screen used before the rebuild existed.
      const template = WORKOUT_TEMPLATES[step.templateId];
      const plan = buildWorkoutPlan({
        template,
        liftStates: expected,
        location: session.location,
        equipment: settings.equipment,
        includeWarmUps: false,
        selectedAccessories: [],
      });
      for (const set of session.sets) {
        if (set.isSubstituted || !isE1RMEligibleSet(set.tier, set.isAMRAP, set.actualReps)) continue;
        const estimated1RM = calculateE1RM(set.weight, set.actualReps, set.rpe);
        if (estimated1RM) e1rmLog.push({ exerciseId: set.exerciseId, date: set.completedAt, estimated1RM });
      }
      const recentE1RMsByExercise: Record<string, number[]> = {};
      for (const ex of template.exercises) {
        if (ex.tier !== "T1" && ex.tier !== "T2") continue;
        recentE1RMsByExercise[ex.exerciseId] = toRecentE1RMSeries(
          e1rmLog.filter((row) => row.exerciseId === ex.exerciseId)
        );
      }
      const { liftStateUpdates } = computeCompletion({
        session,
        plan,
        sets: session.sets,
        liftStates: expected,
        settings,
        recentE1RMsByExercise,
        currentExerciseIndex: plan.length,
        workoutStartTime: session.startedAt,
        now: session.completedAt!,
      });
      expected = expected.map(
        (state) => liftStateUpdates.find((u) => u.exerciseId === state.exerciseId) ?? state
      );

      expect(await db.liftStates.toArray(), `after session ${i + 1}`).toEqual(asStored(expected));
      expect((await db.estimated1RMs.toArray()).map((r) => r.estimated1RM).sort()).toEqual(
        e1rmLog.map((r) => r.estimated1RM).sort()
      );
    }

    // The script really moved things: a fail, progress and a home day all happened.
    const final = Object.fromEntries(expected.map((s) => [s.exerciseId, s]));
    expect(final.squat.t1Weight).toBeGreaterThan(INITIAL_LIFT_STATES.squat.t1Weight);
    const failedLift = WORKOUT_TEMPLATES.A2.exercises.find((ex) => ex.tier === "T1")!.exerciseId;
    expect(final[failedLift].t1Stage).toBe("6x2");

    expect((await checkDerived()).consistent).toBe(true);
  });

  it("applyRebuild a second time writes nothing", async () => {
    for (const [i, step] of SCRIPT.slice(0, 3).entries()) {
      await runSession({ ...step, startedAt: new Date(FIRST + i * 2 * DAY) }, setNow);
    }
    // Force a real rewrite first, so the second call has something it could repeat.
    await db.liftStates.clear();
    await db.estimated1RMs.clear();
    const first = await applyRebuild();
    expect(first.consistent).toBe(false);
    expect(first.liftStatesToPut).toHaveLength(Object.keys(INITIAL_LIFT_STATES).length);
    expect(first.e1rmsToPut.length).toBeGreaterThan(0);

    const writes = [
      vi.spyOn(db.liftStates, "bulkPut"),
      vi.spyOn(db.liftStates, "bulkDelete"),
      vi.spyOn(db.estimated1RMs, "bulkPut"),
      vi.spyOn(db.estimated1RMs, "bulkDelete"),
    ];
    try {
      expect(await applyRebuild()).toEqual({
        liftStatesToPut: [],
        liftStateIdsToDelete: [],
        e1rmsToPut: [],
        e1rmIdsToDelete: [],
        consistent: true,
      });
      for (const spy of writes) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of writes) spy.mockRestore();
    }
  });
});

describe("applyRebuild and checkDerived", () => {
  it("checkDerived reports a corrupted lift state without writing; applyRebuild fixes exactly that row", async () => {
    await runSession({ templateId: "A1", startedAt: new Date(FIRST) }, setNow);
    const good = await db.liftStates.toArray();
    await db.liftStates.update("squat", { t1Weight: 999 });

    const report = await checkDerived();
    expect(report.consistent).toBe(false);
    expect(report.liftStatesToPut.map((s) => s.exerciseId)).toEqual(["squat"]);
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(999);

    const fixed = await applyRebuild();
    expect(fixed.liftStatesToPut.map((s) => s.exerciseId)).toEqual(["squat"]);
    expect(await db.liftStates.toArray()).toEqual(good);
    expect((await checkDerived()).consistent).toBe(true);
  });

  it("deletes derived rows the log no longer produces", async () => {
    await db.liftStates.put({ ...(await db.liftStates.get("squat"))!, exerciseId: "not_a_lift" });
    await db.estimated1RMs.put({
      id: "stray", clientId: "stray", date: new Date(), exerciseId: "squat", workingWeight: 1,
      repsCompleted: 2, estimated1RM: 1, workoutSessionId: "gone", synced: true,
    });

    const diff = await applyRebuild();
    expect(diff.liftStateIdsToDelete).toEqual(["not_a_lift"]);
    expect(diff.e1rmIdsToDelete).toEqual(["stray"]);
    expect(await db.liftStates.get("not_a_lift")).toBeUndefined();
    expect(await db.estimated1RMs.count()).toBe(0);
  });

  it("joins a caller's transaction: a failure after it rolls the rebuild back too", async () => {
    await db.liftStates.update("squat", { t1Weight: 999 });
    await expect(
      db.transaction("rw", rebuildTables(), async () => {
        const diff = await applyRebuild();
        expect(diff.liftStatesToPut).toHaveLength(1);
        expect((await db.liftStates.get("squat"))!.t1Weight).toBe(190);
        throw new Error("caller failed");
      })
    ).rejects.toThrow("caller failed");
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(999);
  });

  it("loadRebuildInput returns every workout and adjustment, deleted ones included, and the current settings", async () => {
    const { workoutId } = await runSession({ templateId: "A1", startedAt: new Date(FIRST) }, setNow);
    await db.workouts.update(workoutId, { deletedAt: 5 });
    await updateSettings({ trainingPhase: { mode: "bulking" } });

    const input = await loadRebuildInput();
    expect(input.workouts.map((w) => w.id)).toEqual([workoutId]);
    expect(input.adjustments).toHaveLength(Object.keys(INITIAL_LIFT_STATES).length);
    expect(input.settings.trainingPhase.mode).toBe("bulking");
  });
});

describe("a finished workout is a fact (E3)", () => {
  it("stores prescribed and completionContext, and a later change of phase or increments does not change its outcome", async () => {
    const { workoutId } = await runSession(
      { templateId: "A1", startedAt: new Date(FIRST), lastReps: { T3: 30 } },
      setNow
    );
    const row = (await db.workouts.get(workoutId))!;
    expect(row.prescribed).toEqual([
      { exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" },
      { exerciseId: "bench", tier: "T2", weight: 100, sets: 3, reps: 10, stage: "3x10" },
      { exerciseId: "lat_pulldown", tier: "T3", weight: 90, sets: 3, reps: 15 },
    ]);
    expect(row.completionContext).toEqual({
      phaseMode: "cutting",
      gymBarbellIncrementLbs: 5,
      dumbbellIncrementLbs: 5,
    });

    const before = await db.liftStates.toArray();
    const settings = await readSettings();
    await updateSettings({
      trainingPhase: { mode: "bulking" },
      equipment: { ...settings.equipment, gymBarbellIncrementLbs: 2.5, dumbbellIncrementLbs: 2.5 },
    });

    const diff = await applyRebuild();
    expect(diff.consistent).toBe(true);
    expect(await db.liftStates.toArray()).toEqual(before);

    // Without the stored context the same rebuild would have used the new settings.
    await db.workouts.update(workoutId, { completionContext: undefined });
    expect((await checkDerived()).consistent).toBe(false);
  });
});
