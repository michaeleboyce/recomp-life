// Small numeric helpers for the forecast models. Pure.

/**
 * Standard normal cumulative distribution: the chance a standard normal value is at
 * or below `z`. Hart's rational approximation as given by West (2005), accurate to
 * about 15 digits, so differences of two tails stay exact enough to sum to 1.
 */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  const x = Math.abs(z);
  let tail: number;
  if (x > 37) {
    tail = 0;
  } else {
    const e = Math.exp((-x * x) / 2);
    if (x < 7.07106781186547) {
      let top = 3.52624965998911e-2 * x + 0.700383064443688;
      top = top * x + 6.37396220353165;
      top = top * x + 33.912866078383;
      top = top * x + 112.079291497871;
      top = top * x + 221.213596169931;
      top = top * x + 220.206867912376;
      let bottom = 8.83883476483184e-2 * x + 1.75566716318264;
      bottom = bottom * x + 16.064177579207;
      bottom = bottom * x + 86.7807322029461;
      bottom = bottom * x + 296.564248779674;
      bottom = bottom * x + 637.333633378831;
      bottom = bottom * x + 793.826512519948;
      bottom = bottom * x + 440.413735824752;
      tail = (e * top) / bottom;
    } else {
      let b = x + 0.65;
      b = x + 4 / b;
      b = x + 3 / b;
      b = x + 2 / b;
      b = x + 1 / b;
      tail = e / b / 2.506628274631;
    }
  }
  return z > 0 ? 1 - tail : tail;
}

/** A point of a quadrature for the standard bell curve: E[f(Z)] = sum of weight x f(z). */
export interface NormalNode {
  z: number;
  weight: number;
}

const nodeCache = new Map<number, readonly NormalNode[]>();

/**
 * Gauss-Hermite points for averaging a function over a standard bell curve, `n`
 * points from the lowest z up; the weights sum to 1. Exact for polynomials up to
 * degree 2n - 1. The roots are found by Newton's method on the normalised Hermite
 * recurrence (Press et al., Numerical Recipes, `gauher`) and kept, so a second call
 * returns the same array.
 */
export function normalNodes(n: number): readonly NormalNode[] {
  const cached = nodeCache.get(n);
  if (cached) return cached;
  // Physicists' points x and weights w for the weight exp(-x^2).
  const x = new Array<number>(n).fill(0);
  const w = new Array<number>(n).fill(0);
  const piToMinusQuarter = 0.7511255444649425;
  const m = Math.floor((n + 1) / 2);
  let z = 0;
  for (let i = 0; i < m; i++) {
    if (i === 0) z = Math.sqrt(2 * n + 1) - 1.85575 * Math.pow(2 * n + 1, -0.16667);
    else if (i === 1) z -= (1.14 * Math.pow(n, 0.426)) / z;
    else if (i === 2) z = 1.86 * z - 0.86 * x[0];
    else if (i === 3) z = 1.91 * z - 0.91 * x[1];
    else z = 2 * z - x[i - 2];
    let derivative = 1;
    for (let iteration = 0; iteration < 100; iteration++) {
      let p1 = piToMinusQuarter;
      let p2 = 0;
      for (let j = 0; j < n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = z * Math.sqrt(2 / (j + 1)) * p2 - Math.sqrt(j / (j + 1)) * p3;
      }
      derivative = Math.sqrt(2 * n) * p2;
      const previous = z;
      z = previous - p1 / derivative;
      if (Math.abs(z - previous) <= 1e-14) break;
    }
    x[i] = z;
    x[n - 1 - i] = -z;
    w[i] = 2 / (derivative * derivative);
    w[n - 1 - i] = w[i];
  }
  const total = w.reduce((sum, v) => sum + v, 0);
  const nodes = x
    .map((xi, i) => ({ z: Math.SQRT2 * xi, weight: w[i] / total }))
    .sort((a, b) => a.z - b.z);
  // An odd count has a point at exactly 0.
  if (n % 2 === 1) nodes[(n - 1) / 2].z = 0;
  nodeCache.set(n, nodes);
  return nodes;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Middle value (the mean of the middle pair for an even count). NaN when empty. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sample standard deviation (n - 1 denominator); 0 with fewer than two values. */
export function sampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const ss = values.reduce((sum, v) => sum + (v - m) * (v - m), 0);
  return Math.sqrt(ss / (values.length - 1));
}

/**
 * A standard deviation that one wild value cannot inflate: 1.4826 x the median
 * distance from the median (equal to the usual one for bell-shaped data).
 */
export function robustSd(values: number[]): number {
  if (values.length < 2) return 0;
  const centre = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - centre)));
}
