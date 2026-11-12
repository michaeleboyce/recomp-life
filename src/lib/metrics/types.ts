// Types for the metrics layer: every trend the app shows is a Series produced by a
// registered metric from plain records. Pure: no React, no database.
import type {
  BodyweightLog,
  Estimated1RM,
  LiftState,
  PainSorenessEntry,
  ReadinessLog,
  RunLog,
  UserSettings,
  WorkoutSession,
} from "@/types";

export type Unit =
  | "lbs"
  | "lbs/week"
  | "reps"
  | "rpe"
  | "sets"
  | "sessions"
  | "miles"
  | "min"
  | "min/mi"
  | "level";

/** One data point. `t` is epoch milliseconds. */
export interface Point {
  t: number;
  v: number;
  /** Short context for the point inspector, e.g. "225 x 5". */
  label?: string;
  /** Id of the workout, weigh-in or run the point came from, for drill-down. */
  refId?: string;
}

export type MetricId =
  // per lift (params.exerciseId)
  | "e1rm"
  | "workingWeight"
  | "amrapReps"
  | "avgRpe"
  | "liftVolume"
  // per muscle group (params.muscleGroup, a key of calculateGroupVolume)
  | "weeklySets"
  // global
  | "bodyweight"
  | "bodyweight7d"
  | "lossRate"
  | "sessionsPerWeek"
  | "tonnage"
  | "runDistance"
  | "runDuration"
  | "runPace"
  | "runEffort"
  | "sleep"
  | "stress";

export interface MetricParams {
  exerciseId?: string;
  muscleGroup?: string;
}

export interface Series {
  metric: MetricId;
  params: MetricParams;
  /** Oldest first. Never contains NaN or non-finite values. */
  points: Point[];
  unit: Unit;
  /** Which direction counts as improvement, for colouring changes. */
  better: "up" | "down" | "none";
}

/** Everything a metric may read. Arrays may be in any order. */
export interface MetricSource {
  /** Completed workouts only. */
  workouts: WorkoutSession[];
  e1rms: Estimated1RM[];
  bodyweight: BodyweightLog[];
  runs: RunLog[];
  readiness: ReadinessLog[];
  pain: PainSorenessEntry[];
  liftStates: LiftState[];
  settings: UserSettings | null;
}

export interface MetricDef {
  id: MetricId;
  label: string;
  unit: Unit;
  better: "up" | "down" | "none";
  scope: "global" | "lift" | "muscle";
  /** Builds the full series; range filtering and bucketing happen afterwards. */
  compute(source: MetricSource, params: MetricParams): Series;
  /** Formats a value of this metric for display, without the unit. */
  format(value: number): string;
}

export type RangeKey = "4w" | "3m" | "1y" | "all";

export interface SeriesSummary {
  first: Point | null;
  latest: Point | null;
  /** latest.v - first.v; null with fewer than two points. */
  change: number | null;
  /** change as a fraction of first.v; null when change is null or first.v is 0. */
  changePct: number | null;
  min: Point | null;
  max: Point | null;
}
