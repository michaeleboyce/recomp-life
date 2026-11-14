import { describe, expect, it } from "vitest";
import { makeSet } from "@/lib/workout/testFixtures";
import type { SetLog } from "@/types";
import { applyChange } from "./index";
import type { LogState } from "./index";
import { makeAdjustment, runSession, startSim } from "./testHelpers";

function makeLog(): LogState {
  const sim = startSim();
  runSession(sim, { templateId: "A1" });
  runSession(sim, { templateId: "B1" });
  return { workouts: sim.workouts, adjustments: sim.adjustments };
}

const setsOf = (log: LogState, workoutId: string): SetLog[] =>
  log.workouts.find((w) => w.id === workoutId)!.sets;

describe("applyChange", () => {
  it("never mutates the log it is given", () => {
    const log = makeLog();
    const frozen = JSON.stringify(log);
    const setId = log.workouts[0].sets[0].id;
    const changes = [
      { kind: "editSet", workoutId: "w1", setId, patch: { actualReps: 1, weight: 50, rpe: 8 } },
      { kind: "addSet", workoutId: "w1", set: makeSet("squat", "T1", { id: "new" }) },
      { kind: "deleteSet", workoutId: "w1", setId },
      {
        kind: "editWorkout",
        workoutId: "w1",
        patch: { completedAt: new Date("2026-03-01T10:00:00Z"), location: "home" },
      },
      { kind: "deleteWorkout", workoutId: "w1" },
      { kind: "restoreWorkout", workoutId: "w1" },
      { kind: "adjustLift", adjustment: makeAdjustment("squat", { t1Weight: 1 }, new Date(0)) },
    ] as const;
    for (const change of changes) {
      const next = applyChange(log, change, 1000);
      expect(next).not.toBe(log);
      expect(next.workouts).not.toBe(log.workouts);
      expect(next.adjustments).not.toBe(log.adjustments);
    }
    expect(JSON.stringify(log)).toBe(frozen);
  });

  describe("editSet", () => {
    it("patches reps, weight and RPE and re-derives the status", () => {
      const log = makeLog();
      const set = setsOf(log, "w1")[0];
      const failed = applyChange(log, {
        kind: "editSet",
        workoutId: "w1",
        setId: set.id,
        patch: { actualReps: 2, weight: 185, rpe: 9 },
      });
      expect(setsOf(failed, "w1")[0]).toMatchObject({
        id: set.id,
        actualReps: 2,
        weight: 185,
        rpe: 9,
        status: "failed",
        setNumber: set.setNumber,
      });
      // Only that set changes.
      expect(setsOf(failed, "w1").slice(1)).toEqual(setsOf(log, "w1").slice(1));
      expect(failed.workouts[1]).toBe(log.workouts[1]);

      const fixed = applyChange(failed, {
        kind: "editSet",
        workoutId: "w1",
        setId: set.id,
        patch: { actualReps: 3 },
      });
      expect(setsOf(fixed, "w1")[0]).toMatchObject({ actualReps: 3, weight: 185, status: "completed" });
    });

    it("clears the RPE when the patch names it as undefined", () => {
      const log = applyChange(makeLog(), {
        kind: "editSet",
        workoutId: "w1",
        setId: "s1",
        patch: { rpe: 8 },
      });
      const cleared = applyChange(log, {
        kind: "editSet",
        workoutId: "w1",
        setId: "s1",
        patch: { rpe: undefined },
      });
      expect(setsOf(log, "w1")[0].rpe).toBe(8);
      expect(setsOf(cleared, "w1")[0].rpe).toBeUndefined();
    });

    it.each(["autoregulated_load_drop", "skipped_pain", "reduced_run_fatigue", "reduced_equipment"] as const)(
      "keeps the %s status",
      (status) => {
        const log = makeLog();
        const withStatus: LogState = {
          ...log,
          workouts: log.workouts.map((w) =>
            w.id === "w1" ? { ...w, sets: w.sets.map((s) => (s.id === "s1" ? { ...s, status } : s)) } : w
          ),
        };
        const next = applyChange(withStatus, {
          kind: "editSet",
          workoutId: "w1",
          setId: "s1",
          patch: { actualReps: 0 },
        });
        expect(setsOf(next, "w1")[0]).toMatchObject({ actualReps: 0, status });
      }
    );
  });

  it("addSet appends the set", () => {
    const log = makeLog();
    const set = makeSet("squat", "T1", { id: "extra", setNumber: 6 });
    const next = applyChange(log, { kind: "addSet", workoutId: "w1", set });
    expect(setsOf(next, "w1")).toHaveLength(setsOf(log, "w1").length + 1);
    expect(setsOf(next, "w1").at(-1)).toEqual(set);
    expect(() => applyChange(next, { kind: "addSet", workoutId: "w1", set })).toThrow(/already exists/);
  });

  it("deleteSet removes the set and renumbers nothing", () => {
    const log = makeLog();
    const next = applyChange(log, { kind: "deleteSet", workoutId: "w1", setId: "s2" });
    const squat = setsOf(next, "w1").filter((s) => s.exerciseId === "squat");
    expect(squat.map((s) => s.setNumber)).toEqual([1, 3, 4, 5]);
  });

  describe("editWorkout", () => {
    it("shifts startedAt and every set by the same amount as completedAt", () => {
      const log = makeLog();
      const before = log.workouts[0];
      const delta = -3 * 24 * 3_600_000 + 17_000;
      const next = applyChange(log, {
        kind: "editWorkout",
        workoutId: "w1",
        patch: { completedAt: new Date(before.completedAt!.getTime() + delta) },
      }).workouts[0];
      expect(next.completedAt!.getTime() - before.completedAt!.getTime()).toBe(delta);
      expect(next.startedAt.getTime() - before.startedAt.getTime()).toBe(delta);
      expect(next.sets.map((s, i) => s.completedAt.getTime() - before.sets[i].completedAt.getTime())).toEqual(
        before.sets.map(() => delta)
      );
      expect(next.totalDurationSeconds).toBe(before.totalDurationSeconds);
      expect(next.location).toBe("gym");
    });

    it("works on rows whose dates are ISO strings", () => {
      const log: LogState = JSON.parse(JSON.stringify(makeLog()));
      const next = applyChange(log, {
        kind: "editWorkout",
        workoutId: "w1",
        patch: { completedAt: new Date("2026-06-01T12:00:00Z") },
      }).workouts[0];
      expect(next.completedAt).toEqual(new Date("2026-06-01T12:00:00Z"));
      expect(next.startedAt).toBeInstanceOf(Date);
      expect(next.sets[0].completedAt).toBeInstanceOf(Date);
    });

    it("changes the location on the workout and on each set", () => {
      const next = applyChange(makeLog(), {
        kind: "editWorkout",
        workoutId: "w1",
        patch: { location: "home" },
      }).workouts[0];
      expect(next.location).toBe("home");
      expect(next.sets.every((s) => s.location === "home")).toBe(true);
    });

    it("refuses to move the date of an unfinished workout", () => {
      const log = makeLog();
      const open: LogState = {
        ...log,
        workouts: log.workouts.map((w) => (w.id === "w2" ? { ...w, completedAt: null } : w)),
      };
      expect(() =>
        applyChange(open, { kind: "editWorkout", workoutId: "w2", patch: { completedAt: new Date() } })
      ).toThrow(/not finished/);
    });
  });

  it("deleteWorkout stamps deletedAt and restoreWorkout clears it", () => {
    const log = makeLog();
    const deleted = applyChange(log, { kind: "deleteWorkout", workoutId: "w1" }, 5000);
    expect(deleted.workouts[0]).toMatchObject({ deletedAt: 5000, updatedAt: 5000, synced: false });
    // Without a time the row is still marked deleted.
    expect(applyChange(log, { kind: "deleteWorkout", workoutId: "w1" }).workouts[0].deletedAt).toBe(1);

    const restored = applyChange(deleted, { kind: "restoreWorkout", workoutId: "w1" }, 5000);
    expect(restored.workouts[0].deletedAt).toBeNull();
    // A second write in the same millisecond still moves the stamp forward.
    expect(restored.workouts[0].updatedAt).toBe(5001);
  });

  it("leaves updatedAt alone when no time is given", () => {
    const log = makeLog();
    const next = applyChange(log, { kind: "deleteSet", workoutId: "w1", setId: "s1" });
    expect(next.workouts[0].updatedAt).toBe(log.workouts[0].updatedAt);
  });

  it("adjustLift appends the adjustment", () => {
    const log = makeLog();
    const adjustment = makeAdjustment("squat", { t1Weight: 180 }, new Date("2026-02-01T00:00:00Z"));
    const next = applyChange(log, { kind: "adjustLift", adjustment });
    expect(next.adjustments).toHaveLength(log.adjustments.length + 1);
    expect(next.adjustments.at(-1)).toEqual(adjustment);
    expect(() => applyChange(next, { kind: "adjustLift", adjustment })).toThrow(/already exists/);
  });

  it("throws a clear error for unknown ids", () => {
    const log = makeLog();
    expect(() => applyChange(log, { kind: "deleteWorkout", workoutId: "nope" })).toThrow("Workout not found: nope");
    expect(() => applyChange(log, { kind: "restoreWorkout", workoutId: "nope" })).toThrow("Workout not found: nope");
    expect(() => applyChange(log, { kind: "editWorkout", workoutId: "nope", patch: {} })).toThrow("Workout not found: nope");
    expect(() => applyChange(log, { kind: "addSet", workoutId: "nope", set: makeSet("squat", "T1") })).toThrow("Workout not found: nope");
    expect(() => applyChange(log, { kind: "editSet", workoutId: "w1", setId: "nope", patch: {} })).toThrow("Set not found: nope");
    expect(() => applyChange(log, { kind: "deleteSet", workoutId: "w1", setId: "nope" })).toThrow("Set not found: nope");
  });
});
