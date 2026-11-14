import { describe, expect, it } from "vitest";
import { formatWeekRange, nextWeek, parseWeekKey, previousWeek, reviewWeeks, weekKey, weekOf } from "./weeks";
import { AFTER, WEEK, fixture } from "./testFixture";

describe("weeks", () => {
  it("runs Monday 00:00 to the next Monday, and formats the range", () => {
    expect(weekOf(new Date(2026, 10, 8, 23, 59))).toEqual(WEEK);
    expect(weekOf(new Date(2026, 10, 9, 0, 0))).toEqual(new Date(2026, 10, 9));
    expect(nextWeek(WEEK)).toEqual(new Date(2026, 10, 9));
    expect(previousWeek(WEEK)).toEqual(new Date(2026, 9, 26));
    expect(formatWeekRange(WEEK)).toBe("Nov 2 – 8");
    expect(formatWeekRange(new Date(2026, 9, 26))).toBe("Oct 26 – Nov 1");
  });

  it("round-trips the URL key and rejects nonsense", () => {
    expect(weekKey(WEEK)).toBe("2026-11-02");
    expect(parseWeekKey("2026-11-05")).toEqual(WEEK);
    expect(parseWeekKey("2026-02-30")).toBeNull();
    expect(parseWeekKey("soon")).toBeNull();
    expect(parseWeekKey(null)).toBeNull();
  });

  it("lists weeks with data newest first, always including the current week", () => {
    const weeks = reviewWeeks(fixture(), AFTER).map(weekKey);
    expect(weeks[0]).toBe("2026-11-09");
    expect(weeks).toContain("2026-11-02");
    expect(weeks).toContain("2026-10-12");
    expect(weeks).toEqual([...weeks].sort().reverse());
    expect(reviewWeeks({ ...fixture(), workouts: [], bodyweight: [], runs: [], activities: [] }, AFTER).map(weekKey)).toEqual(["2026-11-09"]);
  });
});

