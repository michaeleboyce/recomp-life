import { describe, it, expect } from "vitest";
import { median } from "./median";

describe("median", () => {
  it("is the middle value of an odd count, in any order", () => {
    expect(median([70])).toBe(70);
    expect(median([80, 60, 70])).toBe(70);
    expect(median([1, 100, 2, 3, 99])).toBe(3);
  });

  it("is the mean of the two middle values of an even count", () => {
    expect(median([60, 70])).toBe(65);
    expect(median([75, 60, 80, 62, 65, 70])).toBe(67.5);
  });

  it("is not a number for an empty list, and leaves its input alone", () => {
    expect(median([])).toBeNaN();
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});
