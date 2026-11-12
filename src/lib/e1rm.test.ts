import { describe, it, expect } from "vitest";
import {
  calculateE1RM,
  isNewPR,
  getE1RMTrend,
  repsInReserveFromRPE,
  isE1RMEligibleSet,
  toRecentE1RMSeries,
} from "./e1rm";

describe("calculateE1RM", () => {
  it("calculates e1RM correctly using Epley formula for 155 lbs x 7 reps", () => {
    expect(calculateE1RM(155, 7)).toBe(191);
  });

  it("calculates e1RM correctly for 190 lbs x 5 reps", () => {
    expect(calculateE1RM(190, 5)).toBe(222);
  });

  it("calculates e1RM correctly for 220 lbs x 3 reps", () => {
    expect(calculateE1RM(220, 3)).toBe(242);
  });

  it("returns null for 1 rep (not meaningful below 2 reps)", () => {
    expect(calculateE1RM(100, 1)).toBeNull();
  });

  it("returns null for 0 reps", () => {
    expect(calculateE1RM(100, 0)).toBeNull();
  });

  it("returns null for negative reps", () => {
    expect(calculateE1RM(100, -1)).toBeNull();
  });
});

describe("isNewPR", () => {
  it("returns true when current e1RM exceeds all previous values", () => {
    expect(isNewPR(191, [180, 185, 188])).toBe(true);
  });

  it("returns false when current e1RM does not exceed the best previous value", () => {
    expect(isNewPR(185, [180, 185, 188])).toBe(false);
  });

  it("returns true when there are no previous e1RMs (first ever)", () => {
    expect(isNewPR(191, [])).toBe(true);
  });

  it("returns false when current e1RM equals the best previous value", () => {
    expect(isNewPR(188, [180, 185, 188])).toBe(false);
  });
});

describe("getE1RMTrend", () => {
  it('returns "increasing" when last 3 values are monotonically increasing', () => {
    expect(getE1RMTrend([180, 185, 191])).toBe("increasing");
  });

  it('returns "decreasing" when last 3 values are monotonically decreasing', () => {
    expect(getE1RMTrend([191, 188, 185])).toBe("decreasing");
  });

  it('returns "stable" when last 3 values are not monotonic', () => {
    expect(getE1RMTrend([185, 191, 188])).toBe("stable");
  });

  it('returns "insufficient_data" when fewer than 3 values are provided', () => {
    expect(getE1RMTrend([185, 191])).toBe("insufficient_data");
  });

  it('returns "insufficient_data" for a single value', () => {
    expect(getE1RMTrend([185])).toBe("insufficient_data");
  });

  it('returns "insufficient_data" for an empty array', () => {
    expect(getE1RMTrend([])).toBe("insufficient_data");
  });

  it("uses only the last 3 values when more are provided", () => {
    // Array is [100, 150, 180, 185, 191], last 3 = [180, 185, 191] -> increasing
    expect(getE1RMTrend([100, 150, 180, 185, 191])).toBe("increasing");
  });

  it('returns "stable" when all three values are equal', () => {
    expect(getE1RMTrend([185, 185, 185])).toBe("stable");
  });
});

describe("repsInReserveFromRPE", () => {
  it("returns 0 when no RPE was logged", () => {
    expect(repsInReserveFromRPE()).toBe(0);
    expect(repsInReserveFromRPE(null)).toBe(0);
  });

  it("returns 10 minus RPE", () => {
    expect(repsInReserveFromRPE(10)).toBe(0);
    expect(repsInReserveFromRPE(9)).toBe(1);
    expect(repsInReserveFromRPE(8.5)).toBe(1.5);
  });

  it("is clamped to 4 reps so a very easy set cannot inflate the estimate", () => {
    expect(repsInReserveFromRPE(6)).toBe(4);
    expect(repsInReserveFromRPE(3)).toBe(4);
  });
});

describe("calculateE1RM with RPE", () => {
  it("is unchanged when the set was RPE 10", () => {
    expect(calculateE1RM(190, 5, 10)).toBe(calculateE1RM(190, 5));
  });

  it("adds one rep for an RPE 9 set, so stopping a rep early is not a drop", () => {
    // 5 reps at RPE 9 is treated like 6 reps to failure
    expect(calculateE1RM(190, 5, 9)).toBe(calculateE1RM(190, 6));
  });

  it("still returns null below 2 reps", () => {
    expect(calculateE1RM(190, 1, 9)).toBeNull();
  });
});

describe("isE1RMEligibleSet", () => {
  it("accepts T1 AMRAP sets of 2 to 10 reps", () => {
    expect(isE1RMEligibleSet("T1", true, 2)).toBe(true);
    expect(isE1RMEligibleSet("T1", true, 10)).toBe(true);
  });

  it("rejects high-rep sets, where rep-max formulas are unreliable", () => {
    expect(isE1RMEligibleSet("T1", true, 11)).toBe(false);
  });

  it("rejects T3 AMRAP sets", () => {
    expect(isE1RMEligibleSet("T3", true, 8)).toBe(false);
    expect(isE1RMEligibleSet("T3", true, 25)).toBe(false);
  });

  it("rejects non-AMRAP sets and singles", () => {
    expect(isE1RMEligibleSet("T1", false, 3)).toBe(false);
    expect(isE1RMEligibleSet("T1", true, 1)).toBe(false);
  });
});

describe("toRecentE1RMSeries", () => {
  const entries = [
    { date: new Date("2026-11-05"), estimated1RM: 230 },
    { date: new Date("2026-11-01"), estimated1RM: 220 },
    { date: new Date("2026-11-03"), estimated1RM: 225 },
  ];

  it("returns values oldest first regardless of input order", () => {
    expect(toRecentE1RMSeries(entries)).toEqual([220, 225, 230]);
  });

  it("feeds getE1RMTrend so a rising lift reads as increasing", () => {
    expect(getE1RMTrend(toRecentE1RMSeries(entries))).toBe("increasing");
  });

  it("keeps only the most recent n values", () => {
    const many = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      date: new Date(`2026-11-0${d}`),
      estimated1RM: 200 + d,
    }));
    expect(toRecentE1RMSeries(many)).toEqual([203, 204, 205, 206, 207]);
    expect(toRecentE1RMSeries(many, 2)).toEqual([206, 207]);
  });

  it("accepts ISO date strings and does not mutate the input", () => {
    const input = [
      { date: "2026-11-02T10:00:00Z", estimated1RM: 2 },
      { date: "2026-11-01T10:00:00Z", estimated1RM: 1 },
    ];
    expect(toRecentE1RMSeries(input)).toEqual([1, 2]);
    expect(input[0].estimated1RM).toBe(2);
  });

  it("returns an empty array for no entries", () => {
    expect(toRecentE1RMSeries([])).toEqual([]);
  });
});
