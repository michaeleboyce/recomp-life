import { describe, expect, it } from "vitest";
import { makeSet } from "@/lib/data/testUtils";
import { outcomeLiftName } from "./WhatItDid";

describe("outcomeLiftName", () => {
  it("names the program lift for a gym session", () => {
    expect(outcomeLiftName("squat", "T1", [makeSet({ exerciseId: "squat", tier: "T1" })])).toBe("Squat");
  });

  it("adds the home substitute the sets were done as", () => {
    const sets = [
      makeSet({ exerciseId: "squat", tier: "T1", isSubstituted: true, substituteExerciseId: "goblet_squat" }),
      makeSet({ exerciseId: "bench", tier: "T2", isSubstituted: true, substituteExerciseId: "db_bench" }),
    ];
    expect(outcomeLiftName("squat", "T1", sets)).toBe("Squat (goblet squat at home)");
    expect(outcomeLiftName("bench", "T2", sets)).toBe("Bench Press (DB bench press at home)");
  });

  it("only reads the sets of that tier", () => {
    const sets = [makeSet({ exerciseId: "squat", tier: "T2", substituteExerciseId: "goblet_squat" })];
    expect(outcomeLiftName("squat", "T1", sets)).toBe("Squat");
  });
});
