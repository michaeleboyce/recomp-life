// Insights: one ranked list of things worth the user's attention, computed by pure
// rules from plain records. Contract stub; the `insights` package implements it and
// may split rules into files under src/lib/insights/, keeping these exports.
import type { RuleId } from "@/lib/evidence";
import type { MetricSource } from "@/lib/metrics/types";
import type { WorkoutSession } from "@/types";

export type InsightKind =
  | "unfinished-workout"
  | "weigh-in-due"
  | "inactivity"
  | "deload"
  | "strength-stall"
  | "loss-rate"
  | "fat-loss-stall"
  | "volume-balance"
  | "pain-check"
  | "new-pr";

/** "action": do something now. "warning": something is off. "info": worth knowing. "positive": good news. */
export type InsightSeverity = "action" | "warning" | "info" | "positive";

export interface Insight {
  /** Stable across recomputation for the same underlying fact, e.g. "deload:squat". */
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  /** A short headline, sentence case, no trailing full stop. */
  title: string;
  /** One or two plain sentences with the numbers that triggered it. */
  body: string;
  /** The coaching rule that explains it, when one exists in the evidence registry. */
  evidenceId?: RuleId;
  action?: { label: string; href: string };
}

export interface InsightContext extends MetricSource {
  /** The most recent unfinished workout started in the last 24 hours, if any. */
  unfinishedWorkout: WorkoutSession | null;
  now: Date;
}

const NOT_IMPLEMENTED = "not implemented: src/lib/insights contract stub";

/**
 * Every insight that currently applies, most important first: by severity
 * (action, warning, info, positive), then by a fixed order of kinds, then by id.
 * Deterministic for a given context.
 */
export function computeInsights(context: InsightContext): Insight[] {
  void context;
  throw new Error(NOT_IMPLEMENTED);
}
