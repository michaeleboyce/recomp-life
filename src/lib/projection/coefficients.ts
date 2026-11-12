// The numbers the e1RM projection model runs on. Owned by the `projection-research`
// package: the KEYS are a contract (src/lib/projection reads them), the VALUES below are
// provisional placeholders until that package replaces each one with a value drawn
// from cited research, tags it with its evidence rule, and grades its strength.
//
// Phase multipliers are relative to "bulking" = 1.

export const PROJECTION_COEFFICIENTS = {
  /**
   * Diminishing returns on weekly hard sets for the lift's main muscle group:
   * rate multiplier = (scenario sets / baseline sets) ^ volumeExponent.
   */
  volumeExponent: 0.4,
  /**
   * Diminishing returns on sessions per week for the lift, at equal weekly sets:
   * rate multiplier = (scenario sessions / baseline sessions) ^ frequencyExponent.
   */
  frequencyExponent: 0.2,
  /** Bounds on the combined volume x frequency multiplier. */
  minDoseMultiplier: 0.4,
  maxDoseMultiplier: 1.6,
  /** Rate multiplier by training phase, relative to bulking. */
  phaseMultiplier: { bulking: 1, maintaining: 0.85, cutting: 0.6 },
  /** Share of the previous week's rate that remains each week (gains slow over time). */
  weeklyRateRetention: 0.97,
  /**
   * Weekly sets for a muscle group beyond which extra sets add nothing in the model
   * (and the screen warns about recovery instead).
   */
  weeklySetsCeiling: 20,
  /** placeholder; set by projection-research */
  relatedSetTransfer: 0.5,
  /** How fast the range widens: residual SD x (1 + bandGrowth x sqrt(weeks ahead)). */
  bandGrowth: 0.5,
  /** Width of the range in residual standard deviations (about a 68% band at 1). */
  bandWidthSd: 1,
} as const;

export type ProjectionCoefficients = typeof PROJECTION_COEFFICIENTS;
