import type { RecoveryStatus, SleepHours, StressLevel } from "@/types";

/**
 * Points behind the readiness score. The inputs are research-backed; the
 * points given to each are this app's own weighting.
 * @evidence readiness-score
 */
export const READINESS_WEIGHTS = {
  /** Baseline until the user has enough scores of their own. */
  defaultUsual: 70,
  /** Earlier scores needed before the user's own usual replaces the default. */
  minPastScores: 5,
  /** The usual is taken from this many of the most recent check-ins. */
  usualWindow: 30,
  /** The score is kept inside this range. */
  minScore: 0,
  maxScore: 100,

  /** Last night's sleep, by the answer given. */
  sleep: { "7+": 0, "5-7": -3, "<5": -6 } satisfies Record<SleepHours, number>,
  /** The stress and energy answer. "low" is the low-energy answer, the rough day. */
  stress: { good: 4, normal: 0, low: -4 } satisfies Record<StressLevel, number>,
  /** How rested the muscles in today's workout are, by recovery status. */
  rest: { recovering: -4, ready: 0, primed: 4, detraining: 0 } satisfies Record<
    RecoveryStatus,
    number
  >,
  /** A recent run before a lower-body day, by the level of the run check. */
  run: { advisory: -2, strong: -4 },
  /** Another hard session (yoga, a ride, a hike) in the last day. */
  hardActivity: -2,

  /** Soreness where today's workout loads the body: points per severity step (1 to 5). */
  sorenessPerSeverity: -1,
  /** The most soreness can take. */
  sorenessFloor: -4,
  /** Hours a soreness entry counts for. */
  sorenessWindowHours: 72,
  /** Pain where today's workout loads the body: points per severity step (1 to 5). */
  painPerSeverity: -2,
  /** The most pain can take. */
  painFloor: -8,
  /** Days a pain entry counts for. */
  painWindowDays: 7,
} as const;

/** Points as shown to the user: "+4", "−3", "0". */
export function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return "0";
}
