import { describe, it, expect } from "vitest";
import { getMonday } from "./dates";

describe("getMonday", () => {
  it("returns the same day at midnight for a Monday", () => {
    const result = getMonday(new Date(2026, 1, 9, 15, 30)); // Mon 9 Feb 2026
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(9);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it("returns the previous Monday for a midweek day", () => {
    const result = getMonday(new Date(2026, 1, 12, 8, 0)); // Thu 12 Feb
    expect(result.getDate()).toBe(9);
  });

  it("treats Sunday as the last day of the week", () => {
    const result = getMonday(new Date(2026, 1, 15, 23, 59)); // Sun 15 Feb
    expect(result.getDate()).toBe(9);
  });

  it("does not mutate its argument", () => {
    const input = new Date(2026, 1, 12, 8, 0);
    const before = input.getTime();
    getMonday(input);
    expect(input.getTime()).toBe(before);
  });
});
