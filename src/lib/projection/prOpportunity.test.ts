import { describe, it, expect } from "vitest";
import { calculateE1RM, E1RM_MAX_REPS } from "@/lib/e1rm";
import {
  describePrOpportunity,
  prChance,
  repsToBeat,
} from "./index";
import { PR_CHANCE_RECENT_SETS, PR_STRETCH_MAX_REPS_ABOVE } from "./prOpportunity";

function bruteForce(weight: number, best: number) {
  for (let reps = 1; reps <= E1RM_MAX_REPS; reps++) {
    const e1rm = calculateE1RM(weight, reps);
    if (e1rm !== null && e1rm > best) return { reps, e1rm };
  }
  return null;
}

describe("repsToBeat", () => {
  it("matches a brute-force search over calculateE1RM", () => {
    for (let weight = 45; weight <= 405; weight += 12.5) {
      for (let best = 50; best <= 520; best += 7) {
        expect(repsToBeat(weight, best), `${weight} vs ${best}`).toEqual(
          bruteForce(weight, best)
        );
      }
    }
  });

  it("returns an estimate strictly above the best, and one rep fewer does not beat it", () => {
    const result = repsToBeat(225, 255);
    expect(result).not.toBeNull();
    expect(result!.e1rm).toBeGreaterThan(255);
    expect(result!.e1rm).toBe(calculateE1RM(225, result!.reps));
    const fewer = calculateE1RM(225, result!.reps - 1);
    expect(fewer === null || fewer <= 255).toBe(true);
  });

  it("requires strictly more than the best", () => {
    const tie = calculateE1RM(200, 3)!;
    expect(repsToBeat(200, tie)!.reps).toBeGreaterThan(3);
  });

  it("never answers one rep, because a single is not an estimate", () => {
    expect(repsToBeat(500, 100)).toEqual({ reps: 2, e1rm: calculateE1RM(500, 2) });
  });

  it("is null when even the longest eligible set falls short", () => {
    const ceiling = calculateE1RM(100, E1RM_MAX_REPS)!;
    expect(repsToBeat(100, ceiling)).toBeNull();
    expect(repsToBeat(100, ceiling - 1)).toEqual({ reps: E1RM_MAX_REPS, e1rm: ceiling });
  });

  it("is null for non-positive or non-finite inputs", () => {
    for (const bad of [0, -5, NaN, Infinity, -Infinity]) {
      expect(repsToBeat(bad, 200)).toBeNull();
      expect(repsToBeat(200, bad)).toBeNull();
    }
  });
});

describe("prChance", () => {
  it("is unknown with no history", () => {
    expect(prChance(3, [])).toBe("unknown");
    expect(prChance(3, [NaN])).toBe("unknown");
  });

  it("is likely at or below the median of recent AMRAP sets", () => {
    expect(prChance(5, [4, 5, 6])).toBe("likely");
    expect(prChance(3, [4, 5, 6])).toBe("likely");
  });

  it("is a stretch up to the named margin above the median, unlikely beyond", () => {
    const median = 5;
    const history = [4, 5, 6];
    expect(prChance(median + 1, history)).toBe("stretch");
    expect(prChance(median + PR_STRETCH_MAX_REPS_ABOVE, history)).toBe("stretch");
    expect(prChance(median + PR_STRETCH_MAX_REPS_ABOVE + 1, history)).toBe("unlikely");
  });

  it("uses only the most recent sets (newest last)", () => {
    const old = Array.from({ length: 6 }, () => 12);
    const recent = Array.from({ length: PR_CHANCE_RECENT_SETS }, () => 4);
    expect(prChance(5, [...old, ...recent])).toBe("stretch");
    expect(prChance(4, [...old, ...recent])).toBe("likely");
  });

  it("uses the median, not the mean, so one freak set does not move it", () => {
    expect(prChance(5, [4, 4, 4, 4, 15])).toBe("stretch");
  });

  it("averages the middle pair for an even count", () => {
    // median of 4,4,6,6 is 5
    expect(prChance(5, [4, 6, 4, 6])).toBe("likely");
    expect(prChance(6, [4, 6, 4, 6])).toBe("stretch");
  });
});

describe("describePrOpportunity", () => {
  const base = {
    tier: "T1" as const,
    isAMRAP: true,
    weight: 225,
    bestE1RM: 255,
    recentAMRAPReps: [5, 5, 6],
  };

  it("describes the reps needed, the estimate and the chance", () => {
    const expected = repsToBeat(225, 255)!;
    expect(describePrOpportunity(base)).toEqual({
      repsNeeded: expected.reps,
      e1rmAtRepsNeeded: expected.e1rm,
      bestE1RM: 255,
      chance: prChance(expected.reps, base.recentAMRAPReps),
    });
  });

  it("is null for sets that can never count toward e1RM", () => {
    expect(describePrOpportunity({ ...base, isAMRAP: false })).toBeNull();
    expect(describePrOpportunity({ ...base, tier: "T2" })).toBeNull();
    expect(describePrOpportunity({ ...base, tier: "T3" })).toBeNull();
    expect(describePrOpportunity({ ...base, tier: "warmup" })).toBeNull();
  });

  it("is null without a best e1RM", () => {
    expect(describePrOpportunity({ ...base, bestE1RM: null })).toBeNull();
  });

  it("is null when no eligible rep count beats the best", () => {
    expect(describePrOpportunity({ ...base, weight: 100, bestE1RM: 400 })).toBeNull();
  });

  it("reports unknown chance without AMRAP history", () => {
    expect(describePrOpportunity({ ...base, recentAMRAPReps: [] })!.chance).toBe("unknown");
  });
});
