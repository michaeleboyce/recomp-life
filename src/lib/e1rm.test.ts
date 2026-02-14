import { describe, it, expect } from "vitest";
import { calculateE1RM, isNewPR, getE1RMTrend } from "./e1rm";

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
