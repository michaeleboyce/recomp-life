import { describe, expect, it } from "vitest";
import { DAY_MS } from "./dates";
import {
  averageOfLatest,
  currentRate,
  defaultTimeOfDay,
  entryOnDay,
  parseBodyweight,
  startOfDay,
} from "./weighIn";

describe("parseBodyweight", () => {
  it("accepts a number in range, decimals included", () => {
    expect(parseBodyweight("182.4")).toBe(182.4);
    expect(parseBodyweight("50")).toBe(50);
    expect(parseBodyweight("500")).toBe(500);
  });

  it("refuses empty, non-numeric and out-of-range text", () => {
    expect(parseBodyweight("")).toBeNull();
    expect(parseBodyweight("abc")).toBeNull();
    expect(parseBodyweight("49.9")).toBeNull();
    expect(parseBodyweight("500.1")).toBeNull();
  });
});

describe("defaultTimeOfDay", () => {
  it("is morning before noon and evening from noon", () => {
    expect(defaultTimeOfDay(new Date(2026, 0, 5, 11, 59))).toBe("morning");
    expect(defaultTimeOfDay(new Date(2026, 0, 5, 12, 0))).toBe("evening");
  });
});

describe("startOfDay", () => {
  it("is local midnight of the same day", () => {
    expect(startOfDay(new Date(2026, 0, 5, 18, 30))).toEqual(new Date(2026, 0, 5));
  });
});

describe("entryOnDay", () => {
  const log = [
    { id: "a", date: new Date(2026, 0, 4, 8) },
    { id: "b", date: new Date(2026, 0, 5, 7) },
    { id: "c", date: new Date(2026, 0, 5, 20).toISOString() },
  ];

  it("finds the earliest entry on that day, ISO strings included", () => {
    expect(entryOnDay(log, new Date(2026, 0, 5, 23))?.id).toBe("b");
    expect(entryOnDay(log.slice(2), new Date(2026, 0, 5))?.id).toBe("c");
  });

  it("is null when nothing was logged that day", () => {
    expect(entryOnDay(log, new Date(2026, 0, 6))).toBeNull();
  });
});

describe("averageOfLatest", () => {
  it("averages the first entries, or all of them when there are fewer", () => {
    const entries = [{ weight: 180 }, { weight: 182 }, { weight: 184 }];
    expect(averageOfLatest(entries, 2)).toBe(181);
    expect(averageOfLatest(entries, 7)).toBe(182);
  });

  it("is null with no entries", () => {
    expect(averageOfLatest([], 7)).toBeNull();
  });
});

describe("currentRate", () => {
  const now = Date.UTC(2026, 0, 20);

  it("returns the latest rate while it is recent enough", () => {
    expect(currentRate({ t: now - 3 * DAY_MS, v: -0.8 }, now, 3)).toBe(-0.8);
  });

  it("is null when the rate is stale or missing", () => {
    expect(currentRate({ t: now - 3 * DAY_MS - 1, v: -0.8 }, now, 3)).toBeNull();
    expect(currentRate(undefined, now, 3)).toBeNull();
  });
});
