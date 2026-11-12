import { describe, it, expect } from "vitest";
import { getDaysSinceLastWorkout, checkInactivity } from "./inactivity";

describe("getDaysSinceLastWorkout", () => {
  it("returns null, not a number of days, when there has never been a workout", () => {
    expect(getDaysSinceLastWorkout(null, new Date())).toBeNull();
  });

  it("returns null for an unreadable date", () => {
    expect(getDaysSinceLastWorkout(new Date("nope"), new Date())).toBeNull();
  });

  it("accepts an ISO string from a synced row", () => {
    const now = new Date("2026-02-14T12:00:00Z");
    expect(
      getDaysSinceLastWorkout("2026-02-11T12:00:00.000Z" as unknown as Date, now)
    ).toBe(3);
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

  it("stays urgent, with a normal workout, at 10 and 20 days", () => {
    expect(checkInactivity(10)?.level).toBe("urgent");
    expect(checkInactivity(10)?.prescription).toBe("normal_workout");
    expect(checkInactivity(20.9)?.level).toBe("urgent");
  });

  it("returns the long-break alert at 21+ days", () => {
    const result = checkInactivity(21);
    expect(result?.level).toBe("detraining");
    expect(result?.prescription).toBe("ease_back_in");
  });

  it("does not claim a fixed percentage or an injury risk", () => {
    const message = checkInactivity(30)?.message ?? "";
    expect(message).not.toMatch(/85%|injury/i);
  });

  it("returns the long-break alert for very long inactivity", () => {
    const result = checkInactivity(60);
    expect(result?.level).toBe("detraining");
  });

  it("returns no alert for someone who has never trained", () => {
    expect(checkInactivity(null)).toBeNull();
    expect(checkInactivity(getDaysSinceLastWorkout(null, new Date()))).toBeNull();
  });

  it("returns no alert for a value that is not a number of days", () => {
    expect(checkInactivity(NaN)).toBeNull();
  });
});
