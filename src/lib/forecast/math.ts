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
