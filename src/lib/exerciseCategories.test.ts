import { describe, it, expect } from "vitest";
import {
  getGroupedExercises,
  isPreferenceEditable,
  filterGroupsByMuscle,
} from "./exerciseCategories";
import { ACCESSORY_IDS, EXERCISES } from "./exercises";

describe("getGroupedExercises", () => {
  it("returns 4 groups when unfiltered", () => {
    const groups = getGroupedExercises();
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.label)).toEqual([
      "Main Lifts",
      "T3 Lifts",
      "Home Substitutions",
      "Accessories",
    ]);
  });

  it("Main Lifts contains squat, bench, deadlift, ohp (alphabetical)", () => {
    const groups = getGroupedExercises();
    const mainLifts = groups.find((g) => g.label === "Main Lifts")!;
    expect(mainLifts.exercises.map((e) => e.id)).toEqual([
      "bench",
      "deadlift",
      "ohp",
      "squat",
    ]);
  });

  it("T3 Lifts contains db_row and lat_pulldown (alphabetical)", () => {
    const groups = getGroupedExercises();
    const t3 = groups.find((g) => g.label === "T3 Lifts")!;
    expect(t3.exercises.map((e) => e.id)).toEqual(["db_row", "lat_pulldown"]);
  });

  it("Home Substitutions contains 5 dumbbell alternatives (alphabetical)", () => {
    const groups = getGroupedExercises();
    const home = groups.find((g) => g.label === "Home Substitutions")!;
    expect(home.exercises).toHaveLength(5);
    expect(home.exercises.map((e) => e.id)).toEqual([
      "bulgarian_split_squat",
      "db_bench",
      "db_rdl",
      "db_shoulder_press",
      "goblet_squat",
    ]);
  });

  it("Accessories contains all 23 accessory exercises (alphabetical)", () => {
    const groups = getGroupedExercises();
    const accessories = groups.find((g) => g.label === "Accessories")!;
    expect(accessories.exercises).toHaveLength(23);
    const names = accessories.exercises.map((e) => e.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("filtering by 'push' narrows results across groups", () => {
    const groups = getGroupedExercises("push");
    const allExercises = groups.flatMap((g) => g.exercises);
    expect(allExercises.every((e) => e.muscleGroup === "push")).toBe(true);
    // bench + ohp from Main Lifts
    const mainLifts = groups.find((g) => g.label === "Main Lifts")!;
    expect(mainLifts.exercises.map((e) => e.id)).toEqual(["bench", "ohp"]);
  });

  it("filtering by 'pull' includes T3 and relevant accessories", () => {
    const groups = getGroupedExercises("pull");
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("T3 Lifts");
    expect(labels).toContain("Accessories");
  });

  it("filtering removes empty groups", () => {
    const groups = getGroupedExercises("core");
    // No main lifts or T3 are core
    const labels = groups.map((g) => g.label);
    expect(labels).not.toContain("Main Lifts");
    expect(labels).not.toContain("T3 Lifts");
  });
});

describe("isPreferenceEditable", () => {
  it("returns true for all accessories", () => {
    for (const id of ACCESSORY_IDS) {
      expect(isPreferenceEditable(id)).toBe(true);
    }
  });

  it("returns false for main lifts", () => {
    expect(isPreferenceEditable("squat")).toBe(false);
    expect(isPreferenceEditable("bench")).toBe(false);
    expect(isPreferenceEditable("deadlift")).toBe(false);
    expect(isPreferenceEditable("ohp")).toBe(false);
  });

  it("returns false for T3 lifts", () => {
    expect(isPreferenceEditable("lat_pulldown")).toBe(false);
    expect(isPreferenceEditable("db_row")).toBe(false);
  });

  it("returns false for home substitutions", () => {
    expect(isPreferenceEditable("goblet_squat")).toBe(false);
    expect(isPreferenceEditable("db_bench")).toBe(false);
    expect(isPreferenceEditable("db_rdl")).toBe(false);
  });
});

describe("filterGroupsByMuscle (R9)", () => {
  it("returns the groups unchanged when no muscle is selected", () => {
    const groups = getGroupedExercises();
    expect(filterGroupsByMuscle(groups, null)).toEqual(groups);
  });

  it("keeps exactly the exercises with the muscle as primary or secondary", () => {
    const groups = getGroupedExercises();
    const filtered = filterGroupsByMuscle(groups, "triceps");
    const ids = filtered.flatMap((g) => g.exercises.map((e) => e.id)).sort();
    // Expected: every listed exercise whose catalogue entry has triceps as
    // primary or secondary. (The list itself omits four home-fallback
    // exercises; that is existing behaviour and not this function's concern.)
    const expected = groups
      .flatMap((g) => g.exercises.map((e) => e.id))
      .filter((id) => {
        const e = EXERCISES[id];
        return e.primaryMuscles.includes("triceps") || e.secondaryMuscles.includes("triceps");
      })
      .sort();
    expect(ids).toEqual(expected);
    expect(ids).toContain("bench");
    expect(ids).toContain("tricep_pushdowns");
    expect(ids).not.toContain("ab_rollout"); // triceps is only a stabiliser there
  });

  it("drops groups left with no exercises", () => {
    const filtered = filterGroupsByMuscle(getGroupedExercises(), "calves");
    expect(filtered.every((g) => g.exercises.length > 0)).toBe(true);
    expect(filtered.map((g) => g.label)).not.toContain("Main Lifts");
  });

  it("combines with the push/pull/legs filter", () => {
    const filtered = filterGroupsByMuscle(getGroupedExercises("pull"), "biceps");
    const all = filtered.flatMap((g) => g.exercises);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.muscleGroup === "pull")).toBe(true);
  });

  it("does not mutate the input groups", () => {
    const groups = getGroupedExercises();
    const before = groups.map((g) => g.exercises.length);
    filterGroupsByMuscle(groups, "calves");
    expect(groups.map((g) => g.exercises.length)).toEqual(before);
  });
});
