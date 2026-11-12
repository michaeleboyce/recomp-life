// PR opportunity and e1RM projection. Pure functions. Contract stub; the `projection`
// package implements it and may split it into files, keeping these exports.
import type { RuleId } from "@/lib/evidence";
import type { MetricSource, Point } from "@/lib/metrics/types";
import type { Tier, TrainingPhase } from "@/types";

const NOT_IMPLEMENTED = "not implemented: src/lib/projection contract stub";

// ── PR opportunity ─────────────────────────────────────────────────────────

export type PrChance = "likely" | "stretch" | "unlikely" | "unknown";

export interface PrOpportunity {
  /** Fewest reps at this weight whose estimate beats the current best. */
  repsNeeded: number;
  /** The estimated 1RM that many reps would give. */
  e1rmAtRepsNeeded: number;
  bestE1RM: number;
  chance: PrChance;
}

/**
 * The fewest reps at `weight` (1..E1RM_MAX_REPS) whose `calculateE1RM` estimate is
 * strictly above `bestE1RM`, with that estimate; null when none does or inputs are
 * not positive.
 */
export function repsToBeat(
  weight: number,
  bestE1RM: number
): { reps: number; e1rm: number } | null {
  void weight;
  void bestE1RM;
  throw new Error(NOT_IMPLEMENTED);
}

/** How reachable `repsNeeded` is given the lift's recent AMRAP rep counts. */
export function prChance(repsNeeded: number, recentAMRAPReps: number[]): PrChance {
  void repsNeeded;
  void recentAMRAPReps;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * The PR opportunity for a set, or null when the set cannot count toward e1RM
 * (see `isE1RMEligibleSet`), when there is no best yet, or when no rep count beats it.
 */
export function describePrOpportunity(input: {
  tier: Tier;
  isAMRAP: boolean;
  weight: number;
  bestE1RM: number | null;
  recentAMRAPReps: number[];
}): PrOpportunity | null {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}

// ── Trend and projection ───────────────────────────────────────────────────

export interface TrendFit {
  /** lbs per week. */
  slopePerWeek: number;
  /** Fitted value at `at`. */
  valueAt(at: number): number;
  /** Standard deviation of the residuals, in lbs. */
  residualSd: number;
  pointsUsed: number;
}

/** Least-squares line through the points; null with fewer than four points. */
export function fitTrend(points: Point[]): TrendFit | null {
  void points;
  throw new Error(NOT_IMPLEMENTED);
}

/** What the lifter is actually doing for one lift, measured from their records. */
export interface ProjectionBaseline {
  exerciseId: string;
  /** Sessions per week in which the lift was trained as T1 or T2, over the window. */
  sessionsPerWeek: number;
  /** Weekly hard sets for the lift's primary muscle group, over the window. */
  weeklySets: number;
  /** Share of T1 sessions for this lift that were passed, 0..1. */
  passRate: number;
  phase: TrainingPhase["mode"];
  /** Weeks of data the measurement used. */
  windowWeeks: number;
}

export function measureBaseline(
  source: MetricSource,
  exerciseId: string,
  now: Date
): ProjectionBaseline {
  void source;
  void exerciseId;
  void now;
  throw new Error(NOT_IMPLEMENTED);
}

/** Any field left out keeps the baseline value. */
export type ProjectionScenario = Partial<
  Pick<ProjectionBaseline, "sessionsPerWeek" | "weeklySets" | "passRate" | "phase">
>;

export interface ProjectedPoint {
  t: number;
  v: number;
  low: number;
  high: number;
}

export interface Projection {
  /** "insufficient-data" when the history has fewer than four points. */
  status: "ok" | "insufficient-data";
  /** One point per week from now to the horizon, starting at week 0. */
  points: ProjectedPoint[];
  /** lbs per week at the start of the projection, after scenario scaling. */
  startingRatePerWeek: number;
  /** Projected change at the horizon relative to today, with its range. */
  gain: { v: number; low: number; high: number };
  /** The evidence rules whose coefficients shaped this projection. */
  evidenceIds: RuleId[];
  /** Plain-language assumptions to print under the chart. */
  assumptions: string[];
}

/**
 * Projects estimated 1RM `weeks` ahead. With an empty scenario this is the current
 * trend continued (with decay); scenario fields scale the rate by dose, adherence and
 * training phase with diminishing returns. The range widens with the horizon.
 */
export function projectE1RM(input: {
  history: Point[];
  baseline: ProjectionBaseline;
  scenario?: ProjectionScenario;
  weeks: number;
  now: Date;
}): Projection {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}
