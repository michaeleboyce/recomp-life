// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clamp, mean, median, normalCdf, robustSd, sampleSd } from "./math";

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 10);
    expect(normalCdf(-1.96)).toBeCloseTo(0.024997895148220435, 10);
    expect(normalCdf(3)).toBeCloseTo(0.9986501019683699, 10);
    expect(normalCdf(1.2815515655446004)).toBeCloseTo(0.9, 10);
    expect(normalCdf(-8)).toBeCloseTo(6.220960574271785e-16, 20);
  });

  it("is symmetric and never leaves 0..1", () => {
    for (let z = -40; z <= 40; z += 0.37) {
      const p = normalCdf(z);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p + normalCdf(-z)).toBeCloseTo(1, 12);
    }
  });

  it("never decreases", () => {
    let previous = 0;
    for (let z = -10; z <= 10; z += 0.01) {
      const p = normalCdf(z);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  it("passes NaN through", () => {
    expect(normalCdf(NaN)).toBeNaN();
  });
});

describe("summary helpers", () => {
  it("clamps", () => {
    expect(clamp(5, 1, 2)).toBe(2);
    expect(clamp(-5, 1, 2)).toBe(1);
    expect(clamp(1.5, 1, 2)).toBe(1.5);
  });

  it("takes the mean and the median", () => {
    expect(mean([1, 2, 6])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it("gives the sample standard deviation, 0 for fewer than two values", () => {
    expect(sampleSd([])).toBe(0);
    expect(sampleSd([7])).toBe(0);
    expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it("has a robust standard deviation that one wild value does not move", () => {
    const calm = [0.98, 1, 1.02, 0.99, 1.01, 1, 1.03, 0.97];
    expect(robustSd([...calm, 5])).toBeLessThan(0.05);
    expect(sampleSd([...calm, 5])).toBeGreaterThan(1);
    expect(robustSd([3])).toBe(0);
  });
});
