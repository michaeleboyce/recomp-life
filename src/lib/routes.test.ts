import { describe, expect, it } from "vitest";
import { upcomingListHref, upcomingWorkoutHref, workoutDetailHref } from "./routes";

describe("workoutDetailHref", () => {
  it("puts the id in the query string, encoded", () => {
    expect(workoutDetailHref("w1")).toBe("/log/workout?id=w1");
    expect(workoutDetailHref("hk:A B")).toBe("/log/workout?id=hk%3AA%20B");
  });
});

describe("upcoming addresses", () => {
  it("put the position and location in the query string, with Today as the start point when given", () => {
    expect(upcomingWorkoutHref(2, "home")).toBe("/progress/upcoming/workout?n=2&location=home");
    expect(upcomingWorkoutHref(0, "gym", "today")).toBe("/progress/upcoming/workout?n=0&location=gym&from=today");
    expect(upcomingListHref("gym")).toBe("/progress/upcoming?location=gym");
    expect(upcomingListHref("home", "today")).toBe("/progress/upcoming?location=home&from=today");
  });
});
