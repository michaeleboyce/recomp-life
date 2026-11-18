import { describe, expect, it } from "vitest";
import { workoutDisplayName } from "./workoutNames";

describe("workoutDisplayName", () => {
  it.each([
    ["A1", "Squat day"],
    ["B1", "Press day"],
    ["A2", "Bench day"],
    ["B2", "Deadlift day"],
  ])("%s -> %s", (id, name) => expect(workoutDisplayName(id)).toBe(name));

  it("adds the id on request", () => {
    expect(workoutDisplayName("A1", true)).toBe("A1 · Squat day");
  });

  it("falls back to the id", () => {
    expect(workoutDisplayName("Z9", true)).toBe("Z9");
  });
});
