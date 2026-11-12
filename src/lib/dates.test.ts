import { describe, it, expect } from "vitest";
import { getMonday, calendarDaysBetween, formatDaysAgo } from "./dates";

describe("calendarDaysBetween", () => {
  it("is 0 within the same calendar day", () => {
    expect(
      calendarDaysBetween(new Date(2026, 1, 10, 0, 5), new Date(2026, 1, 10, 23, 55))
    ).toBe(0);
  });

  it("counts midnights crossed, not 24-hour periods", () => {
    // 19 hours apart but on consecutive days
    expect(
      calendarDaysBetween(new Date(2026, 1, 10, 18, 0), new Date(2026, 1, 11, 13, 0))
    ).toBe(1);
  });

  it("handles longer gaps", () => {
    expect(
      calendarDaysBetween(new Date(2026, 1, 3, 9, 0), new Date(2026, 1, 10, 8, 0))
    ).toBe(7);
  });
});

describe("formatDaysAgo", () => {
  const now = new Date(2026, 1, 11, 13, 0);

  it("says Never when there is no date", () => {
    expect(formatDaysAgo(undefined, now)).toBe("Never");
    expect(formatDaysAgo(null, now)).toBe("Never");
  });

  it("says Today, Yesterday, then N days ago", () => {
    expect(formatDaysAgo(new Date(2026, 1, 11, 7, 0), now)).toBe("Today");
    expect(formatDaysAgo(new Date(2026, 1, 10, 18, 0), now)).toBe("Yesterday");
    expect(formatDaysAgo(new Date(2026, 1, 8, 18, 0), now)).toBe("3 days ago");
  });
});

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
