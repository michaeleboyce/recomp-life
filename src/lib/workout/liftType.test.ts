import { describe, expect, it } from "vitest";
import { progressionLiftType } from "./completeWorkout";

describe("progressionLiftType", () => {
  it("treats squat and deadlift, and their home substitutes, as lower-body lifts", () => {
    for (const id of ["squat", "deadlift", "db_rdl", "goblet_squat"]) {
      expect(progressionLiftType(id), id).toBe("lower");
    }
  });

  it("treats presses, rows and pulldowns as upper-body lifts", () => {
    for (const id of ["bench", "ohp", "db_bench", "db_row", "lat_pulldown"]) {
      expect(progressionLiftType(id), id).toBe("upper");
    }
  });
});
