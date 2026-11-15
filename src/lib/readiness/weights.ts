/**
 * Points behind the readiness score. The inputs are research-backed; the
 * points given to each are this app's own weighting.
 * @evidence readiness-score
 */
export const READINESS_WEIGHTS = {
  /** Baseline until the user has enough scores of their own. */
  defaultUsual: 70,
} as const;
