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
 * Calculates recovery status based on when the exercise was last trained.
 *
 * Thresholds (standard / maintaining or bulking):
 *   < 48h          -> recovering
 *   48h to < 72h   -> ready
 *   72h to < 120h  -> primed
 *   120h to < 168h -> ready (past peak but not detraining)
 *   >= 168h        -> detraining
 *
 * Cutting phase adds +12h to all thresholds to account for slower recovery.
 *
 * Uses the most recent of the T1 and T2 dates.
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

  const bonus = phase.mode === "cutting" ? 12 : 0;

  if (hoursSince < 48 + bonus) return "recovering";
  if (hoursSince < 72 + bonus) return "ready";
  if (hoursSince < 120 + bonus) return "primed";
  if (hoursSince < 168 + bonus) return "ready";
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
 * Returns true if the lift hasn't been trained in 14+ days,
 * suggesting a ramp-up protocol at 85% working weight.
 */
export function shouldSuggestRampUp(daysSinceLastSession: number): boolean {
  return daysSinceLastSession >= 14;
}

/**
 * Generates a ramp-up suggestion with weight rounded to the nearest 5 lbs.
 * Used when a lift hasn't been trained in 14+ days.
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
