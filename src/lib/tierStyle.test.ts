import { describe, it, expect } from "vitest";
import { tierStyle } from "./tierStyle";
import type { Tier } from "@/types";

const CASES: [Tier, string, string][] = [
  ["T1", "T1", "tier-t1"],
  ["T2", "T2", "tier-t2"],
  ["T3", "T3", "tier-t3"],
  ["accessory", "Accessory", "tier-accessory"],
  ["warmup", "Warm-up", "tier-warmup"],
];

describe("tierStyle", () => {
  it.each(CASES)("%s maps to label %s and token %s", (tier, label, token) => {
    const s = tierStyle(tier);
    expect(s.label).toBe(label);
    expect(s.solid).toContain(`bg-${token}`);
    expect(s.soft).toContain(`bg-${token}-soft`);
    expect(s.soft).toContain(`text-${token}`);
    expect(s.text).toBe(`text-${token}`);
    expect(s.border).toBe(`border-${token}`);
    expect(s.dot).toBe(`bg-${token}`);
    expect(s.dotMuted).toBe(`bg-${token}-soft`);
  });

  it("uses no raw palette classes", () => {
    for (const [tier] of CASES) {
      expect(JSON.stringify(tierStyle(tier))).not.toMatch(
        /-(red|orange|blue|violet|slate)-\d/
      );
    }
  });
});
