import { describe, expect, it } from "vitest";
import { mapExercise } from "./index";
import { applyOverrides, forgetMapping, overrideMapping, rememberMapping } from "./overrides";
import type { MappingOverrides } from "./types";

describe("applyOverrides", () => {
  it("returns null with no overrides or no choice for the name", () => {
    expect(applyOverrides("Spider Curl")).toBeNull();
    expect(applyOverrides("Spider Curl", {})).toBeNull();
    expect(applyOverrides("", { "": { kind: "exercise", exerciseId: "bench" } })).toBeNull();
  });

  it("finds a choice stored under any spelling of the name", () => {
    const overrides: MappingOverrides = { "Spider Curls": { kind: "exercise", exerciseId: "bicep_curls" } };
    expect(applyOverrides("spider curl", overrides)).toEqual({
      kind: "mapped",
      exerciseId: "bicep_curls",
      confidence: "user",
    });
  });

  it("ignores a choice of an exercise that is no longer in the library", () => {
    expect(overrideMapping({ kind: "exercise", exerciseId: "retired_lift" })).toBeNull();
  });

  it("keeps only real muscles in a custom choice, none listed twice", () => {
    const mapping = overrideMapping({
      kind: "custom",
      primary: ["biceps", "biceps", "wings" as never],
      secondary: ["biceps", "forearms"],
    });
    expect(mapping).toEqual({
      kind: "custom",
      muscles: { primary: ["biceps"], secondary: ["forearms"] },
      confidence: "user",
    });
  });
});

describe("mapExercise with overrides", () => {
  it("applies the user's choice before the table", () => {
    // The table says db_bench; the user says this export's "Dumbbell Bench Press" was floor presses.
    const overrides: MappingOverrides = { "dumbbell bench press": { kind: "exercise", exerciseId: "db_floor_press" } };
    expect(mapExercise("Dumbbell Bench Press", overrides)).toMatchObject({ kind: "mapped", exerciseId: "db_floor_press" });
    expect(mapExercise("Dumbbell Bench Press")).toMatchObject({ kind: "mapped", exerciseId: "db_bench" });
  });

  it("lets the user keep a name as a custom exercise with chosen muscles", () => {
    const overrides: MappingOverrides = { "Zorblax Twirl": { kind: "custom", primary: ["obliques"] } };
    expect(mapExercise("Zorblax Twirl")).toEqual({ kind: "unknown" });
    expect(mapExercise("Zorblax Twirl", overrides)).toEqual({
      kind: "custom",
      muscles: { primary: ["obliques"], secondary: [] },
      confidence: "user",
    });
  });

  it("lets the user map a name to a program lift (the user has the final say)", () => {
    const overrides: MappingOverrides = { "Comp Bench": { kind: "exercise", exerciseId: "bench" } };
    expect(mapExercise("Comp Bench", overrides)).toEqual({ kind: "mapped", exerciseId: "bench", confidence: "user" });
  });

  it("falls back to the table when the chosen exercise has left the library", () => {
    const overrides: MappingOverrides = { "Goblet Squat": { kind: "exercise", exerciseId: "retired_lift" } };
    expect(mapExercise("Goblet Squat", overrides)).toMatchObject({ kind: "mapped", exerciseId: "goblet_squat" });
  });
});

describe("rememberMapping and forgetMapping", () => {
  it("store a choice under the normalised name and re-apply it to the next file's spelling", () => {
    const stored = rememberMapping({}, "Spider Curls", { kind: "exercise", exerciseId: "bicep_curls" });
    expect(Object.keys(stored)).toEqual(["curl spider"]);
    expect(mapExercise("SPIDER CURL", stored)).toMatchObject({ exerciseId: "bicep_curls", confidence: "user" });
  });

  it("replace an earlier choice for any spelling of the same name", () => {
    const first: MappingOverrides = { "Spider Curls": { kind: "exercise", exerciseId: "bicep_curls" } };
    const second = rememberMapping(first, "spider curl", { kind: "custom", primary: ["biceps"] });
    expect(Object.keys(second)).toEqual(["curl spider"]);
    expect(mapExercise("Spider Curls", second)).toMatchObject({ kind: "custom" });
  });

  it("do not change the overrides they are given", () => {
    const first: MappingOverrides = { "Spider Curls": { kind: "exercise", exerciseId: "bicep_curls" } };
    const copy = structuredClone(first);
    rememberMapping(first, "Zorblax Twirl", { kind: "custom", primary: ["abs"] });
    forgetMapping(first, "Spider Curls");
    expect(first).toEqual(copy);
  });

  it("forget every spelling of a name and leave the rest", () => {
    const overrides: MappingOverrides = {
      "Spider Curls": { kind: "exercise", exerciseId: "bicep_curls" },
      "spider curl": { kind: "exercise", exerciseId: "hammer_curls" },
      "Zorblax Twirl": { kind: "custom", primary: ["abs"] },
    };
    expect(Object.keys(forgetMapping(overrides, "Spider Curl"))).toEqual(["Zorblax Twirl"]);
  });

  it("ignore a blank name", () => {
    expect(rememberMapping({}, "  ", { kind: "exercise", exerciseId: "bench" })).toEqual({});
  });
});
