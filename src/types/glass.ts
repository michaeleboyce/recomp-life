/**
 * Shared types for the glass-box coach: decision traces, progression outcomes,
 * forecasts, the adjustment log and readiness. Re-exported from ./index.
 *
 * Rule ids are plain strings here so this file does not import from src/lib;
 * contract tests check that each one names a real evidence rule.
 * Spec: docs/plans/2026-11-14-glass-box-design.md
 */
import type { Stamped, Tier } from "./index";

// ---------------------------------------------------------------------------
// Decision trace: how a planned number was reached
// ---------------------------------------------------------------------------

export type TraceUnit = "lb" | "s" | "reps" | "sets" | "count" | "none";

/** start: the value the trace begins from. add: a signed change. none: checked, no change. */
export type TraceOp = "start" | "add" | "none" | "round" | "set";

export interface TraceStep {
  /** Stable key for the kind of check, e.g. "last-session", "progression", "plates". */
  id: string;
  title: string;
  /** One or two plain sentences, with the numbers that mattered. */
  detail: string;
  effect: { op: TraceOp; value?: number; unit: TraceUnit };
  /** Evidence rule behind this step, when there is one. */
  ruleId?: string;
}

export type DecisionKind = "weight" | "scheme" | "rest" | "substitute" | "accessoryCap";

export interface TraceAlternative {
  label: string;
  value: number;
  note?: string;
}

/** Ordered steps that reproduce one decided value. Applying the effects in order gives `result`. */
export interface DecisionTrace {
  subject: { kind: DecisionKind; exerciseId?: string; tier?: Tier };
  result: number | string;
  unit: TraceUnit;
  steps: TraceStep[];
  alternatives?: TraceAlternative[];
}

/** A trace exactly as it was shown at workout start. Saved once and never re-derived. */
export type StoredTrace = DecisionTrace;

// ---------------------------------------------------------------------------
// Progression outcome: what the program rules did after a workout, and why
// ---------------------------------------------------------------------------

export type ProgressionOutcomeKind =
  | "passed"
  | "stageDown"
  | "reset"
  | "held"
  | "partial"
  | "notDone"
  | "t3Up"
  | "t3Same"
  | "loggedOnly";

export type ProgressionOutcomeReason =
  | "pain"
  | "run"
  | "equipment"
  | "loadDrop"
  | "lastSet"
  | "totalReps"
  | "edited"
  | "heavier";

export interface ProgressionOutcome {
  exerciseId: string;
  tier: "T1" | "T2" | "T3";
  kind: ProgressionOutcomeKind;
  reason?: ProgressionOutcomeReason;
  from: { weight: number; stage?: string };
  to: { weight: number; stage?: string };
  ruleId: string;
}

// ---------------------------------------------------------------------------
// Forecasts: written once before the outcome exists; scored on read
// ---------------------------------------------------------------------------

export type ForecastKind =
  | "amrapReps"
  | "newBest"
  | "liftPass"
  | "sessionLength"
  | "e1rm4w"
  | "bodyweight4w";

/** The measured thing, in raw log terms, so only a log edit can move an outcome. */
export type ForecastEventType =
  | "amrapReps"
  | "repsAtLeast"
  | "e1rmAbove"
  | "durationSeconds"
  | "e1rmLevel"
  | "bodyweightMean";

export interface ForecastEvent {
  type: ForecastEventType;
  /** Weight on the bar the forecast assumed, in lbs. */
  weight?: number;
  /** Rep threshold for "repsAtLeast". */
  reps?: number;
  /**
   * For "e1rmAbove": the estimated max to beat, in lbs. It is the lift's best when the
   * forecast was made, kept on the row so later edits to earlier workouts cannot move
   * the outcome. The event happens when the workout's own estimated max for the lift
   * is above it.
   */
  level?: number;
  /** Days either side of `dueAt` that count as the measurement window. */
  windowDays?: number;
  /** Fewest measurements in the window for a horizon outcome to be scored, fixed when the forecast was made. */
  minResults?: number;
}

export interface ForecastPrediction {
  point: number;
  /** About an 80% range. */
  low?: number;
  high?: number;
  /** For yes/no events: the stated chance, 0 to 1. */
  probability?: number;
  /** pmf[k] = chance of exactly k; the last entry means "that many or more". Sums to 1. */
  pmf?: number[];
  unit: string;
}

/** How much history the forecast stood on. The track record is split by this. */
export type ForecastBasis = "prior" | "persistence" | "trend" | "regime-change";

/** One stored prediction. Write-once: no field changes after it is created. */
export interface Forecast extends Stamped {
  id: string;
  clientId: string;
  /** kind|subject|workout id or ISO week. Readers score the earliest row per slot. */
  slot: string;
  kind: ForecastKind;
  workoutId?: string;
  exerciseId?: string;
  tier?: Tier;
  madeAt: Date;
  dueAt: Date;
  event: ForecastEvent;
  prediction: ForecastPrediction;
  basis: ForecastBasis;
  /** What the model saw: level, scatter, sample size, widening factor, readiness, phase. */
  inputs: Record<string, number | string | null>;
  modelVersion: string;
  synced: boolean;
}

/** Derived from the log on every read. Never stored. */
export type ForecastStatus =
  | { state: "open" }
  | { state: "void"; reason: string }
  | { state: "resolved"; value: number; inside?: boolean; hit?: boolean };

// ---------------------------------------------------------------------------
// Adjustment log
// ---------------------------------------------------------------------------

export type CoachEventKind = "settingsChange" | "advisoryAccepted" | "advisoryDismissed";

/** Stored only for changes that cannot be worked out from the rest of the data. */
export interface CoachEvent extends Stamped {
  id: string;
  clientId: string;
  at: Date;
  kind: CoachEventKind;
  title: string;
  detail: string;
  ruleId?: string;
  data?: Record<string, number | string | null>;
  synced: boolean;
}

export type AdjustmentSource =
  | "progression"
  | "liftAdjustment"
  | "ruleChange"
  | "forecastRevision"
  | "selfCorrection"
  | "override"
  | "coachEvent";

/** One row of the merged, mostly derived adjustment log. */
export interface AdjustmentEntry {
  id: string;
  at: Date;
  source: AdjustmentSource;
  title: string;
  detail: string;
  change?: { from: string; to: string };
  ruleId?: string;
  href?: string;
  /** Present only when a clean inverse exists. */
  undo?: { kind: "liftAdjustment"; adjustmentId: string };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface ReadinessContribution {
  /** Stable key, e.g. "sleep", "stress", "rest-days", "run", "soreness". */
  id: string;
  label: string;
  detail: string;
  /** Signed points. `usual` plus all points equals the score before clamping. */
  points: number;
  ruleId: string;
}

export interface ReadinessScore {
  /** 0 to 100. */
  score: number;
  /** The user's own typical score, the baseline the contributions move. */
  usual: number;
  contributions: ReadinessContribution[];
  /** The only plan change readiness may suggest. It never changes a weight. */
  suggestSkippingAccessories: boolean;
}
