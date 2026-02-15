import { describe, it, expect } from "vitest";
import { getExpiredPainEntries } from "./painAutoClear";
import type { PainSorenessEntry } from "@/types";

function daysAgo(days: number, from: Date = new Date(2026, 1, 14)): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

function makeEntry(
  overrides: Partial<PainSorenessEntry> = {}
): PainSorenessEntry {
  return {
    id: Math.random().toString(36).slice(2),
    date: new Date(2026, 1, 1),
    region: "left_knee",
    sensation: "pain",
    severity: 3,
    ...overrides,
  };
}

const NOW = new Date(2026, 1, 14);

describe("getExpiredPainEntries", () => {
  it("returns pain entry older than 7 days", () => {
    const entry = makeEntry({ date: daysAgo(8, NOW) });
    const result = getExpiredPainEntries([entry], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(entry.id);
  });

  it("does NOT return pain entry only 5 days old", () => {
    const entry = makeEntry({ date: daysAgo(5, NOW) });
    const result = getExpiredPainEntries([entry], NOW);
    expect(result).toHaveLength(0);
  });

  it("does NOT return soreness entry even if 10 days old", () => {
    const entry = makeEntry({
      date: daysAgo(10, NOW),
      sensation: "soreness",
    });
    const result = getExpiredPainEntries([entry], NOW);
    expect(result).toHaveLength(0);
  });

  it("returns only old pain entries from a mixed set", () => {
    const entries: PainSorenessEntry[] = [
      makeEntry({ id: "old-pain", date: daysAgo(9, NOW), sensation: "pain" }),
      makeEntry({ id: "new-pain", date: daysAgo(3, NOW), sensation: "pain" }),
      makeEntry({
        id: "old-soreness",
        date: daysAgo(12, NOW),
        sensation: "soreness",
      }),
      makeEntry({
        id: "new-soreness",
        date: daysAgo(2, NOW),
        sensation: "soreness",
      }),
    ];

    const result = getExpiredPainEntries(entries, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("old-pain");
  });

  it("does NOT return pain entry exactly 7 days old (boundary)", () => {
    const entry = makeEntry({ date: daysAgo(7, NOW) });
    const result = getExpiredPainEntries([entry], NOW);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for no entries", () => {
    const result = getExpiredPainEntries([], NOW);
    expect(result).toHaveLength(0);
  });

  it("respects custom expiryDays parameter", () => {
    const entry = makeEntry({ date: daysAgo(4, NOW) });
    // With 3-day expiry, a 4-day-old entry should be returned
    const result = getExpiredPainEntries([entry], NOW, 3);
    expect(result).toHaveLength(1);
  });

  it("does NOT return pain entry within custom expiryDays", () => {
    const entry = makeEntry({ date: daysAgo(4, NOW) });
    // With 5-day expiry, a 4-day-old entry should NOT be returned
    const result = getExpiredPainEntries([entry], NOW, 5);
    expect(result).toHaveLength(0);
  });
});
