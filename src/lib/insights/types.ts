// Insight types. Re-exported unchanged from ./index (the contract).
import type { RuleId } from "@/lib/evidence";
import type { MetricSource } from "@/lib/metrics/types";
import type { MappingOverrides } from "@/lib/import/mapping/types";
import type { ImportedSessionRecord, WorkoutSession } from "@/types";

export type InsightKind =
  | "unfinished-workout"
  | "left-workout"
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
  /** Older unfinished workouts that have working sets: too old to resume, kept until the user decides. */
  leftWorkouts?: WorkoutSession[];
  /**
   * Sessions imported from other apps (history). Read for recency (inactivity) and the
   * e1RM trend (strength-stall); rules that need what imports lack (per-set outcomes,
   * GZCLP stages, the app's own bests) leave them out. Omitted: none.
   */
  imported?: readonly ImportedSessionRecord[];
  /** The remembered name choices for imported sets. */
  overrides?: MappingOverrides;
  now: Date;
}

/** Display order of kinds within one severity. */
export const KIND_ORDER: readonly InsightKind[] = [
  "unfinished-workout",
  "left-workout",
  "weigh-in-due",
  "inactivity",
  "deload",
  "strength-stall",
  "loss-rate",
  "fat-loss-stall",
  "volume-balance",
  "pain-check",
  "new-pr",
];

export const SEVERITY_ORDER: readonly InsightSeverity[] = ["action", "warning", "info", "positive"];
