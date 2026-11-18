// Forecasts: models, the rows to store, their status from the log and the track
// record. Pure functions: no React, no database, no clock (callers pass `now`).
// Spec: docs/plans/2026-11-14-glass-box-design.md ("Forecasts").

export type {
  ForecastKindDef,
  ForecastLog,
  ForecastResolver,
  ForecastSource,
  IndexedLog,
  Measurement,
  ScoredForecast,
} from "./types";

export {
  BODYWEIGHT_MODEL,
  CALIBRATION,
  E1RM_HORIZON_MODEL,
  LIFT_OUTLOOK_MODEL,
  MILESTONE_MODEL,
  NEW_BEST_MODEL,
  REPS_MODEL,
  SESSION_LENGTH_MODEL,
  STALL_MODEL,
} from "./coefficients";

export { FORECAST_KINDS, FORECAST_KIND_IDS } from "./registry";

// ── Models ─────────────────────────────────────────────────────────────────
export type {
  LastSetPoint,
  RegimeChange,
  RepsForecast,
  RepsLevel,
  RepsModelInput,
  RepsOutlook,
  RepsRange,
} from "./reps";
export {
  chanceOfAtLeast,
  chanceOfNewBest,
  estimateRepsLevel,
  forecastReps,
  lastT1Sets,
  mostLikelyReps,
  repsIndex,
  repsOutlook,
  repsPmf,
  repsRange,
  stageForReps,
  typicalReps,
  usualEffortCredit,
} from "./reps";

export type { PaceSession, SessionLengthForecast } from "./sessionLength";
export { forecastSessionLength, sessionPaceCorrection, sessionPaceRatios } from "./sessionLength";

export type { HorizonForecast } from "./horizon";
export { e1rmResults, forecastBodyweight, forecastE1RM, weighIns } from "./horizon";

export type {
  LiftOutlook,
  LiftPace,
  MilestoneForecast,
  StallForecast,
  WalkInput,
  WalkResult,
} from "./outlook";
export {
  forecastMilestone,
  forecastStall,
  liftOutlook,
  liftPace,
  nextRoundWeight,
  nextSessionTimes,
  T1_LIFTS,
  walkProgram,
} from "./outlook";

// Shown, never stored: when the last workout's muscles are ready again.
export type { MuscleReadyExplanation, MuscleReadyTime } from "./muscleReady";
export { muscleReadyTimes } from "./muscleReady";

// ── Rows to store ──────────────────────────────────────────────────────────
export {
  BODYWEIGHT_SUBJECT,
  horizonSlot,
  isoWeekUtc,
  makeHorizonForecasts,
  makeSessionForecasts,
  sessionForecastId,
} from "./make";

// ── Status and track record, derived on read ───────────────────────────────
export type { VoidReason } from "./resolve";
export { earliestPerSlot, resolveForecast, VOID_REASONS } from "./resolve";
export { indexLog } from "./logIndex";

export type { CalibrationBin, SdScaleChange, TrackRecord, TrackRecordSplit } from "./score";
export {
  CALIBRATION_BIN_EDGES,
  RANGE_SOURCE_KIND,
  scoreForecasts,
  sdScaleChanges,
  sdScaleFor,
  sdScaleOf,
  sdScales,
  summarize,
  trackRecord,
} from "./score";

export type { ReplayInput, ReplayOptions, ReplayResult } from "./replay";
export { replayForecasts } from "./replay";
