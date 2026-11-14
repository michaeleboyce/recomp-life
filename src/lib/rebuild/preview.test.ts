// E4 (which edits reach the next workout) and E7 (the preview shown before saving).
import { describe, expect, it } from "vitest";
import { SETTINGS } from "@/lib/workout/testFixtures";
import type { SetLog, WorkoutSession } from "@/types";
import { applyChange, diffDerived, previewLogChange, rebuildDerived } from "./index";
import type { LogChange, RebuildInput } from "./index";
import { makeAdjustment, rebuildInput, runSession, startSim, stateOf } from "./testHelpers";

/** A1, B1, A2, B2, A1: squat is the T1 of the first and the last session. */
function fiveSessions(firstAmrapReps = 3) {
  const sim = startSim();
  runSession(sim, { t1: { lastReps: firstAmrapReps, rpe: 8 } });
  runSession(sim);
  runSession(sim);
  runSession(sim);
  runSession(sim, { t1: { rpe: 9 } });
  return { sim, input: rebuildInput(sim) };
}

function amrapOf(workout: WorkoutSession): SetLog {
  return workout.sets.find((s) => s.tier === "T1" && s.isAMRAP)!;
}

function editAmrap(workout: WorkoutSession, actualReps: number): LogChange {
  return { kind: "editSet", workoutId: workout.id, setId: amrapOf(workout).id, patch: { actualReps } };
}

function rebuildAfter(input: RebuildInput, change: LogChange) {
  return rebuildDerived({ ...input, ...applyChange(input, change) });
}

describe("which edits reach the next workout (E4)", () => {
  it("editing the latest session of a lift from pass to fail changes its next prescription", () => {
    const { sim, input } = fiveSessions();
    const before = stateOf(rebuildDerived(input).liftStates, "squat");
    expect(before).toMatchObject({ t1Weight: 210, t1Stage: "5x3" });

    const after = stateOf(rebuildAfter(input, editAmrap(sim.workouts[4], 2)).liftStates, "squat");
    expect(after).toMatchObject({ t1Weight: 200, t1Stage: "6x2", t1FailCount: 1 });
  });

  it("editing an older session changes history and windows, not the next weight or stage", () => {
    const { sim, input } = fiveSessions();
    const before = rebuildDerived(input);
    const after = rebuildAfter(input, editAmrap(sim.workouts[0], 2));

    const squatBefore = stateOf(before.liftStates, "squat");
    const squatAfter = stateOf(after.liftStates, "squat");
    for (const field of ["t1Weight", "t1Stage", "t1FailCount", "t2Weight", "t2Stage", "t2FailCount"] as const) {
      expect(squatAfter[field]).toBe(squatBefore[field]);
    }
    // Every other lift is untouched.
    expect(after.liftStates.filter((ls) => ls.exerciseId !== "squat")).toEqual(
      before.liftStates.filter((ls) => ls.exerciseId !== "squat")
    );

    // History did change: the first session's estimate and the recent windows.
    const rowId = `e1rm:w1:${amrapOf(sim.workouts[0]).id}`;
    const valueOf = (rows: typeof before.e1rms) => rows.find((r) => r.id === rowId)!.estimated1RM;
    expect(valueOf(after.e1rms)).toBeLessThan(valueOf(before.e1rms));
    expect(squatBefore.recentAMRAPReps).toEqual([3, 3]);
    expect(squatAfter.recentAMRAPReps).toEqual([2, 3]);
    expect(squatAfter.recentE1RMs[0]).toBe(valueOf(after.e1rms));
    expect(squatAfter.recentE1RMs).not.toEqual(squatBefore.recentE1RMs);

    // That session's own outcome is now a fail.
    expect(stateOf(after.snapshots.get("w1")!, "squat")).toMatchObject({ t1Stage: "6x2", t1FailCount: 1 });
  });

  it("delete then restore of a workout returns the same output", () => {
    const { input } = fiveSessions();
    const original = rebuildDerived(input);

    const deleted = applyChange(input, { kind: "deleteWorkout", workoutId: "w3" }, 1000);
    const without = rebuildDerived({ ...input, ...deleted });
    expect(without.snapshots.has("w3")).toBe(false);
    expect(without).not.toEqual(original);

    const restored = applyChange(deleted, { kind: "restoreWorkout", workoutId: "w3" }, 2000);
    const again = rebuildDerived({ ...input, ...restored });
    expect(again).toEqual(original);
    expect([...again.snapshots.entries()]).toEqual([...original.snapshots.entries()]);
    expect(diffDerived(again, original).consistent).toBe(true);
  });
});

