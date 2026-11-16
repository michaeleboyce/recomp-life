import { describe, expect, it } from "vitest";
import { buildAddSet, buildSetEdit, homeOriginalWeight } from "./setChanges";
import { set } from "./testFixtures";

/** A Bulgarian split squat set at 80 a hand, standing in for a 245 lb barbell squat. */
const home = set({
  id: "h1",
  location: "home",
  isSubstituted: true,
  substituteExerciseId: "bulgarian_split_squat",
  weight: 80,
  originalWeight: 245,
});

describe("homeOriginalWeight", () => {
  it("scales the barbell weight a home set stands for, as a plan weight edit does", () => {
    expect(homeOriginalWeight(home, 80)).toBe(245);
    expect(homeOriginalWeight(home, 70)).toBe(Math.round((245 * 70) / 80));
    expect(homeOriginalWeight(home, 90)).toBe(Math.round((245 * 90) / 80));
  });

  it("is undefined for a set that stands for nothing else", () => {
    expect(homeOriginalWeight(set({ weight: 205 }), 195)).toBeUndefined();
    expect(homeOriginalWeight({ ...home, originalWeight: undefined }, 70)).toBeUndefined();
    expect(homeOriginalWeight({ ...home, weight: 0 }, 70)).toBeUndefined();
  });
});

describe("buildSetEdit at home", () => {
  it("moves the barbell weight a home set stands for with its weight, so credit reads one number", () => {
    expect(buildSetEdit("w1", home, { actualReps: 3, weight: 70, rpe: null })).toEqual({
      kind: "editSet",
      workoutId: "w1",
      setId: "h1",
      patch: { weight: 70, originalWeight: Math.round((245 * 70) / 80) },
    });
  });

  it("leaves it alone when only the reps change", () => {
    expect(buildSetEdit("w1", home, { actualReps: 2, weight: 80, rpe: null })).toEqual({
      kind: "editSet",
      workoutId: "w1",
      setId: "h1",
      patch: { actualReps: 2 },
    });
  });

  it("at the gym edits the weight alone", () => {
    expect(buildSetEdit("w1", set({ weight: 205 }), { actualReps: 3, weight: 195, rpe: null })).toEqual({
      kind: "editSet",
      workoutId: "w1",
      setId: "s1",
      patch: { weight: 195 },
    });
  });
});

describe("buildAddSet at home", () => {
  it("gives an added home set the barbell weight it stands for, scaled to its weight", () => {
    const change = buildAddSet("w1", home, 6, { actualReps: 3, weight: 70, rpe: null }, () => "new");
    expect(change.kind === "addSet" && change.set).toMatchObject({
      substituteExerciseId: "bulgarian_split_squat",
      isSubstituted: true,
      weight: 70,
      originalWeight: Math.round((245 * 70) / 80),
    });
    const same = buildAddSet("w1", home, 6, { actualReps: 3, weight: 80, rpe: null }, () => "new");
    expect(same.kind === "addSet" && same.set.originalWeight).toBe(245);
  });

  it("adds a gym set with no barbell weight to stand for", () => {
    const change = buildAddSet("w1", set({ weight: 205 }), 6, { actualReps: 3, weight: 205, rpe: null }, () => "new");
    expect(change.kind === "addSet" && "originalWeight" in change.set).toBe(false);
  });
});
