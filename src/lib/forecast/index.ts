// Forecasts: models, the rows to store, their status from the log and the track
// record. Pure functions: no React, no database, no clock (callers pass `now`).
// Spec: docs/plans/2026-11-14-glass-box-design.md ("Forecasts").

export type {
  ForecastKindDef,
  ForecastLog,
  ForecastResolver,
  ForecastSource,
  ScoredForecast,
} from "./types";

export {
  BODYWEIGHT_MODEL,
  CALIBRATION,
  E1RM_HORIZON_MODEL,
  NEW_BEST_MODEL,
  REPS_MODEL,
  SESSION_LENGTH_MODEL,
} from "./coefficients";

export { FORECAST_KINDS, FORECAST_KIND_IDS } from "./registry";

// ── Models ─────────────────────────────────────────────────────────────────
export type {
  LastSetPoint,
  RegimeChange,
  RepsForecast,
  RepsLevel,
  RepsModelInput,
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
  repsPmf,
  repsRange,
  stageForReps,
  typicalReps,
  usualEffortCredit,
} from "./reps";

export type { SessionLengthForecast } from "./sessionLength";
export { forecastSessionLength, sessionPaceRatios } from "./sessionLength";

export type { HorizonForecast } from "./horizon";
export { e1rmResults, forecastBodyweight, forecastE1RM, weighIns } from "./horizon";

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
