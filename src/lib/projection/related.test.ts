import { describe, it, expect } from "vitest";
import { EXERCISES } from "@/lib/exercises";
import { relatedExerciseIds } from "./related";

describe("relatedExerciseIds", () => {
  it("lists other exercises sharing a primary muscle, not the lift itself", () => {
    const ids = relatedExerciseIds("squat");
    expect(ids).not.toContain("squat");
    expect(ids).toContain("goblet_squat");
    for (const id of ids) {
      expect(
        EXERCISES[id].primaryMuscles.some((m) => EXERCISES.squat.primaryMuscles.includes(m))
      ).toBe(true);
    }
    expect([...ids].sort()).toEqual(ids);
  });

  it("is empty for an unknown lift", () => {
    expect(relatedExerciseIds("nope")).toEqual([]);
  });
});
