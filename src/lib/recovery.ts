import type {
  RecoveryStatus,
  RecoveryState,
  TrainingPhase,
  RunLog,
} from "@/types";

/**
 * Returns the more recent of two dates, ignoring nulls.
 * Returns null if both are null.
 */
export function getMostRecent(a: Date | null, b: Date | null): Date | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Rounds a number to the nearest multiple of 5.
 */
function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5;
}

/**
 * Hours since a lift was last trained at which each status begins
 * (maintaining or bulking). The 72-120h "primed" window is a coaching
 * heuristic, not a research finding.
 */
export const RECOVERY_HOURS = {
  ready: 48,
  primed: 72,
  pastPeak: 120,
} as const;

/** Extra hours added to the short-term thresholds while cutting. A heuristic. */
export const CUTTING_RECOVERY_BONUS_HOURS = 12;

/**
 * Days without training a lift before the app treats it as a long break.
 * Shorter gaps cost little or no strength, so nothing is adjusted before this.
 * Shared by the recovery status, weight-decay and inactivity rules.
 */
export const LONG_BREAK_DAYS = 21;

/**
 * Calculates recovery status based on when the exercise was last trained.
 *
 * Thresholds (standard / maintaining or bulking):
 *   < 48h               -> recovering
 *   48h to < 72h        -> ready
 *   72h to < 120h       -> primed
 *   120h to < 21 days   -> ready
 *   >= 21 days          -> detraining (shown to the user as "Long break")
 *
 * Cutting phase adds +12h to the three short-term thresholds. The long-break
 * threshold is the same in every phase.
 *
 * Uses the most recent of the T1 and T2 dates.
 *
 * @evidence recovery-windows
 * @evidence time-off
 */
export function calculateRecoveryStatus(
  lastT1Date: Date | null,
  lastT2Date: Date | null,
  now: Date,
  phase: TrainingPhase
): RecoveryStatus {
  const lastTrained = getMostRecent(lastT1Date, lastT2Date);

  if (!lastTrained) return "detraining";

  const hoursSince =
    (now.getTime() - lastTrained.getTime()) / (1000 * 60 * 60);

  const bonus = phase.mode === "cutting" ? CUTTING_RECOVERY_BONUS_HOURS : 0;

  if (hoursSince < RECOVERY_HOURS.ready + bonus) return "recovering";
  if (hoursSince < RECOVERY_HOURS.primed + bonus) return "ready";
  if (hoursSince < RECOVERY_HOURS.pastPeak + bonus) return "primed";
  if (hoursSince < LONG_BREAK_DAYS * 24) return "ready";
  return "detraining";
}

/**
 * Returns a full RecoveryState object for a given exercise.
 */
export function getRecoveryState(
  exerciseId: string,
  lastT1Date: Date | null,
  lastT2Date: Date | null,
  now: Date,
  phase: TrainingPhase
): RecoveryState {
  const daysSinceLastT1 =
    lastT1Date !== null
      ? (now.getTime() - lastT1Date.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

  const daysSinceLastT2 =
    lastT2Date !== null
      ? (now.getTime() - lastT2Date.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

  const recoveryStatus = calculateRecoveryStatus(
    lastT1Date,
    lastT2Date,
    now,
    phase
  );

  return {
    exerciseId,
    lastTrainedAsT1: lastT1Date,
    lastTrainedAsT2: lastT2Date,
    daysSinceLastT1,
    daysSinceLastT2,
    recoveryStatus,
  };
}

/**
 * Returns true if the lift hasn't been trained for a long break
 * (LONG_BREAK_DAYS or more), when easing back in is worth suggesting.
 */
export function shouldSuggestRampUp(daysSinceLastSession: number): boolean {
  return daysSinceLastSession >= LONG_BREAK_DAYS;
}

/**
 * Generates a ramp-up suggestion with weight rounded to the nearest 5 lbs.
 * Not connected to the UI; the live time-off rule is in weightDecay.ts.
 */
export function generateRampUpSuggestion(lastWorkingWeight: number): {
  rampUpWeight: number;
  message: string;
} {
  const rampUpWeight = roundToNearest5(lastWorkingWeight * 0.85);
  return {
    rampUpWeight,
    message: `It's been a while since you trained this lift. Start with ${rampUpWeight} lbs (85% of your last working weight) and work back up.`,
  };
}

/**
 * Adjusts recovery status based on recent running activity.
 *
 * If a run with perceived effort >= 3 occurred within the last 24 hours,
 * the recovery status is downgraded by one level:
 *   primed -> ready
 *   ready -> recovering
 *
 * "recovering" and "detraining" are not affected.
 */
export function adjustRecoveryForRun(
  baseStatus: RecoveryStatus,
  recentRuns: RunLog[],
  now: Date
): RecoveryStatus {
  const hasImpactfulRecentRun = recentRuns.some((run) => {
    const hoursSinceRun =
      (now.getTime() - run.date.getTime()) / (1000 * 60 * 60);
    return hoursSinceRun <= 24 && run.perceivedEffort >= 3;
  });

  if (!hasImpactfulRecentRun) return baseStatus;

  const downgradeMap: Partial<Record<RecoveryStatus, RecoveryStatus>> = {
    primed: "ready",
    ready: "recovering",
  };

  return downgradeMap[baseStatus] ?? baseStatus;
}
