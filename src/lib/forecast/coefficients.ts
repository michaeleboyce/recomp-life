/**
 * Constants behind the stored forecasts. Starting values are this app's own
 * assumptions unless the rule that owns them cites a source; the research note
 * docs/research/2026-11-forecast-models.md records where each came from.
 * Rule text reads its numbers from here.
 */

/**
 * Reps on the last set of a T1 lift, as a spread of rep counts.
 * @evidence forecast-reps
 */
export const REPS_MODEL = {
  /** Same-stage results needed inside the window before a trend is fitted. */
  minTrendPoints: 4,
  trendWindowWeeks: 8,
  /** Smallest scatter, as a fraction of the level, when a trend is fitted. */
  trendSdFloorFraction: 0.03,
  /** Smallest scatter with one to three results. */
  fewPointsSdFloorFraction: 0.06,
  /**
   * With one to three results, the share of the bar's weight increase since each
   * result that the lifter is assumed to have grown into: 0 holds the strength level
   * where it was (so a heavier bar means fewer reps), 1 expects the same reps at the
   * heavier weight. A trend fit measures this growth itself; three results cannot.
   */
  fewPointsWeightCarry: 0.5,
  /** Scatter with no results at all. */
  priorSdFraction: 0.1,
  /** With no results, assume this many reps above the target on the last set. */
  priorRepsAboveTarget: 2,
  /** Scatter is multiplied by this after a stage change, a reset or a long break. */
  regimeChangeSdMultiplier: 1.5,
  regimeChangeWeeksOff: 3,
  /** A planned weight this far below the last one lifted, as a fraction, counts as a reset. */
  regimeChangeWeightDrop: 0.1,
  /** Level shift, as a fraction, when today's phase is cutting and the fitted sessions were not. */
  cuttingLevelShift: -0.01,
  /** Level shift, as a fraction, per readiness point above or below the user's usual score. */
  readinessLevelShiftPerPoint: 0.0005,
  /** The readiness shift is kept between these two fractions of the level. */
  readinessLevelShiftMin: -0.03,
  readinessLevelShiftMax: 0.01,
  /**
   * A logged count of r reps means the lifter had between r and r + 1 reps in them,
   * so the chance of "at least k" is read this many reps below k.
   */
  continuityReps: 0.5,
  /**
   * A past last set longer than this counts as this many reps: rep-max formulas get
   * unreliable for long sets, so the extra reps are not turned into strength.
   */
  historyRepsCap: 10,
  /** Largest rep count given its own probability; the last bucket means "this many or more". */
  maxReps: 12,
} as const;

/**
 * Session length from planned sets and rests, corrected by past sessions.
 * @evidence forecast-session-length
 */
export const SESSION_LENGTH_MODEL = {
  secondsPerSet: 45,
  minSessionsForCorrection: 3,
  /** Half-width of the range, as a fraction of the estimate, before there is history. */
  defaultRangeFraction: 0.15,
  /** The correction reads at most this many of the latest finished sessions. */
  recentSessions: 12,
  /** Smallest scatter, as a fraction of the estimate, once there is history. */
  sdFloorFraction: 0.05,
} as const;

/** Estimated max a few weeks ahead, from the lift's projection (`projectE1RM`). */
export const E1RM_HORIZON_MODEL = {
  horizonWeeks: 4,
  /** Results within this many days of the due date are averaged as the outcome. */
  outcomeWindowDays: 7,
  minOutcomeResults: 1,
} as const;

/**
 * Bodyweight a few weeks ahead from the recent trend.
 * @evidence forecast-bodyweight
 */
export const BODYWEIGHT_MODEL = {
  horizonDays: 28,
  fitWindowDays: 28,
  minEntries: 6,
  /** The fitted weigh-ins must cover at least this many days, first to last. */
  minSpanDays: 14,
  /** Smallest scatter of a single weigh-in, as a fraction of bodyweight. */
  sdFloorFraction: 0.004,
  /** Weigh-ins within this many days of the due date are averaged as the outcome. */
  outcomeWindowDays: 3,
  minOutcomeEntries: 2,
} as const;

/**
 * How ranges are sized and when the app widens them.
 * @evidence forecast-calibration
 */
export const CALIBRATION = {
  /** Share of results a range is built to hold. */
  targetCoverage: 0.8,
  /** Standard deviations either side of the point for that share (normal). */
  rangeZ: 1.2816,
  minResolvedForCorrection: 30,
  /** Widen a kind's range when fewer than this share landed inside. */
  widenBelowCoverage: 0.7,
  sdScaleMin: 1,
  sdScaleMax: 2,
  sdScaleStep: 0.15,
} as const;
