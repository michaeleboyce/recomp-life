import { describe, it, expect } from "vitest";
import { calculateE1RM, E1RM_MAX_REPS, E1RM_MAX_REPS_IN_RESERVE } from "@/lib/e1rm";
import { REPS_IN_RESERVE_OPTIONS, RIR_ESTIMATE } from "@/lib/effort";
import {
  describePrOpportunity,
  prChance,
  repsToBeat,
} from "./index";
import {
  PR_CHANCE_RECENT_SETS,
  PR_LIKELY_MIN_CHANCE,
  PR_STRETCH_MAX_REPS_ABOVE,
  PR_STRETCH_MIN_CHANCE,
  prChanceFromProbability,
} from "./prOpportunity";

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

  it("with a reps-left answer, counts the reps left as the estimate does", () => {
    for (const answer of REPS_IN_RESERVE_OPTIONS) {
      for (let weight = 95; weight <= 315; weight += 20) {
        for (let best = 100; best <= 420; best += 9) {
          let expected: { reps: number; e1rm: number } | null = null;
          for (let reps = 1; reps <= E1RM_MAX_REPS && !expected; reps++) {
            const e1rm = calculateE1RM(weight, reps, answer);
            if (e1rm !== null && e1rm > best) expected = { reps, e1rm };
          }
          expect(repsToBeat(weight, best, answer), `${weight} vs ${best} at ${answer}`).toEqual(expected);
        }
      }
    }
    // Six reps all-out, four with 1-2 left, three with 3+ left.
    expect(repsToBeat(200, 236)!.reps).toBe(6);
    expect(repsToBeat(200, 236, "1-2")!.reps).toBe(4);
    expect(repsToBeat(200, 236, "3+")!.reps).toBe(3);
    expect(repsToBeat(200, 236, "0")).toEqual(repsToBeat(200, 236));
    expect(repsToBeat(200, 236, null)).toEqual(repsToBeat(200, 236));
  });

  it("takes a numeric credit equal to an answer's the same as the answer", () => {
    for (const answer of REPS_IN_RESERVE_OPTIONS) {
      expect(repsToBeat(200, 236, RIR_ESTIMATE[answer])).toEqual(repsToBeat(200, 236, answer));
    }
  });

  it("with a fractional credit, still names a whole number of reps, never a single", () => {
    // A median of credits can fall between answers, e.g. 0.75 or 2.25.
    for (const credit of [0.75, 2.25]) {
      for (let weight = 95; weight <= 315; weight += 20) {
        for (let best = 100; best <= 420; best += 9) {
          const result = repsToBeat(weight, best, credit);
          if (result) {
            expect(Number.isInteger(result.reps)).toBe(true);
            expect(result.reps).toBeGreaterThanOrEqual(2);
            expect(result.e1rm).toBeGreaterThan(best);
          }
        }
      }
    }
    // 200 x (1 + 5.75 / 30) = 238.3: five reps at a 0.75 credit.
    expect(repsToBeat(200, 236, 0.75)).toEqual({ reps: 5, e1rm: 238 });
  });

  it("clamps a numeric credit to 0..E1RM_MAX_REPS_IN_RESERVE", () => {
    expect(repsToBeat(200, 236, 10)).toEqual(repsToBeat(200, 236, E1RM_MAX_REPS_IN_RESERVE));
    expect(repsToBeat(200, 236, -2)).toEqual(repsToBeat(200, 236));
    expect(repsToBeat(200, 236, NaN)).toEqual(repsToBeat(200, 236));
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

describe("prChanceFromProbability", () => {
  it("words a forecast chance as likely, a stretch or unlikely", () => {
    expect(prChanceFromProbability(1)).toBe("likely");
    expect(prChanceFromProbability(PR_LIKELY_MIN_CHANCE)).toBe("likely");
    expect(prChanceFromProbability(PR_LIKELY_MIN_CHANCE - 0.001)).toBe("stretch");
    expect(prChanceFromProbability(PR_STRETCH_MIN_CHANCE)).toBe("stretch");
    expect(prChanceFromProbability(PR_STRETCH_MIN_CHANCE - 0.001)).toBe("unlikely");
    expect(prChanceFromProbability(0)).toBe("unlikely");
  });

  it("is unknown without a usable chance", () => {
    expect(prChanceFromProbability(null)).toBe("unknown");
    expect(prChanceFromProbability(undefined)).toBe("unknown");
    expect(prChanceFromProbability(NaN)).toBe("unknown");
  });
});

describe("describePrOpportunity with a forecast chance", () => {
  const base = {
    tier: "T1" as const,
    isAMRAP: true,
    weight: 225,
    bestE1RM: 255,
    recentAMRAPReps: [5, 5, 6],
  };

  it("takes the category from the chance and returns the chance", () => {
    // The recent-median rule alone would call this likely.
    expect(describePrOpportunity(base)!.chance).toBe("likely");
    const low = describePrOpportunity({ ...base, probability: 0.1 })!;
    expect(low.chance).toBe("unlikely");
    expect(low.probability).toBe(0.1);
    expect(describePrOpportunity({ ...base, probability: 0.9 })!.chance).toBe("likely");
    expect(describePrOpportunity({ ...base, probability: 0.3 })!.chance).toBe("stretch");
  });

  it("works without any recent reps when a chance is given", () => {
    const result = describePrOpportunity({ ...base, recentAMRAPReps: [], probability: 0.7 })!;
    expect(result.chance).toBe("likely");
    expect(result.repsNeeded).toBe(repsToBeat(225, 255)!.reps);
  });

  it("falls back to the recent-median rule when the chance is missing", () => {
    for (const probability of [undefined, null, NaN]) {
      const result = describePrOpportunity({ ...base, probability })!;
      expect(result.chance).toBe(prChance(result.repsNeeded, base.recentAMRAPReps));
      expect("probability" in result).toBe(false);
    }
  });
});
