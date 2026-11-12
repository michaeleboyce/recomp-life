import { describe, it, expect } from "vitest";
import {
  calculateWeeklyRateOfLoss,
  collapseToDailyMeans,
  getStallProtocolSuggestion,
} from "./rateOfLoss";

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

  it("classifies a clear weight gain as gaining, not a stall", () => {
    const entries = makeEntries(200, 202, 14);
    const result = calculateWeeklyRateOfLoss(entries);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("gaining");
    // Negative lbs/week means gaining
    expect(result!.lbsPerWeek).toBeLessThan(0);
    expect(result!.percentPerWeek).toBeLessThanOrEqual(-0.25);
  });

  it("a gain under 0.25% a week is still within the stall band", () => {
    // +0.4 lb over 14 days on 200 lb: about +0.1% a week.
    const result = calculateWeeklyRateOfLoss(makeEntries(200, 200.4, 14));
    expect(result!.zone).toBe("stall");
    expect(result!.lbsPerWeek).toBeLessThan(0);
  });

  it("a fast gain is gaining, never yellow, green or red", () => {
    expect(calculateWeeklyRateOfLoss(makeEntries(200, 203, 14))!.zone).toBe("gaining");
    expect(calculateWeeklyRateOfLoss(makeEntries(200, 208, 14))!.zone).toBe("gaining");
  });

  it("treats two weigh-ins on one day as one day (their mean)", () => {
    const daily = makeEntries(200, 197.2, 14);
    // A second, heavier evening weigh-in on four of the early days. Counted as
    // separate days they would push later days into the first half.
    const withRepeats = [...daily];
    for (const i of [0, 1, 2, 3]) {
      const evening = new Date(daily[i].date);
      evening.setHours(21);
      withRepeats.push({ date: evening, weight: daily[i].weight + 2 });
    }
    const expected = daily.map((e, i) => (i <= 3 ? { ...e, weight: e.weight + 1 } : e));
    expect(calculateWeeklyRateOfLoss(withRepeats)).toEqual(calculateWeeklyRateOfLoss(expected));
  });

  it("needs 7 separate days, not 7 entries", () => {
    const fourDays = makeEntries(200, 199, 4);
    const doubled = fourDays.flatMap((e) => {
      const evening = new Date(e.date);
      evening.setHours(20);
      return [e, { date: evening, weight: e.weight }];
    });
    expect(doubled).toHaveLength(8);
    expect(calculateWeeklyRateOfLoss(doubled)).toBeNull();
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

describe("collapseToDailyMeans", () => {
  it("returns one entry per local day, oldest first, with the day's mean", () => {
    const out = collapseToDailyMeans([
      { date: new Date(2026, 0, 2, 7), weight: 200 },
      { date: new Date(2026, 0, 1, 7), weight: 201 },
      { date: new Date(2026, 0, 2, 22), weight: 202 },
      { date: new Date(2026, 0, 1, 23, 59), weight: 203 },
    ]);
    expect(out).toEqual([
      { date: new Date(2026, 0, 1), weight: 202 },
      { date: new Date(2026, 0, 2), weight: 201 },
    ]);
  });

  it("accepts ISO strings from synced rows and drops invalid dates", () => {
    const out = collapseToDailyMeans([
      { date: new Date(2026, 0, 3, 8).toISOString() as unknown as Date, weight: 199 },
      { date: new Date("nope"), weight: 150 },
    ]);
    expect(out).toEqual([{ date: new Date(2026, 0, 3), weight: 199 }]);
  });

  it("does not mutate its input", () => {
    const input = [
      { date: new Date(2026, 0, 2), weight: 200 },
      { date: new Date(2026, 0, 1), weight: 201 },
    ];
    const copy = structuredClone(input);
    collapseToDailyMeans(input);
    expect(input).toEqual(copy);
  });
});
