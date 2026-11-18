// Types for the weekly review. Pure: no React, no database.
import type { RuleId } from "@/lib/evidence";
import type { MetricSource } from "@/lib/metrics/types";
import type { MainLiftId } from "@/lib/liftNames";
import type { PaceWord } from "@/lib/rateOfLoss";
import type { MappingOverrides } from "@/lib/import/mapping/types";
import type { ActivityLog, ImportedSessionRecord } from "@/types";

/**
 * What the review reads: the metrics source plus the non-running activities, which the
 * metrics layer does not carry, and the sessions imported from other apps (history:
 * they count as training for sessions, lift sessions and estimates, and volume; never
 * for effort, readiness, working weight or a new best). `activities` and `imported` may
 * be omitted (treated as none); `overrides` are the remembered name choices.
 */
export type ReviewSource = MetricSource & {
  activities?: ActivityLog[];
  imported?: readonly ImportedSessionRecord[];
  overrides?: MappingOverrides;
};

export interface ReviewOptions {
  /**
   * Sessions a week to compare against; the hook passes Today's
   * `WEEKLY_SESSION_TARGET`. Without it `sessions.target` is null and the
   * sessions takeaway is not written.
   */
  sessionTarget?: number;
}

export interface SessionsReview {
  /** The app's workouts and the imported sessions this week. */
  count: number;
  target: number | null;
  previous: number;
  /** How many of `count` were imported. */
  imported: number;
  /** How many of `previous` were imported. */
  previousImported: number;
}

export interface LiftReview {
  id: MainLiftId;
  label: string;
  /** Best estimated 1RM this week, the app's or an imported session's; null when none. */
  bestE1RM: number | null;
  /** The workout (or imported session) the best came from. */
  bestWorkoutId: string | null;
  /** The best came from an imported session (so it is never a new best). */
  bestImported: boolean;
  /**
   * The home version the best came from (an exercise id), converted into the lift's
   * pounds as the lift chart converts it; null when it is the lift's own. Never a new best.
   */
  bestFrom: string | null;
  /** bestE1RM minus the best of the four weeks before; null when either is missing. */
  e1rmChange: number | null;
  /** The best of the four weeks before, for the label. */
  priorBest: number | null;
  /** bestE1RM is the app's and beats every earlier estimate of the app's (and there was one). */
  isPR: boolean;
  /** T1 working weight as of the end of the week; null before the lift was ever trained. */
  workingWeight: number | null;
  /** workingWeight minus the working weight as of the start of the week. */
  workingWeightChange: number | null;
  /**
   * Workouts and imported sessions this week with a non-warm-up set (any tier) of the
   * lift or one of its home versions (a substitute at home, a stand-in, an imported
   * dumbbell bench).
   */
  sessions: number;
  /** How many of `sessions` had the lift only as a home version. */
  homeSessions: number;
  /** How many of `sessions` were imported. */
  importedSessions: number;
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
  /** Direct hard sets per display group, imported ones included; groups with sets in either week, most first. */
  groups: MuscleVolume[];
  tonnage: number;
  previousTonnage: number;
  /** Imported sessions this week counted in the groups and tonnage. */
  importedSessions: number;
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
  /** Mean reps left (`averageRepsInReserve`) of this week's T1 sets that have one. */
  meanRepsInReserve: number;
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
