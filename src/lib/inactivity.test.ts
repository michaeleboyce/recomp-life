import { describe, it, expect } from "vitest";
import { getDaysSinceLastWorkout, checkInactivity } from "./inactivity";

describe("getDaysSinceLastWorkout", () => {
  it("returns Infinity when no last workout date", () => {
    expect(getDaysSinceLastWorkout(null, new Date())).toBe(Infinity);
  });

  it("returns correct days since last workout", () => {
    const now = new Date("2026-02-14T12:00:00Z");
    const lastWorkout = new Date("2026-02-11T12:00:00Z");
    expect(getDaysSinceLastWorkout(lastWorkout, now)).toBe(3);
  });
});

describe("checkInactivity", () => {
  it("returns null for < 5 days", () => {
    expect(checkInactivity(4)).toBeNull();
  });

  it("returns gentle alert for 5-6 days", () => {
    const result = checkInactivity(5);
    expect(result?.level).toBe("gentle");
    expect(result?.prescription).toBe("normal_workout");
  });

  it("returns gentle alert for 6.9 days", () => {
    const result = checkInactivity(6.9);
    expect(result?.level).toBe("gentle");
  });

  it("returns urgent alert for 7 days", () => {
    const result = checkInactivity(7);
    expect(result?.level).toBe("urgent");
    expect(result?.prescription).toBe("normal_workout");
  });

  it("returns urgent alert for 9.9 days", () => {
    const result = checkInactivity(9.9);
    expect(result?.level).toBe("urgent");
  });

  it("returns detraining alert for 10+ days", () => {
    const result = checkInactivity(10);
    expect(result?.level).toBe("detraining");
    expect(result?.prescription).toBe("ramp_up_85");
  });

  it("returns detraining alert for very long inactivity", () => {
    const result = checkInactivity(30);
    expect(result?.level).toBe("detraining");
  });

  it("returns detraining for Infinity (no previous workout)", () => {
    const result = checkInactivity(Infinity);
    expect(result?.level).toBe("detraining");
  });
});
