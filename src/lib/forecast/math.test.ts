// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clamp, mean, median, normalCdf, normalNodes, robustSd, sampleSd } from "./math";

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

describe("normalNodes", () => {
  // E[Z^k] for a standard normal Z: 1, 0, 1, 0, 3, 0, 15, 0, 105.
  const moments = [1, 0, 1, 0, 3, 0, 15, 0, 105, 0, 945];

  it.each([1, 2, 5, 7, 12])("with %i points gives the moments of a bell curve exactly", (n) => {
    const nodes = normalNodes(n);
    expect(nodes).toHaveLength(n);
    // n points integrate polynomials up to degree 2n - 1 exactly.
    for (let k = 0; k < Math.min(2 * n, moments.length); k++) {
      const sum = nodes.reduce((acc, node) => acc + node.weight * node.z ** k, 0);
      expect(sum, `n=${n}, k=${k}`).toBeCloseTo(moments[k], 8);
    }
  });

  it("is symmetric, ordered and has positive weights", () => {
    const nodes = normalNodes(9);
    for (let i = 0; i < nodes.length; i++) {
      expect(nodes[i].weight).toBeGreaterThan(0);
      expect(nodes[i].z).toBeCloseTo(-nodes[nodes.length - 1 - i].z, 12);
      if (i > 0) expect(nodes[i].z).toBeGreaterThan(nodes[i - 1].z);
    }
  });

  it("averages a smooth function of a bell-curve value", () => {
    // E[Phi(a + bZ)] = Phi(a / sqrt(1 + b^2)).
    const nodes = normalNodes(12);
    const value = nodes.reduce((acc, node) => acc + node.weight * normalCdf(0.4 + 0.8 * node.z), 0);
    expect(value).toBeCloseTo(normalCdf(0.4 / Math.sqrt(1 + 0.64)), 5);
  });

  it("returns the same nodes every time", () => {
    expect(normalNodes(7)).toBe(normalNodes(7));
  });
});
