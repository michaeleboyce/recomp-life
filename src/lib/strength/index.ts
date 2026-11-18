// One strength model for gym and home: every set is evidence about the strength of the
// muscles it works and the program lift it stands in for.
// Spec: docs/plans/2026-11-15-strength-model-design.md (H4, H5, H13, decision 3).
// Research: docs/research/2026-11-strength-transfer.md.

export * from "./types";
export {
  STRENGTH_POOLING,
  TRANSFER_RATIO,
  TRANSFER_PRIORS,
  DROP_SETS,
  TARGET_EVIDENCE,
  MUSCLE_WEIGHTS,
  MUSCLE_INDEX,
  type ProgramLiftId,
  type TransferPrior,
} from "./coefficients";
export {
  loadingOf,
  externalLoad,
  asLifted,
  isEstimateSet,
  setEstimate,
  sessionEstimates,
  targetEstimates,
  latestEstimate,
  compareEstimates,
  type Loading,
} from "./estimate";
export { priorFor, relatedExercises, pairSessions, learnTransferRatio, learnTransferRatios } from "./ratio";
export { pooledLiftEstimate, type PooledEstimateOptions } from "./pooled";
export { volumeCredits, muscleVolume } from "./volume";
export {
  muscleStrengthIndex,
  type MuscleIndexContributor,
  type MuscleIndexPoint,
  type MuscleIndexSession,
  type MuscleStrengthIndex,
} from "./muscleIndex";
export {
  impliedWeightForReps,
  roundDownToPlates,
  roundDownToDumbbell,
  barbellReentryWeight,
  homeReentryWeight,
  type BarbellReentryInput,
  type HomeReentryInput,
  type ReentryResult,
  type ReentryRule,
} from "./reentry";
export {
  TREND_SMOOTHING,
  SMOOTHING_KEYS,
  strengthTimeline,
  muscleTimeline,
  smoothedEstimate,
  pointWeightAt,
  sharesAt,
  weeklyShares,
  gridTimes,
  sumLines,
  type SmoothingKey,
  type TimelineSourceKind,
  type TimelineSource,
  type TimelinePoint,
  type TimelineSubject,
  type StrengthTimeline,
  type TimelineOptions,
  type SmoothOptions,
  type TrendPoint,
  type TrendReason,
  type SmoothedLine,
  type WeekShare,
} from "./timeline";
