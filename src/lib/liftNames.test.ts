import { describe, expect, it } from "vitest";
import { formatStage, isMainLift, LIFT_NAMES, liftShortName, MAIN_LIFTS, projectionLiftName } from "./liftNames";

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

// Moved from workoutNames.test.ts with the function.
describe("liftShortName", () => {
  it.each([
    ["squat", "Squat"],
    ["bench", "Bench press"],
    ["deadlift", "Deadlift"],
    ["ohp", "Overhead press"],
  ])("%s -> %s", (id, name) => expect(liftShortName(id)).toBe(name));

  it("passes unknown ids through", () => {
    expect(liftShortName("mystery")).toBe("mystery");
  });
});

// Moved from projection/summary.test.ts (where the function was `liftShortName`).
describe("projectionLiftName", () => {
  it("drops the equipment prefix and keeps acronyms", () => {
    expect(projectionLiftName("squat")).toBe("squat");
    expect(projectionLiftName("bench")).toBe("bench press");
    expect(projectionLiftName("ohp")).toBe("OHP");
    expect(projectionLiftName("not_a_lift")).toBe("not_a_lift");
  });
});
