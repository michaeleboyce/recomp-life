import { describe, expect, it } from "vitest";
import { workoutDetailHref } from "./routes";

describe("workoutDetailHref", () => {
  it("puts the id in the query string, encoded", () => {
    expect(workoutDetailHref("w1")).toBe("/log/workout?id=w1");
    expect(workoutDetailHref("hk:A B")).toBe("/log/workout?id=hk%3AA%20B");
  });
});
