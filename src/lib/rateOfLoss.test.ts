import { describe, it, expect } from "vitest";
import { calculateWeeklyRateOfLoss, getStallProtocolSuggestion } from "./rateOfLoss";

/**
 * Helper: generate daily weigh-in entries starting from a base date,
 * linearly interpolating from `startWeight` to `endWeight`.
 */
function makeEntries(
  startWeight: number,
  endWeight: number,
  days: number,
  startDate: Date = new Date(2026, 0, 1)
): { date: Date; weight: number }[] {
  const entries: { date: Date; weight: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const weight =
      startWeight + ((endWeight - startWeight) * i) / Math.max(1, days - 1);
    entries.push({ date, weight: Math.round(weight * 100) / 100 });
  }
  return entries;
}

describe("calculateWeeklyRateOfLoss", () => {
  it("returns null when fewer than 7 entries", () => {
    const entries = makeEntries(200, 199, 6);
    expect(calculateWeeklyRateOfLoss(entries)).toBeNull();
  });

  it("classifies ~0.7% BW/week loss as green zone", () => {
    // 200 lbs person losing ~1.4 lbs per week = 0.7%
    // Over 14 days that's ~2.8 lbs total
    const entries = makeEntries(200, 197.2, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("green");
    expect(result!.percentPerWeek).toBeGreaterThanOrEqual(0.5);
    expect(result!.percentPerWeek).toBeLessThanOrEqual(1.0);
  });

  it("classifies ~1.3% BW/week loss as yellow zone", () => {
    // 200 lbs person losing ~2.6 lbs per week = 1.3%
    // Over 14 days that's ~5.2 lbs total
    const entries = makeEntries(200, 194.8, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("yellow");
    expect(result!.percentPerWeek).toBeGreaterThan(1.0);
    expect(result!.percentPerWeek).toBeLessThanOrEqual(1.5);
  });

  it("classifies ~1.8% BW/week loss as red zone", () => {
    // 200 lbs person losing ~3.6 lbs per week = 1.8%
    // Over 14 days that's ~7.2 lbs total
    const entries = makeEntries(200, 192.8, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("red");
    expect(result!.percentPerWeek).toBeGreaterThan(1.5);
  });

  it("classifies <0.25% BW/week loss as stall", () => {
    // 200 lbs person losing ~0.2% per week = 0.4 lbs per week
    // Over 14 days that's ~0.8 lbs total
    const entries = makeEntries(200, 199.2, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("stall");
    expect(result!.percentPerWeek).toBeLessThan(0.25);
  });

  it("classifies flat weight as stall", () => {
    const entries = makeEntries(200, 200, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("stall");
    expect(result!.lbsPerWeek).toBe(0);
  });

  it("classifies weight gain as stall", () => {
    const entries = makeEntries(200, 202, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("stall");
    // Negative lbs/week means gaining
    expect(result!.lbsPerWeek).toBeLessThan(0);
  });

  it("returns lbsPerWeek and percentPerWeek as numbers", () => {
    const entries = makeEntries(200, 197, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(typeof result!.lbsPerWeek).toBe("number");
    expect(typeof result!.percentPerWeek).toBe("number");
  });

  it("handles custom windowDays", () => {
    // 21-day window, 21 entries
    const entries = makeEntries(200, 197, 21);
    const result = calculateWeeklyRateOfLoss(entries, 21);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("green");
  });

  it("returns null when all entries are within insufficient data", () => {
    const entries = makeEntries(200, 199, 5);
    expect(calculateWeeklyRateOfLoss(entries)).toBeNull();
  });
});

describe("getStallProtocolSuggestion", () => {
  it("returns null when percentPerWeek >= 0.25", () => {
    expect(getStallProtocolSuggestion(0.5, 0.25, 5)).toBeNull();
  });

  it("returns null when stall is fewer than 3 consecutive weeks", () => {
    expect(getStallProtocolSuggestion(0.1, 0.05, 2)).toBeNull();
  });

  it("suggests increasing steps for 3-week stall", () => {
    const result = getStallProtocolSuggestion(0.1, 0.05, 3);
    expect(result).not.toBeNull();
    expect(result).toContain("steps");
    expect(result).toContain("2,000");
  });

  it("suggests increasing steps for 4-week stall", () => {
    const result = getStallProtocolSuggestion(0.1, 0.05, 4);
    expect(result).not.toBeNull();
    expect(result).toContain("steps");
  });

  it("suggests calorie reduction for 5+ week stall", () => {
    const result = getStallProtocolSuggestion(0.1, 0.05, 5);
    expect(result).not.toBeNull();
    expect(result).toContain("100-150 calories");
  });

  it("suggests calorie reduction for very long stalls", () => {
    const result = getStallProtocolSuggestion(0.0, 0.0, 8);
    expect(result).not.toBeNull();
    expect(result).toContain("reducing daily intake");
  });
});
