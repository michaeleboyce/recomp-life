import { describe, expect, it } from "vitest";
import type { LogChange } from "@/lib/rebuild";
import { inverseChange } from "./inverse";
import { buildAddSet, buildSetEdit, parseSetValues } from "./setChanges";
import { input, set, workout } from "./testFixtures";

const s1 = set({ id: "s1", actualReps: 3, weight: 205 });
const log = input([workout({ id: "w1", sets: [s1], location: "gym" })]);

describe("inverseChange", () => {
  it("restores the edited set fields, clearing an RPE the set did not have", () => {
    const change: LogChange = {
      kind: "editSet",
      workoutId: "w1",
      setId: "s1",
      patch: { actualReps: 2, rpe: 9 },
    };
    const inverse = inverseChange(log, change);
    expect(inverse).toEqual({ kind: "editSet", workoutId: "w1", setId: "s1", patch: { actualReps: 3, rpe: undefined } });
    expect(inverse.kind === "editSet" && "rpe" in inverse.patch).toBe(true);
  });

  it("re-adds a deleted set and deletes an added one", () => {
    expect(inverseChange(log, { kind: "deleteSet", workoutId: "w1", setId: "s1" })).toEqual({
      kind: "addSet",
      workoutId: "w1",
      set: s1,
    });
    const added = set({ id: "s2" });
    expect(inverseChange(log, { kind: "addSet", workoutId: "w1", set: added })).toEqual({
      kind: "deleteSet",
      workoutId: "w1",
      setId: "s2",
    });
  });

  it("restores the previous date and location", () => {
    const change: LogChange = {
      kind: "editWorkout",
      workoutId: "w1",
      patch: { completedAt: new Date("2026-11-09T10:00:00"), location: "home" },
    };
    expect(inverseChange(log, change)).toEqual({
      kind: "editWorkout",
      workoutId: "w1",
      patch: { completedAt: new Date("2026-11-10T10:00:00"), location: "gym" },
    });
  });

  it("pairs delete and restore of a workout", () => {
    expect(inverseChange(log, { kind: "deleteWorkout", workoutId: "w1" })).toEqual({ kind: "restoreWorkout", workoutId: "w1" });
    expect(inverseChange(log, { kind: "restoreWorkout", workoutId: "w1" })).toEqual({ kind: "deleteWorkout", workoutId: "w1" });
  });

  it("undoes a manual adjustment with a later one that sets the fields back", () => {
    const at = new Date("2026-11-12T08:00:00");
    const change: LogChange = {
      kind: "adjustLift",
      adjustment: { id: "a1", clientId: "a1", exerciseId: "squat", at, source: "manual", set: { t1Weight: 250 }, synced: false },
    };
    const inverse = inverseChange(input([]), change, () => "a2");
    expect(inverse).toMatchObject({
      kind: "adjustLift",
      adjustment: { id: "a2", exerciseId: "squat", source: "manual", set: { t1Weight: 0 } },
    });
    expect(inverse.kind === "adjustLift" && inverse.adjustment.at.getTime()).toBe(at.getTime() + 1);
  });

  it("throws for a set that does not exist", () => {
    expect(() => inverseChange(log, { kind: "deleteSet", workoutId: "w1", setId: "nope" })).toThrow("Set not found");
  });
});

describe("set changes", () => {
  it("parses values and rejects bad ones", () => {
    expect(parseSetValues("3", "202.5", "")).toEqual({ actualReps: 3, weight: 202.5, rpe: null });
    expect(parseSetValues("2.5", "200", "")).toHaveProperty("error");
    expect(parseSetValues("3", "-5", "")).toHaveProperty("error");
    expect(parseSetValues("3", "200", "11")).toHaveProperty("error");
  });

  it("buildSetEdit returns null when nothing changed", () => {
    expect(buildSetEdit("w1", s1, { actualReps: 3, weight: 205, rpe: null })).toBeNull();
  });

  it("buildAddSet times the new set just after the one it copies", () => {
    const change = buildAddSet("w1", s1, 6, { actualReps: 3, weight: 205, rpe: null }, () => "new");
    expect(change).toMatchObject({ kind: "addSet", set: { id: "new", clientId: "new", setNumber: 6, status: "completed" } });
    expect(change.kind === "addSet" && change.set.completedAt.getTime()).toBe(new Date(s1.completedAt).getTime() + 1000);
    expect(change.kind === "addSet" && "rpe" in change.set).toBe(false);
  });
});
