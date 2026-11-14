// Types for the weekly review. Pure: no React, no database.
import type { RuleId } from "@/lib/evidence";
import type { MetricSource } from "@/lib/metrics/types";
import type { MainLiftId } from "@/components/Progress/lifts";
import type { PaceWord } from "@/components/Progress/body/bodyMath";
import type { ActivityLog } from "@/types";

/**
 * What the review reads: the metrics source plus the non-running activities, which the
 * metrics layer does not carry. `activities` may be omitted (treated as none).
 */
export type ReviewSource = MetricSource & { activities?: ActivityLog[] };

export interface ReviewOptions {
  /**
   * Sessions a week to compare against; the hook passes Today's
   * `WEEKLY_SESSION_TARGET`. Without it `sessions.target` is null and the
   * sessions takeaway is not written.
   */
  sessionTarget?: number;
}

export interface SessionsReview {
  count: number;
  target: number | null;
  previous: number;
}

export interface LiftReview {
  id: MainLiftId;
  label: string;
  /** Best estimated 1RM logged this week; null when none. */
  bestE1RM: number | null;
  /** The workout the best came from. */
  bestWorkoutId: string | null;
  /** bestE1RM minus the best of the four weeks before; null when either is missing. */
  e1rmChange: number | null;
  /** The best of the four weeks before, for the label. */
  priorBest: number | null;
  /** bestE1RM beats every earlier estimate (and there was an earlier one). */
  isPR: boolean;
  /** T1 working weight as of the end of the week; null before the lift was ever trained. */
  workingWeight: number | null;
  /** workingWeight minus the working weight as of the start of the week. */
  workingWeightChange: number | null;
  /** Workouts this week with a non-warm-up set of the lift (any tier). */
  sessions: number;
}

export interface PRReview {
  liftId: MainLiftId;
  label: string;
  value: number;
  /** value minus the best before it. */
  gain: number;
  workoutId: string | null;
}

export interface BodyweightReview {
  /** 7-day average at the week's last weigh-in. */
  average: number;
  /** average minus the 7-day average at the previous week's last weigh-in. */
  change: number | null;
  /** lbs/week from the `lossRate` metric (negative = losing), when a point falls in the week. */
  weeklyRate: number | null;
  /** Cutting only: how the rate compares with the target. */
  pace: PaceWord | null;
  /** Cutting only: the target band in lbs/week (negative = losing). */
  targetBand: { low: number; high: number } | null;
  weighIns: number;
  cutting: boolean;
}

export interface MuscleVolume {
  group: string;
  sets: number;
  previous: number;
}

export interface VolumeReview {
  /** Direct hard sets per display group; groups with sets in either week, most first. */
  groups: MuscleVolume[];
  tonnage: number;
  previousTonnage: number;
}

export interface CardioTotals {
  count: number;
  miles: number;
  minutes: number;
}

export interface CardioReview {
  runs: CardioTotals;
  activities: CardioTotals;
  previousRuns: CardioTotals;
  previousActivities: CardioTotals;
}

export interface ReadinessReview {
  checkIns: number;
  /** Check-ins at the lowest sleep level ("<5" hours). */
  lowSleep: number;
  /** Check-ins at the lowest stress / energy level ("low"). */
  lowEnergy: number;
}

export interface EffortReview {
  /** Mean RPE of this week's T1 sets that have one. */
  meanRpe: number;
  sets: number;
  /** The same for the previous week; null when none was logged. */
  previous: number | null;
}

export type TakeawayTone = "good" | "warn" | "info";

export interface Takeaway {
  id: string;
  tone: TakeawayTone;
  /** One plain sentence. */
  text: string;
  /** Optional supporting sentence (an insight's body). */
  detail?: string;
  href?: string;
  /** Only ids of `active` evidence rules. */
  evidenceId?: RuleId;
}

export interface WeeklyReview {
  /** Monday 00:00 local. */
  weekStart: Date;
  /** The next Monday 00:00 local (exclusive end). */
  weekEnd: Date;
  /** The week contains `now`. */
  isCurrentWeek: boolean;
  sessions: SessionsReview;
  lifts: LiftReview[];
  prs: PRReview[];
  bodyweight: BodyweightReview | null;
  volume: VolumeReview;
  cardio: CardioReview | null;
  readiness: ReadinessReview | null;
  effort: EffortReview | null;
  takeaways: Takeaway[];
  isEmpty: boolean;
}
