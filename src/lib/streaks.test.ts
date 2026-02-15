import { describe, it, expect } from "vitest";
import { calculateConsistencyStreak } from "./streaks";

describe("calculateConsistencyStreak", () => {
  it("returns 0 for no workouts", () => {
    expect(calculateConsistencyStreak([], new Date("2026-02-14"))).toBe(0);
  });

  it("returns 0 when current week has < 3 workouts", () => {
    const now = new Date("2026-02-14"); // Saturday
    const dates = [
      new Date("2026-02-09"), // Monday
      new Date("2026-02-10"), // Tuesday
    ];
    expect(calculateConsistencyStreak(dates, now)).toBe(0);
  });

  it("returns 1 when current week has 3+ workouts", () => {
    const now = new Date("2026-02-14"); // Saturday
    const dates = [
      new Date("2026-02-09"), // Monday
      new Date("2026-02-10"), // Tuesday
      new Date("2026-02-12"), // Thursday
    ];
    expect(calculateConsistencyStreak(dates, now)).toBe(1);
  });

  it("returns 2 for two consecutive weeks with 3+ workouts", () => {
    const now = new Date("2026-02-14"); // Saturday
    const dates = [
      // This week (Feb 9-15)
      new Date("2026-02-09"),
      new Date("2026-02-10"),
      new Date("2026-02-12"),
      // Previous week (Feb 2-8)
      new Date("2026-02-02"),
      new Date("2026-02-04"),
      new Date("2026-02-06"),
    ];
    expect(calculateConsistencyStreak(dates, now)).toBe(2);
  });

  it("breaks streak when a week has < 3 workouts", () => {
    const now = new Date("2026-02-14");
    const dates = [
      // This week - 3 workouts
      new Date("2026-02-09"),
      new Date("2026-02-10"),
      new Date("2026-02-12"),
      // Previous week - only 2 workouts (breaks streak)
      new Date("2026-02-02"),
      new Date("2026-02-04"),
      // Two weeks ago - 3 workouts (doesn't count, streak broken)
      new Date("2026-01-26"),
      new Date("2026-01-27"),
      new Date("2026-01-28"),
    ];
    expect(calculateConsistencyStreak(dates, now)).toBe(1);
  });

  it("handles 5+ workouts in a week", () => {
    const now = new Date("2026-02-14");
    const dates = [
      new Date("2026-02-09"),
      new Date("2026-02-10"),
      new Date("2026-02-11"),
      new Date("2026-02-12"),
      new Date("2026-02-13"),
    ];
    expect(calculateConsistencyStreak(dates, now)).toBe(1);
  });
});
