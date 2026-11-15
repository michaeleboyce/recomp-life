// Contracts for the adjustment log. Pure types: no React, no database, no clock.
// The entry itself (`AdjustmentEntry`) lives in src/types/glass.ts.
import type { RebuildResult } from "@/lib/rebuild";
import type {
  AdjustmentEntry,
  CoachEvent,
  EvidenceChange,
  Forecast,
  LiftAdjustment,
  WorkoutSession,
} from "@/types";

/**
 * Everything the adjustment log is assembled from. All of it is data the app already
 * keeps; arrays may be in any order and may hold soft-deleted rows, which are ignored.
 */
export interface AdjustmentFeedInput {
  /** Every workout row: finished or not, deleted or not. */
  workouts: WorkoutSession[];
  /** Every lift adjustment row, deleted or not. */
  adjustments: LiftAdjustment[];
  /**
   * `rebuildDerived` of the same workouts and adjustments. `outcomes` says what the
   * program rules did after each workout; `snapshots` gives the lift states after each
   * one, from which the value a later adjustment replaced is read.
   */
  rebuild: Pick<RebuildResult, "outcomes" | "snapshots">;
  /** Every stored forecast row. */
  forecasts: Forecast[];
  /** Every stored coach event. */
  coachEvents: CoachEvent[];
  /** Rule changes to show. Left out: the app's evidence changelog. */
  changelog?: ReadonlyArray<EvidenceChange>;
}

/** The filter chips of the log. */
export type FeedGroup = "all" | "weights" | "rest" | "forecasts" | "rules";

/**
 * The adjustment that undoes another: what `recordAdjustment` takes, dated when it is
 * recorded. Its `set` holds the values the first adjustment replaced.
 */
export interface AdjustmentUndo {
  exerciseId: string;
  source: "manual";
  set: LiftAdjustment["set"];
  note: string;
}

/**
 * An entry with its place among entries dated the same instant (lower first), so the
 * lines of one workout stay in a fixed order. Internal to the package.
 */
export interface RankedEntry {
  entry: AdjustmentEntry;
  rank: number;
}

/** Where each source sits among entries of the same instant. */
export const SOURCE_RANK = {
  coachEvent: 0,
  progression: 1000,
  override: 2000,
  liftAdjustment: 3000,
  forecastRevision: 4000,
  selfCorrection: 5000,
  ruleChange: 6000,
} as const satisfies Record<AdjustmentEntry["source"], number>;