describe("previewLogChange (E7)", () => {
  it("lists the next-workout change when the latest session is edited", () => {
    const { sim, input } = fiveSessions();
    const preview = previewLogChange(input, editAmrap(sim.workouts[4], 2));
    expect(preview.nextWorkout).toEqual([
      {
        exerciseId: "squat",
        tier: "T1",
        before: { weight: 210, stage: "5x3", sets: 5, reps: 3 },
        after: { weight: 200, stage: "6x2", sets: 6, reps: 2 },
      },
    ]);
    expect(preview.e1rmChanges).toBe(1);
    expect(preview.unaffected).toBe(false);
  });

  it("reports a PR that no longer stands, with nothing changing in the next workout", () => {
    // 190 x 8 in the first session is the best squat estimate.
    const { sim, input } = fiveSessions(8);
    const rows = rebuildDerived(input).e1rms.filter((r) => r.exerciseId === "squat");
    const best = Math.max(...rows.map((r) => r.estimated1RM));
    expect(rows[0].estimated1RM).toBe(best);

    const preview = previewLogChange(input, editAmrap(sim.workouts[0], 3));
    expect(preview.nextWorkout).toEqual([]);
    expect(preview.prChanges).toEqual([
      { exerciseId: "squat", before: best, after: rows[1].estimated1RM },
    ]);
    expect(preview.prChanges[0].after!).toBeLessThan(best);
    expect(preview.e1rmChanges).toBe(1);
    expect(preview.unaffected).toBe(false);
  });

  it("says nothing changes for an edit no derived number depends on", () => {
    const { sim, input } = fiveSessions();
    const t3 = sim.workouts[0].sets.find((s) => s.tier === "T3")!;
    expect(
      previewLogChange(input, {
        kind: "editSet",
        workoutId: "w1",
        setId: t3.id,
        patch: { rpe: 7 },
      })
    ).toEqual({ nextWorkout: [], prChanges: [], e1rmChanges: 0, unaffected: true });
  });

  it("counts removed rows and a PR that disappears when a workout is deleted", () => {
    const sim = startSim();
    runSession(sim, { templateId: "B1" }); // the only ohp estimate
    const preview = previewLogChange(rebuildInput(sim), { kind: "deleteWorkout", workoutId: "w1" });
    expect(preview.e1rmChanges).toBe(1);
    expect(preview.prChanges).toEqual([
      { exerciseId: "ohp", before: expect.any(Number), after: null },
    ]);
    expect(preview.nextWorkout.map((c) => [c.exerciseId, c.tier])).toEqual([
      ["deadlift", "T2"],
      ["ohp", "T1"],
    ]);
  });

  it("previews T2 and T3 changes from an adjustment", () => {
    const { input } = fiveSessions();
    const at = new Date("2027-01-01T00:00:00Z");
    const t3 = previewLogChange(input, {
      kind: "adjustLift",
      adjustment: makeAdjustment("lat_pulldown", { t3Weight: 120 }, at),
    });
    expect(t3.nextWorkout).toEqual([
      {
        exerciseId: "lat_pulldown",
        tier: "T3",
        before: { weight: 90, sets: 3, reps: 15 },
        after: { weight: 120, sets: 3, reps: 15 },
      },
    ]);
    expect(t3).toMatchObject({ prChanges: [], e1rmChanges: 0, unaffected: false });

    const t2 = previewLogChange(input, {
      kind: "adjustLift",
      adjustment: makeAdjustment("bench", { t2Stage: "3x6", t2FailCount: 2 }, at),
    });
    expect(t2.nextWorkout).toHaveLength(1);
    expect(t2.nextWorkout[0]).toMatchObject({
      exerciseId: "bench",
      tier: "T2",
      before: { stage: "3x10", sets: 3, reps: 10 },
      after: { stage: "3x6", sets: 3, reps: 6 },
    });
  });

  it("does not change the input", () => {
    const { sim, input } = fiveSessions();
    const frozen = JSON.stringify(input);
    previewLogChange(input, editAmrap(sim.workouts[4], 0));
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it("propagates unknown ids as errors", () => {
    expect(() =>
      previewLogChange(
        { workouts: [], adjustments: [], settings: SETTINGS },
        { kind: "deleteWorkout", workoutId: "nope" }
      )
    ).toThrow("Workout not found: nope");
  });
});

describe("diffDerived", () => {
  it("lists changed, missing and stale rows", () => {
    const { sim, input } = fiveSessions();
    const stored = rebuildDerived(input);
    const rebuilt = rebuildAfter(input, editAmrap(sim.workouts[4], 2));
    const changedRow = `e1rm:w5:${amrapOf(sim.workouts[4]).id}`;

    const diff = diffDerived(rebuilt, {
      liftStates: [...stored.liftStates.filter((ls) => ls.exerciseId !== "ohp"), {
        ...stateOf(stored.liftStates, "ohp"),
        exerciseId: "old_lift",
      }],
      e1rms: [...stored.e1rms, { ...stored.e1rms[0], id: "legacy-uuid" }],
    });
    expect(diff.liftStatesToPut.map((ls) => ls.exerciseId)).toEqual(["ohp", "squat"]);
    expect(diff.liftStateIdsToDelete).toEqual(["old_lift"]);
    expect(diff.e1rmsToPut.map((row) => row.id)).toEqual([changedRow]);
    expect(diff.e1rmIdsToDelete).toEqual(["legacy-uuid"]);
    expect(diff.consistent).toBe(false);
  });

  it("ignores `synced` and compares dates by time, whatever their stored form", () => {
    const { input } = fiveSessions();
    const rebuilt = rebuildDerived(input);
    const stored = JSON.parse(
      JSON.stringify({
        liftStates: rebuilt.liftStates.map((ls) => ({ ...ls, synced: false })),
        e1rms: rebuilt.e1rms.map((row) => ({ ...row, synced: false })),
      })
    );
    expect(typeof stored.e1rms[0].date).toBe("string");
    expect(diffDerived(rebuilt, stored)).toMatchObject({
      liftStatesToPut: [],
      e1rmsToPut: [],
      e1rmIdsToDelete: [],
      consistent: true,
    });

    stored.liftStates[0].t1LastWorkoutDate = "2020-01-01T00:00:00.000Z";
    stored.e1rms[0].date = "2020-01-01T00:00:00.000Z";
    const diff = diffDerived(rebuilt, stored);
    expect(diff.liftStatesToPut).toEqual([rebuilt.liftStates[0]]);
    expect(diff.e1rmsToPut).toEqual([rebuilt.e1rms[0]]);
    expect(diff.consistent).toBe(false);
  });

  it("puts everything into empty tables", () => {
    const { input } = fiveSessions();
    const rebuilt = rebuildDerived(input);
    const diff = diffDerived(rebuilt, { liftStates: [], e1rms: [] });
    expect(diff.liftStatesToPut).toEqual(rebuilt.liftStates);
    expect(diff.e1rmsToPut).toEqual(rebuilt.e1rms);
    expect(diff.consistent).toBe(false);
  });
});
