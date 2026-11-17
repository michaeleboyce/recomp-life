import { describe, expect, it } from "vitest";
import { mapExercise } from "./mapping";
import { importedMuscleSets, importedStrengthSets, resolveImportedSet } from "./evidence";
import { importedSession, importedSet } from "./testRecords";

// Made-up names and sets only.

describe("export names of the accessory library additions (A2)", () => {
  const cases: [string, string][] = [
    ["Hack Squat", "hack_squat"],
    ["Hack Squat (Machine)", "hack_squat"],
    ["Machine Hack Squat", "hack_squat"],
    ["Glute Kickback Machine", "glute_kickback_machine"],
    ["Machine Glute Kickback", "glute_kickback_machine"],
    ["Glute Pushback", "glute_kickback_machine"],
    ["Barbell Incline Bench Press", "barbell_incline_bench"],
    ["Incline Bench Press (Barbell)", "barbell_incline_bench"],
    ["Incline Bench Press", "barbell_incline_bench"],
    ["Romanian Deadlift", "barbell_rdl"],
    ["Barbell RDL", "barbell_rdl"],
    ["Romanian Deadlift (Barbell)", "barbell_rdl"],
    ["Machine Fly", "machine_chest_fly"],
    ["Chest Fly (Machine)", "machine_chest_fly"],
    ["Pec Deck", "machine_chest_fly"],
    ["Machine Row", "machine_row"],
    ["Seated Row (Machine)", "machine_row"],
    ["Incline Dumbbell Curl", "incline_db_curl"],
    ["Incline Curl", "incline_db_curl"],
    ["Incline Hammer Curl", "incline_hammer_curl"],
    ["Incline Dumbbell Hammer Curl", "incline_hammer_curl"],
    ["Incline Hammer", "incline_hammer_curl"],
  ];

  it.each(cases)("%s maps to %s", (name, id) => {
    const mapping = mapExercise(name);
    expect(mapping.kind).toBe("mapped");
    if (mapping.kind === "mapped") expect(mapping.exerciseId).toBe(id);
  });

  it("keeps the dumbbell and plain versions where they were", () => {
    const id = (name: string) => {
      const m = mapExercise(name);
      return m.kind === "mapped" ? m.exerciseId : null;
    };
    expect(id("Dumbbell Romanian Deadlift")).toBe("db_rdl");
    expect(id("Incline Dumbbell Press")).toBe("incline_db_press");
    expect(id("Dumbbell Curl")).toBe("bicep_curls");
    expect(id("Hammer Curl")).toBe("hammer_curls");
    expect(id("Lateral Raise")).toBe("lateral_raises");
    expect(id("Seated Dumbbell Shoulder Press")).toBe("seated_db_shoulder_press");
    expect(id("Glute Drive")).toBe("glute_drive");
    expect(id("Dumbbell Lunge")).toBe("db_lunge");
    expect(id("Cable Row")).toBe("cable_row");
  });
});

describe("sets imported before the additions count under them, with no re-import (A2)", () => {
  it("moves a set stored under a broader exercise to the specific one", () => {
    const set = importedSet({ exerciseName: "Incline Dumbbell Curl", mappedExerciseId: "bicep_curls" });
    expect(resolveImportedSet(set).exerciseId).toBe("incline_db_curl");
    const hammer = importedSet({ exerciseName: "Incline Hammer Curl", mappedExerciseId: "hammer_curls" });
    expect(resolveImportedSet(hammer).exerciseId).toBe("incline_hammer_curl");
  });

  it("moves a name stored as a muscle guess to its new exercise", () => {
    const set = importedSet({ exerciseName: "Hack Squat", mappedExerciseId: null, muscles: ["quads"] });
    expect(resolveImportedSet(set)).toEqual({ exerciseId: "hack_squat", muscles: null });
  });

  it("counts the stale sets as strength evidence and muscle work under the new id", () => {
    const session = importedSession([
      importedSet({ id: "s1", exerciseName: "Romanian Deadlift", mappedExerciseId: null, muscles: ["hamstrings"], weightPerImplementLb: 135, reps: 10 }),
      importedSet({ id: "s2", exerciseName: "Machine Fly", mappedExerciseId: null, muscles: ["chest"], weightPerImplementLb: 80, reps: 12 }),
    ]);
    const sets = importedStrengthSets([session]);
    expect(sets.map((s) => s.exerciseId)).toEqual(["barbell_rdl", "machine_chest_fly"]);
    const muscles = importedMuscleSets([session]);
    expect(muscles[0].primary).toEqual(["hamstrings", "glutes"]);
    expect(muscles[1].secondary).toEqual(["front_delts"]);
  });

  it("lets a mapping the user chose win over the table", () => {
    const set = importedSet({ exerciseName: "Incline Dumbbell Curl", mappedExerciseId: "bicep_curls" });
    expect(
      resolveImportedSet(set, { "Incline Dumbbell Curl": { kind: "exercise", exerciseId: "bicep_curls" } }).exerciseId
    ).toBe("bicep_curls");
    expect(
      resolveImportedSet(set, { "incline dumbbell curl": { kind: "custom", primary: ["biceps"] } })
    ).toEqual({ exerciseId: null, muscles: { primary: ["biceps"], secondary: [] } });
  });

  it("keeps the stored mapping for a name the table does not know", () => {
    const set = importedSet({ exerciseName: "My Odd Squat", mappedExerciseId: "goblet_squat" });
    expect(resolveImportedSet(set).exerciseId).toBe("goblet_squat");
  });
});
