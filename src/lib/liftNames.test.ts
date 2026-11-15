import { describe, expect, it } from "vitest";
import { formatStage, isMainLift, LIFT_NAMES, MAIN_LIFTS } from "./liftNames";

describe("lift names", () => {
  it("names each main lift in a row label and in a sentence", () => {
    expect(MAIN_LIFTS.map((id) => LIFT_NAMES[id])).toEqual([
      { label: "Squat", short: "squat" },
      { label: "Bench press", short: "bench" },
      { label: "Deadlift", short: "deadlift" },
      { label: "Overhead press", short: "overhead press" },
    ]);
  });

  it("knows a main lift from anything else", () => {
    expect(isMainLift("ohp")).toBe(true);
    expect(isMainLift("curl")).toBe(false);
    expect(isMainLift(null)).toBe(false);
    expect(isMainLift(undefined)).toBe(false);
  });

  it("writes a stage with a times sign", () => {
    expect(formatStage("5x3")).toBe("5×3");
  });
});
