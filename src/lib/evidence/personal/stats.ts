// The comparison behind "Your own numbers": two groups of results, a gap between their
// averages and a range around it. Pure.
import { mean, normalCdf } from "@/lib/forecast/math";
import {
  PERSONAL_INTERVAL_LEVEL,
  PERSONAL_MIN_GROUP_SIZE,
  REPS_ROUNDING_VARIANCE,
} from "./constants";
import type { PersonalResult, PersonalVerdict } from "./types";

/** The value the standard normal curve has a share `p` of its area below. */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  // Bisection on the normal curve, which is accurate to about 15 digits.
  let lo = -40;
  let hi = 40;
  for (let i = 0; i < 200 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The value a Student t curve with `df` degrees of freedom has a share `p` of its area
 * below. One degree of freedom is exact (the Cauchy curve); more use the Cornish–Fisher
 * expansion around the normal value (Abramowitz and Stegun 26.7.5), within 0.01 of
 * published tables from two degrees of freedom up.
 */
export function tQuantile(p: number, df: number): number {
  if (!(df > 1)) return Math.tan(Math.PI * (p - 0.5));
  const z = normalQuantile(p);
  const z2 = z * z;
  const g1 = (z2 * z + z) / 4;
  const g2 = (5 * z2 * z2 * z + 16 * z2 * z + 3 * z) / 96;
  const g3 = (3 * z2 * z2 * z2 * z + 19 * z2 * z2 * z + 17 * z2 * z - 15 * z) / 384;
  const g4 =
    (79 * z2 * z2 * z2 * z2 * z +
      776 * z2 * z2 * z2 * z +
      1482 * z2 * z2 * z -
      1920 * z2 * z -
      945 * z) /
    92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

/** Results of one kind (for rest, one tier), split into the two groups. */
export interface Stratum {
  /** The group the research says should do worse. */
  exposed: number[];
  reference: number[];
}

export interface StrataComparison {
  /**
   * Results counted toward the minimum: those in a stratum where the other group has a
   * result too, or, while the other group has none anywhere, all of them (they are
   * waiting for the first one). When numbers are shown these are exactly the results
   * compared.
   */
  exposedCount: number;
  referenceCount: number;
  /**
   * Results left out because their stratum has none of the other group while another
   * stratum does: there is nothing of their own kind to compare them with.
   */
  unmatched: number;
  needed: { exposed: number; reference: number };
  /** Null below the minimum sample. */
  result: PersonalResult | null;
  /** The standard error of the difference; null below the minimum. */
  standardError: number | null;
  /** Welch–Satterthwaite degrees of freedom; null below the minimum. */
  degreesOfFreedom: number | null;
}

export interface CompareOptions {
  /** Which way the research says the exposed group goes. Default "lower". */
  researchExpects?: "lower" | "higher";
  minPerGroup?: number;
  level?: number;
}

function variance(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

/**
 * Compares two groups of results, stratum by stratum, so results are only set against
 * others of the same kind.
 *
 * - Only strata where both groups have a result are compared. A result in a stratum
 *   without the other group is `unmatched`, unless the other group has no results
 *   anywhere yet: then it counts toward the minimum while it waits for one.
 * - Below `minPerGroup` counted results in either group there are no numbers.
 * - Each group's average is standardised: the average within each stratum, weighted
 *   by that stratum's share of all counted results. With one stratum these are plain
 *   averages. The difference is exposed minus reference.
 * - The range is a Welch t interval: each group-and-stratum cell keeps its own spread
 *   (at least REPS_ROUNDING_VARIANCE; a cell of one borrows the pooled spread), the
 *   standard error adds the cells' weighted variances, and the degrees of freedom come
 *   from the Welch–Satterthwaite formula.
 * - Verdict: "agrees" when the whole range is on the side the research expects,
 *   "opposite" when the whole range is on the other side, "unclear" otherwise.
 */
export function compareStrata(strata: Stratum[], options: CompareOptions = {}): StrataComparison {
  const minPerGroup = options.minPerGroup ?? PERSONAL_MIN_GROUP_SIZE;
  const level = options.level ?? PERSONAL_INTERVAL_LEVEL;
  const expects = options.researchExpects ?? "lower";

  const used = strata.filter((s) => s.exposed.length > 0 && s.reference.length > 0);
  const anyExposed = strata.some((s) => s.exposed.length > 0);
  const anyReference = strata.some((s) => s.reference.length > 0);
  const exposedCount = strata
    .filter((s) => s.reference.length > 0 || !anyReference)
    .reduce((sum, s) => sum + s.exposed.length, 0);
  const referenceCount = strata
    .filter((s) => s.exposed.length > 0 || !anyExposed)
    .reduce((sum, s) => sum + s.reference.length, 0);
  const unmatched =
    strata.reduce((sum, s) => sum + s.exposed.length + s.reference.length, 0) -
    exposedCount -
    referenceCount;
  const needed = {
    exposed: Math.max(0, minPerGroup - exposedCount),
    reference: Math.max(0, minPerGroup - referenceCount),
  };
  const empty = { exposedCount, referenceCount, unmatched, needed };
  if (needed.exposed > 0 || needed.reference > 0) {
    return { ...empty, result: null, standardError: null, degreesOfFreedom: null };
  }

  const total = exposedCount + referenceCount;
  const cells = used.flatMap((s) => {
    const share = (s.exposed.length + s.reference.length) / total;
    return [
      { share, values: s.exposed, exposed: true },
      { share, values: s.reference, exposed: false },
    ];
  });

  // Pooled spread over every cell with two or more results, for cells of one.
  let pooledSum = 0;
  let pooledDf = 0;
  for (const cell of cells) {
    if (cell.values.length < 2) continue;
    pooledSum += variance(cell.values) * (cell.values.length - 1);
    pooledDf += cell.values.length - 1;
  }
  const pooled = Math.max(pooledDf > 0 ? pooledSum / pooledDf : 0, REPS_ROUNDING_VARIANCE);

  let exposedMean = 0;
  let referenceMean = 0;
  let sumC = 0;
  let sumC2 = 0;
  for (const cell of cells) {
    const n = cell.values.length;
    const cellMean = mean(cell.values);
    if (cell.exposed) exposedMean += cell.share * cellMean;
    else referenceMean += cell.share * cellMean;
    const v = n >= 2 ? Math.max(variance(cell.values), REPS_ROUNDING_VARIANCE) : pooled;
    const c = (cell.share * cell.share * v) / n;
    sumC += c;
    sumC2 += (c * c) / Math.max(1, n - 1);
  }

  const difference = exposedMean - referenceMean;
  const standardError = Math.sqrt(sumC);
  const degreesOfFreedom = (sumC * sumC) / sumC2;
  const half = tQuantile((1 + level) / 2, degreesOfFreedom) * standardError;
  const low = difference - half;
  const high = difference + half;

  let verdict: PersonalVerdict = "unclear";
  const below = high < 0;
  const above = low > 0;
  if (below || above) {
    verdict = below === (expects === "lower") ? "agrees" : "opposite";
  }

  return {
    ...empty,
    result: { exposedMean, referenceMean, difference, low, high, level, verdict },
    standardError,
    degreesOfFreedom,
  };
}

/** The sentence that says what the range is, for every rule's method text. */
export function rangeSentence(): string {
  return `The range is a rough ${Math.round(PERSONAL_INTERVAL_LEVEL * 100)}% interval for the gap between the two averages (a Welch t interval, which lets each group have its own spread). Numbers appear once each group has at least ${PERSONAL_MIN_GROUP_SIZE}.`;
}
