import { describe, expect, it } from "vitest";
import { PERSONAL_MIN_GROUP_SIZE, REPS_ROUNDING_VARIANCE } from "./constants";
import { compareStrata, normalQuantile, tQuantile } from "./stats";

const repeat = (value: number, n: number) => Array.from({ length: n }, () => value);

describe("normalQuantile", () => {
  it("inverts the normal curve", () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 10);
    expect(normalQuantile(0.95)).toBeCloseTo(1.6448536, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.05)).toBeCloseTo(-1.6448536, 6);
  });
});

describe("tQuantile", () => {
  it("matches published t tables", () => {
    expect(tQuantile(0.95, 1)).toBeCloseTo(6.3138, 3);
    expect(tQuantile(0.95, 2)).toBeCloseTo(2.92, 1);
    expect(tQuantile(0.95, 4)).toBeCloseTo(2.1318, 3);
    expect(tQuantile(0.95, 10)).toBeCloseTo(1.8125, 3);
    expect(tQuantile(0.95, 30)).toBeCloseTo(1.6973, 3);
  });

  it("approaches the normal curve for many results", () => {
    expect(tQuantile(0.95, 1e6)).toBeCloseTo(normalQuantile(0.95), 4);
  });
});

describe("compareStrata", () => {
  it("below the minimum in either group gives no numbers, only what is still needed", () => {
    const out = compareStrata([{ exposed: [-1, -2, -1], reference: repeat(0, 9) }]);
    expect(out.result).toBeNull();
    expect(out.exposedCount).toBe(3);
    expect(out.referenceCount).toBe(9);
    expect(out.needed).toEqual({ exposed: PERSONAL_MIN_GROUP_SIZE - 3, reference: 0 });
  });

  it("exactly the minimum in each group is enough", () => {
    const out = compareStrata([
      { exposed: [-2, -1, -2, -1, -2], reference: [0, 0, -1, 0, 0] },
    ]);
    expect(out.result).not.toBeNull();
    expect(out.needed).toEqual({ exposed: 0, reference: 0 });
  });

  it("one stratum is a plain difference of averages with a Welch t range", () => {
    const exposed = [1, 2, 3, 4, 5]; // mean 3, variance 2.5
    const reference = [2, 4, 6, 8, 10]; // mean 6, variance 10
    const out = compareStrata([{ exposed, reference }]);
    const r = out.result!;
    expect(r.exposedMean).toBeCloseTo(3, 10);
    expect(r.referenceMean).toBeCloseTo(6, 10);
    expect(r.difference).toBeCloseTo(-3, 10);
    expect(out.standardError).toBeCloseTo(Math.sqrt(2.5 / 5 + 10 / 5), 10);
    // Welch–Satterthwaite: (0.5 + 2)² / (0.5²/4 + 2²/4)
    expect(out.degreesOfFreedom).toBeCloseTo(6.25 / (0.0625 + 1), 10);
    const half = tQuantile(0.95, out.degreesOfFreedom!) * out.standardError!;
    expect(r.low).toBeCloseTo(-3 - half, 10);
    expect(r.high).toBeCloseTo(-3 + half, 10);
    expect(r.level).toBe(0.9);
  });

  it("a range wholly below zero agrees with the research", () => {
    const out = compareStrata([
      { exposed: [-2, -1, -2, -2, -1, -2], reference: [0, 0, -1, 0, 0, 0, 0] },
    ]);
    expect(out.result!.high).toBeLessThan(0);
    expect(out.result!.verdict).toBe("agrees");
  });

  it("a range wholly above zero points the other way", () => {
    const out = compareStrata([
      { exposed: [0, 0, 1, 0, 1, 0], reference: [-2, -1, -2, -2, -1, -2] },
    ]);
    expect(out.result!.low).toBeGreaterThan(0);
    expect(out.result!.verdict).toBe("opposite");
  });

  it("a range that takes in zero is no clear difference", () => {
    const out = compareStrata([
      { exposed: [-2, 1, 0, -1, 2, -1], reference: [0, -1, 1, 0, -2, 1] },
    ]);
    expect(out.result!.low).toBeLessThan(0);
    expect(out.result!.high).toBeGreaterThan(0);
    expect(out.result!.verdict).toBe("unclear");
  });

  it("identical results still get a range: whole reps carry at least rounding spread", () => {
    const out = compareStrata([{ exposed: repeat(-1, 5), reference: repeat(0, 5) }]);
    expect(out.standardError).toBeCloseTo(
      Math.sqrt(REPS_ROUNDING_VARIANCE / 5 + REPS_ROUNDING_VARIANCE / 5),
      10
    );
    expect(out.result!.high).toBeGreaterThan(out.result!.difference);
  });

  it("compares like with like: a stratum with only one group is left out and counted as unmatched", () => {
    const out = compareStrata([
      { exposed: repeat(-1, 6), reference: repeat(0, 6) },
      { exposed: repeat(-3, 4), reference: [] },
    ]);
    expect(out.exposedCount).toBe(6);
    expect(out.referenceCount).toBe(6);
    expect(out.unmatched).toBe(4);
  });

  it("counts one group while the other has nothing anywhere yet", () => {
    const out = compareStrata([{ exposed: [], reference: repeat(0, 8) }]);
    expect(out.exposedCount).toBe(0);
    expect(out.referenceCount).toBe(8);
    expect(out.unmatched).toBe(0);
    expect(out.needed).toEqual({ exposed: PERSONAL_MIN_GROUP_SIZE, reference: 0 });
    expect(out.result).toBeNull();
  });

  it("asks for both groups when each kind has had only one of them", () => {
    const out = compareStrata([
      { exposed: repeat(0, 40), reference: [] },
      { exposed: [], reference: repeat(0, 30) },
    ]);
    expect(out.exposedCount).toBe(0);
    expect(out.referenceCount).toBe(0);
    expect(out.unmatched).toBe(70);
    expect(out.needed).toEqual({ exposed: PERSONAL_MIN_GROUP_SIZE, reference: PERSONAL_MIN_GROUP_SIZE });
  });

  it("standardises across strata so a mix of strata cannot pass for a difference", () => {
    // Within each stratum the two groups are identical. Pooled, the exposed group would
    // look 1.2 reps better only because more of it sits in the easier stratum.
    const out = compareStrata([
      { exposed: repeat(0, 8), reference: repeat(0, 2) },
      { exposed: repeat(-2, 2), reference: repeat(-2, 8) },
    ]);
    const r = out.result!;
    expect(r.difference).toBeCloseTo(0, 10);
    expect(r.exposedMean).toBeCloseTo(r.referenceMean, 10);
    expect(r.verdict).toBe("unclear");
  });

  it("weights each stratum by its share of the results compared", () => {
    const out = compareStrata([
      { exposed: repeat(-1, 3), reference: repeat(0, 3) }, // 6 of 10, gap -1
      { exposed: repeat(-3, 2), reference: repeat(-1, 2) }, // 4 of 10, gap -2
    ]);
    expect(out.result!.difference).toBeCloseTo(0.6 * -1 + 0.4 * -2, 10);
  });

  it("can test for a higher result too", () => {
    const out = compareStrata(
      [{ exposed: [2, 3, 2, 3, 2], reference: [0, 0, 0, 1, 0] }],
      { researchExpects: "higher" }
    );
    expect(out.result!.verdict).toBe("agrees");
  });
});
